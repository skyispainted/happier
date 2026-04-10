import { z } from "zod";
import { createHmac } from "node:crypto";
import http from "node:http";
import https from "node:https";
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

// Built-in default webhook from environment variables
const DEFAULT_WEBHOOK_URL = process.env.HAPPIER_DEFAULT_WEBHOOK_URL?.trim() || "";
const DEFAULT_WEBHOOK_SECRET = process.env.HAPPIER_DEFAULT_WEBHOOK_SIGNING_SECRET?.trim() || "";
const DEFAULT_WEBHOOK_ENABLED = process.env.HAPPIER_DEFAULT_WEBHOOK_ENABLED !== "false";

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
        const sessionTitle = event.sessionTitle;
        const previewText = options.readyIncludeMessageText ? event.assistantPreviewText ?? null : null;
        return {
            title: sessionTitle ?? event.waitingForCommandLabel,
            body: previewText ?? `${event.waitingForCommandLabel} is ready`,
        };
    }

    const kind = event.topic === "user_action_request" ? "user_action" : "permission";
    const toolDetails = event.toolDetails ?? null;
    return {
        title: event.toolName,
        body: `${kind === "user_action" ? "需要执行" : "需要审批"}: ${event.toolName}${toolDetails ? `\n${toolDetails}` : ""}`,
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

function getDefaultWebhookChannel(): WebhookDispatchRequest["channels"][number] | null {
    if (!DEFAULT_WEBHOOK_URL || !DEFAULT_WEBHOOK_ENABLED) return null;
    return {
        id: "builtin:default",
        url: DEFAULT_WEBHOOK_URL,
        enabled: true,
        topics: { ready: true, permissionRequest: true, userActionRequest: true },
        readyIncludeMessageText: true,
    };
}

function sendWebhook(params: {
    url: string;
    body: string;
    headers: Record<string, string>;
}): Promise<{ success: boolean; status?: number; error?: string }> {
    const { url, body, headers } = params;
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const agent = isHttps ? https.globalAgent : http.globalAgent;

    return new Promise((resolve) => {
        log({ module: "webhook-dispatch" }, `=== WEBHOOK REQUEST ===`);
        log({ module: "webhook-dispatch" }, `URL: ${url}`);
        log({ module: "webhook-dispatch" }, `Method: POST`);
        log({ module: "webhook-dispatch" }, `Headers: ${JSON.stringify(headers)}`);
        log({ module: "webhook-dispatch" }, `Body length: ${body.length} bytes`);
        log({ module: "webhook-dispatch" }, `=== END REQUEST ===`);

        const req = (isHttps ? https : http).request({
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: "POST",
            headers,
            agent,
            timeout: 10_000,
        });

        req.on("response", (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                log({ module: "webhook-dispatch" }, `=== WEBHOOK RESPONSE ===`);
                log({ module: "webhook-dispatch" }, `Status: ${res.statusCode}`);
                log({ module: "webhook-dispatch" }, `Response data (first 200): ${data.substring(0, 200)}`);
                log({ module: "webhook-dispatch" }, `=== END RESPONSE ===`);

                if (res.statusCode != null && res.statusCode >= 400) {
                    resolve({ success: false, status: res.statusCode, error: `HTTP ${res.statusCode}` });
                } else {
                    resolve({ success: true, status: res.statusCode });
                }
            });
            res.on("error", (err) => {
                log({ module: "webhook-dispatch", level: "warn" }, `Response error: ${err.message}`);
                resolve({ success: false, error: err.message });
            });
        });

        req.on("error", (err) => {
            log({ module: "webhook-dispatch", level: "warn" }, `=== WEBHOOK ERROR ===`);
            log({ module: "webhook-dispatch", level: "warn" }, `Error: ${err.message}`);
            log({ module: "webhook-dispatch", level: "warn" }, `Code: ${err.code}`);
            log({ module: "webhook-dispatch", level: "warn" }, `=== END ERROR ===`);
            resolve({ success: false, error: err.message });
        });

        req.on("timeout", () => {
            req.destroy();
            resolve({ success: false, error: "Request timeout" });
        });

        req.write(body);
        req.end();
    });
}

async function sendWebhookNotification(params: {
    url: string;
    payload: ActivityWebhookPayloadV1;
    signingSecret: string | null;
}): Promise<{ success: boolean; error?: string }> {
    const { url, payload, signingSecret } = params;
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body)),
    };

    if (signingSecret) {
        const signature = createHmac("sha256", signingSecret).update(body).digest("hex");
        headers["x-happier-signature-256"] = `sha256=${signature}`;
    }

    const result = await sendWebhook({ url, body, headers });
    return { success: result.success, error: result.error };
}

async function resolveSigningSecret(params: {
    accountId: string;
    channelId: string;
}): Promise<string | null> {
    const { accountId, channelId } = params;

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

    if (mode !== "plain") {
        log({ module: "webhook-dispatch" }, `Cannot read signingSecret for E2EE account: ${accountId}`);
        return null;
    }

    const settings = openPlainAccountSettingsDbValue({
        accountId,
        dbValue: account.settings,
    });

    if (!settings || settings.t !== "plain") return null;

    const settingsObj = settings.v as Record<string, unknown> | null;
    if (!settingsObj || typeof settingsObj !== "object") return null;

    const channels = settingsObj.notificationChannelsV1;
    if (!Array.isArray(channels)) return null;

    const channel = channels.find(
        (c) => c && typeof c === "object" && "id" in c && c.id === channelId && "kind" in c && c.kind === "webhook",
    );

    if (!channel || typeof channel !== "object") return null;

    const signingSecret = (channel as Record<string, unknown>).signingSecret;
    if (!signingSecret || typeof signingSecret !== "object") return null;

    const secretObj = signingSecret as Record<string, unknown>;
    if (typeof secretObj.value === "string" && secretObj.value.trim()) {
        return secretObj.value.trim();
    }

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

        // Combine user channels with default webhook
        const allChannels = [...channels];
        const defaultChannel = getDefaultWebhookChannel();
        if (defaultChannel) {
            const alreadyPresent = channels.some((c) => c.url === defaultChannel.url);
            if (!alreadyPresent) {
                allChannels.push(defaultChannel);
            }
        }

        const enabledChannels = allChannels.filter((c) => isTopicEnabledForChannel(c, event.topic));

        if (enabledChannels.length === 0) {
            return reply.send({ success: true, dispatched: 0, failed: 0 });
        }

        const account = await db.account.findUnique({
            where: { id: userId },
            select: { username: true, firstName: true, lastName: true },
        });

        const displayName = account?.firstName && account?.lastName
            ? `${account.firstName} ${account.lastName}`
            : account?.firstName || account?.lastName || account?.username || userId;

        let dispatched = 0;
        let failed = 0;

        const results = await Promise.allSettled(
            enabledChannels.map(async (channel) => {
                const content = buildNotificationContent(event, {
                    readyIncludeMessageText: channel.readyIncludeMessageText ?? true,
                });

                const payload = buildActivityWebhookPayload({
                    channelId: channel.id,
                    createdAt: Date.now(),
                    topic: event.topic,
                    content: { title: content.title, body: content.body },
                    session: { sessionId, title: sessionTitle },
                    metadata: {
                        accountId: userId,
                        username: account?.username || null,
                        displayName,
                        assistantPreviewText: event.topic === "ready" ? event.assistantPreviewText ?? null : null,
                    },
                    request:
                        event.topic === "ready"
                            ? null
                            : {
                                requestId: event.requestId,
                                kind: event.topic === "user_action_request" ? "user_action" : "permission",
                                toolName: event.toolName,
                                toolDetails: content.toolDetails,
                            },
                });

                const signingSecret =
                    channel.id === "builtin:default"
                        ? DEFAULT_WEBHOOK_SECRET || null
                        : await resolveSigningSecret({ accountId: userId, channelId: channel.id });

                const body = JSON.stringify(payload);
                const headers: Record<string, string> = {
                    "content-type": "application/json",
                    "content-length": String(Buffer.byteLength(body)),
                };

                if (signingSecret) {
                    const signature = createHmac("sha256", signingSecret).update(body).digest("hex");
                    headers["x-happier-signature-256"] = `sha256=${signature}`;
                }

                return sendWebhook({ url: channel.url, body, headers });
            }),
        );

        for (const result of results) {
            if (result.status === "fulfilled" && result.value.success) {
                dispatched++;
            } else {
                failed++;
                const error = result.status === "fulfilled" ? result.value.error : result.reason;
                log({ module: "webhook-dispatch", level: "warn" }, `Webhook dispatch failed: ${error}`);
            }
        }

        return reply.send({ success: true, dispatched, failed });
    });
}
