import { z } from "zod";
import { createHmac } from "node:crypto";
import { type Fastify } from "../../types";
import { db } from "@/storage/db";
import { log } from "@/utils/logging/log";
import {
    buildActivityWebhookPayload,
    type ActivityWebhookTopic,
    type ActivityWebhookPayloadV1,
} from "@happier-dev/protocol";
import { resolveEffectiveAccountEncryptionModeFromAccountRow } from "@/app/encryption/accountEncryptionMode";
import { openPlainAccountSettingsDbValue } from "@/app/encryption/accountSettingsStorage";

// Request schema for webhook dispatch
const WebhookDispatchRequestSchema = z.object({
    sessionId: z.string().trim().min(1),
    sessionTitle: z.string().nullable().optional(),
    event: z.discriminatedUnion("topic", [
        z.object({
            topic: z.literal("ready"),
            waitingForCommandLabel: z.string(),
            assistantPreviewText: z.string().nullable().optional(),
        }),
        z.object({
            topic: z.literal("permission_request"),
            requestId: z.string(),
            toolName: z.string(),
            toolInput: z.unknown().optional(),
            toolDetails: z.string().nullable().optional(),
        }),
        z.object({
            topic: z.literal("user_action_request"),
            requestId: z.string(),
            toolName: z.string(),
            toolInput: z.unknown().optional(),
            toolDetails: z.string().nullable().optional(),
        }),
    ]),
    channels: z.array(z.object({
        id: z.string(),
        url: z.string().url(),
        enabled: z.boolean(),
        topics: z.object({
            ready: z.boolean(),
            permissionRequest: z.boolean(),
            userActionRequest: z.boolean(),
        }),
        readyIncludeMessageText: z.boolean().optional(),
    })),
});

type WebhookDispatchRequest = z.infer<typeof WebhookDispatchRequestSchema>;

// Response schema
const WebhookDispatchResponseSchema = z.object({
    success: z.literal(true),
    dispatched: z.number(),
    failed: z.number(),
});

const WebhookDispatchErrorResponseSchema = z.object({
    success: z.literal(false),
    error: z.string(),
});

function buildNotificationContent(
    event: WebhookDispatchRequest["event"],
    options: { readyIncludeMessageText: boolean },
): { title: string; body: string; toolDetails?: string | null } {
    if (event.topic === "ready") {
        const label = event.waitingForCommandLabel;
        return {
            title: event.sessionTitle ?? label,
            body: `${label} is waiting for your command`,
        };
    }

    // permission_request or user_action_request
    const kind = event.topic === "user_action_request" ? "user_action" : "permission";
    const toolDetails = event.toolDetails ?? null;
    return {
        title: kind === "user_action" ? "User Action Required" : "Permission Request",
        body: `Approval needed for: ${event.toolName}${toolDetails ? `\n${toolDetails}` : ""}`,
        toolDetails,
    };
}

function isTopicEnabledForChannel(
    channel: WebhookDispatchRequest["channels"][number],
    topic: ActivityWebhookTopic,
): boolean {
    if (!channel.enabled) return false;
    if (topic === "ready") return channel.topics.ready;
    if (topic === "permission_request") return channel.topics.permissionRequest;
    return channel.topics.userActionRequest;
}

async function sendWebhookNotification(params: {
    channel: WebhookDispatchRequest["channels"][number];
    payload: ActivityWebhookPayloadV1;
    signingSecret: string | null;
}): Promise<{ success: boolean; error?: string }> {
    const { channel, payload, signingSecret } = params;
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
        "content-type": "application/json",
    };

    if (signingSecret) {
        const signature = createHmac("sha256", signingSecret).update(body).digest("hex");
        headers["x-happier-signature-256"] = `sha256=${signature}`;
    }

    try {
        const response = await fetch(channel.url, {
            method: "POST",
            headers,
            body,
        });

        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return { success: false, error: message };
    }
}

async function resolveSigningSecret(params: {
    accountId: string;
    channelId: string;
}): Promise<string | null> {
    const { accountId, channelId } = params;

    // Get account to check encryption mode
    const account = await db.account.findUnique({
        where: { id: accountId },
        select: {
            settings: true,
            publicKey: true,
            encryptionMode: true,
        },
    });

    if (!account) {
        log({ module: "webhook-dispatch", level: "warn" }, `Account not found: ${accountId}`);
        return null;
    }

    const mode = resolveEffectiveAccountEncryptionModeFromAccountRow(account);

    // Only plain accounts can have their signingSecret read by server
    if (mode !== "plain") {
        log({ module: "webhook-dispatch" }, `Cannot read signingSecret for E2EE account: ${accountId}`);
        return null;
    }

    // Parse settings
    const settings = openPlainAccountSettingsDbValue({
        accountId,
        dbValue: account.settings,
    });

    if (!settings || settings.t !== "plain") {
        return null;
    }

    // Find the webhook channel in settings
    const settingsObj = settings.v as Record<string, unknown> | null;
    if (!settingsObj || typeof settingsObj !== "object") {
        return null;
    }

    const channels = settingsObj.notificationChannelsV1;
    if (!Array.isArray(channels)) {
        return null;
    }

    const channel = channels.find(
        (c) => c && typeof c === "object" && "id" in c && c.id === channelId && "kind" in c && c.kind === "webhook",
    );

    if (!channel || typeof channel !== "object") {
        return null;
    }

    const signingSecret = (channel as Record<string, unknown>).signingSecret;
    if (!signingSecret || typeof signingSecret !== "object") {
        return null;
    }

    // Check if there's a plaintext value
    const secretObj = signingSecret as Record<string, unknown>;
    if (typeof secretObj.value === "string" && secretObj.value.trim()) {
        return secretObj.value.trim();
    }

    // For plain accounts, encryptedValue should be rare, but handle it
    return null;
}

export function webhookRoutes(app: Fastify) {
    app.post("/v1/webhooks/dispatch", {
        preHandler: app.authenticate,
        schema: {
            body: WebhookDispatchRequestSchema,
            response: {
                200: WebhookDispatchResponseSchema,
                400: WebhookDispatchErrorResponseSchema,
                500: WebhookDispatchErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId, sessionTitle, event, channels } = request.body;

        // Filter channels that are enabled for this topic
        const enabledChannels = channels.filter((c) => isTopicEnabledForChannel(c, event.topic));

        if (enabledChannels.length === 0) {
            return reply.send({
                success: true,
                dispatched: 0,
                failed: 0,
            });
        }

        // Get user info for webhook payload
        const account = await db.account.findUnique({
            where: { id: userId },
            select: { username: true },
        });

        const accountInfo = account ? {
            accountId: userId,
            username: account.username,
        } : {
            accountId: userId,
            username: null,
        };

        let dispatched = 0;
        let failed = 0;

        // Send webhooks in parallel
        const results = await Promise.allSettled(
            enabledChannels.map(async (channel) => {
                // Build notification content
                const content = buildNotificationContent(event, {
                    readyIncludeMessageText: channel.readyIncludeMessageText ?? true,
                });

                // Build payload
                const payload = buildActivityWebhookPayload({
                    channelId: channel.id,
                    createdAt: Date.now(),
                    topic: event.topic,
                    content: {
                        title: content.title,
                        body: content.body,
                    },
                    session: {
                        sessionId,
                        title: sessionTitle,
                    },
                    account: accountInfo,
                    request: event.topic === "ready"
                        ? null
                        : {
                            requestId: event.requestId,
                            kind: event.topic === "user_action_request" ? "user_action" : "permission",
                            toolName: event.toolName,
                            toolDetails: content.toolDetails,
                        },
                });

                // Resolve signing secret from server-side settings
                const signingSecret = await resolveSigningSecret({
                    accountId: userId,
                    channelId: channel.id,
                });

                // Send webhook
                return sendWebhookNotification({
                    channel,
                    payload,
                    signingSecret,
                });
            }),
        );

        for (const result of results) {
            if (result.status === "fulfilled" && result.value.success) {
                dispatched++;
            } else {
                failed++;
                const error = result.status === "fulfilled" ? result.value.error : result.reason;
                log(
                    { module: "webhook-dispatch", level: "warn" },
                    `Webhook dispatch failed: ${error}`,
                );
            }
        }

        return reply.send({
            success: true,
            dispatched,
            failed,
        });
    });
}