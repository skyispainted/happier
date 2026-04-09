import { createHmac } from "node:crypto";
import { log } from "@/utils/logging/log";

/**
 * Activity notification event types received from CLI daemon.
 */
export type ActivityNotificationEvent =
  | Readonly<{
    topic: 'ready';
    sessionId: string;
    sessionTitle?: string | null;
    waitingForCommandLabel: string;
    assistantPreviewText?: string | null;
  }>
  | Readonly<{
    topic: 'permission_request' | 'user_action_request';
    sessionId: string;
    sessionTitle?: string | null;
    requestId: string;
    toolName: string;
    toolDetails?: string | null;
  }>;

/**
 * Webhook payload sent to external service.
 */
interface WebhookPayload {
  v: 1;
  channelId: string;
  createdAt: number;
  topic: ActivityNotificationEvent['topic'];
  content: {
    title: string;
    body: string;
  };
  session: {
    sessionId: string;
    title: string | null;
  };
  request: {
    requestId: string;
    kind: 'permission' | 'user_action';
    toolName: string;
    toolDetails: string | null;
  } | null;
  navigation: {
    sessionId: string;
    requestId?: string;
  };
}

/**
 * Resolves default webhook configuration from environment variables.
 */
function resolveDefaultWebhookConfig(): { url: string; signingSecret: string | null } | null {
  const url = (process.env.HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_URL ?? '').trim();
  if (!url) return null;

  try {
    new URL(url);
  } catch {
    log({ module: 'activity-webhook', level: 'warn' }, `Invalid HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_URL: ${url}`);
    return null;
  }

  const signingSecret = (process.env.HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_SECRET ?? '').trim() || null;
  return { url, signingSecret };
}

/**
 * Builds notification content from event.
 */
function buildNotificationContent(event: ActivityNotificationEvent): { title: string; body: string; toolDetails?: string | null } {
  if (event.topic === 'ready') {
    const title = event.sessionTitle ?? event.waitingForCommandLabel;
    const body = event.assistantPreviewText
      ? event.assistantPreviewText
      : `${event.waitingForCommandLabel} is waiting for your command`;
    return { title, body };
  }

  // permission_request or user_action_request
  const title = event.topic === 'permission_request'
    ? 'Permission Request'
    : 'User Action Required';
  const body = event.toolDetails
    ? `${event.toolName}: ${event.toolDetails}`
    : `Agent wants to use: ${event.toolName}`;
  return { title, body, toolDetails: event.toolDetails };
}

/**
 * Builds webhook payload from event.
 */
function buildWebhookPayload(event: ActivityNotificationEvent, nowMs: number): WebhookPayload {
  const content = buildNotificationContent(event);
  return {
    v: 1,
    channelId: 'builtin:default_webhook',
    createdAt: nowMs,
    topic: event.topic,
    content: {
      title: content.title,
      body: content.body,
    },
    session: {
      sessionId: event.sessionId,
      title: event.sessionTitle ?? null,
    },
    request: event.topic === 'ready'
      ? null
      : {
        requestId: event.requestId,
        kind: event.topic === 'user_action_request' ? 'user_action' : 'permission',
        toolName: event.toolName,
        toolDetails: content.toolDetails ?? null,
      },
    navigation: {
      sessionId: event.sessionId,
      ...(event.topic !== 'ready' ? { requestId: event.requestId } : {}),
    },
  };
}

/**
 * Sends webhook notification to configured URL.
 */
async function sendWebhookNotificationAsync(
  url: string,
  signingSecret: string | null,
  payload: WebhookPayload,
): Promise<void> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (signingSecret) {
    headers['x-happier-signature-256'] = `sha256=${createHmac('sha256', signingSecret).update(body).digest('hex')}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(`Webhook notification failed with status ${response.status}`);
  }
}

/**
 * Dispatches activity notification to default webhook configured via environment.
 */
export async function dispatchActivityWebhookNotificationAsync(event: ActivityNotificationEvent): Promise<boolean> {
  const config = resolveDefaultWebhookConfig();
  if (!config) return false;

  const nowMs = Date.now();
  const payload = buildWebhookPayload(event, nowMs);

  try {
    await sendWebhookNotificationAsync(config.url, config.signingSecret, payload);
    log(
      { module: 'activity-webhook', sessionId: event.sessionId },
      `Webhook notification sent: topic=${event.topic}`,
    );
    return true;
  } catch (error) {
    log(
      { module: 'activity-webhook', level: 'warn', sessionId: event.sessionId },
      `Failed to send webhook notification: ${error}`,
    );
    return false;
  }
}