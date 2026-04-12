import {
  buildActivityWebhookPayload,
  type WebhookNotificationChannelV1,
  type ActivityWebhookPayloadV1,
} from '@happier-dev/protocol';

import type { ActivityNotificationEvent } from './activityNotificationEvent';
import { buildActivityNotificationContent } from './buildActivityNotificationContent';
import { configuration } from '@/configuration';
import { readCredentials } from '@/persistence';
import { logger } from '@/ui/logger';

type WebhookDispatchChannel = {
  id: string;
  url: string;
  enabled: boolean;
  topics: {
    ready: boolean;
    permissionRequest: boolean;
    userActionRequest: boolean;
  };
  readyIncludeMessageText?: boolean;
};

type WebhookDispatchRequest = {
  sessionId: string;
  sessionTitle?: string | null;
  event: ActivityNotificationEvent;
  channels: WebhookDispatchChannel[];
};

type WebhookDispatchResponse = {
  success: boolean;
  dispatched: number;
  failed: number;
};

async function dispatchWebhookViaServer(params: {
  request: WebhookDispatchRequest;
}): Promise<{ success: boolean; dispatched: number; failed: number }> {
  const { request } = params;

  // Get credentials for authentication
  const credentials = await readCredentials();
  if (!credentials) {
    logger.debug('[webhook] No credentials available for webhook dispatch');
    return { success: false, dispatched: 0, failed: 0 };
  }

  const serverUrl = configuration.apiServerUrl.replace(/\/+$/, '');
  const url = `${serverUrl}/v1/webhooks/dispatch`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${credentials.token}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      logger.debug(`[webhook] Server dispatch failed with status ${response.status}`);
      return { success: false, dispatched: 0, failed: request.channels.length };
    }

    const result = (await response.json()) as WebhookDispatchResponse;
    return {
      success: result.success,
      dispatched: result.dispatched,
      failed: result.failed,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.debug(`[webhook] Server dispatch error: ${message}`);
    return { success: false, dispatched: 0, failed: request.channels.length };
  }
}

export async function sendWebhookActivityNotificationAsync(params: Readonly<{
  channel: WebhookNotificationChannelV1;
  event: ActivityNotificationEvent;
  settingsSecretsReadKeys?: ReadonlyArray<Uint8Array | null | undefined>;
  nowMs?: () => number;
}>): Promise<void> {
  // Build notification content
  const built = buildActivityNotificationContent(params.event, {
    readyIncludeMessageText: params.channel.readyIncludeMessageText !== false,
  });

  // Prepare channel for server dispatch (without signingSecret)
  const dispatchChannel: WebhookDispatchChannel = {
    id: params.channel.id,
    url: params.channel.url,
    enabled: params.channel.enabled,
    topics: params.channel.topics,
    readyIncludeMessageText: params.channel.readyIncludeMessageText,
  };

  // Prepare request for server
  const request: WebhookDispatchRequest = {
    sessionId: params.event.sessionId,
    sessionTitle: params.event.sessionTitle ?? null,
    event: params.event,
    channels: [dispatchChannel],
  };

  // Dispatch via server
  const result = await dispatchWebhookViaServer({ request });

  if (!result.success || result.failed > 0) {
    throw new Error(`Webhook notification failed: dispatched=${result.dispatched}, failed=${result.failed}`);
  }
}

/**
 * Dispatch multiple webhook notifications via server.
 * This is more efficient than calling sendWebhookActivityNotificationAsync multiple times.
 */
export async function dispatchWebhookNotificationsAsync(params: Readonly<{
  sessionId: string;
  sessionTitle?: string | null;
  event: ActivityNotificationEvent;
  channels: ReadonlyArray<WebhookNotificationChannelV1>;
}>): Promise<{ dispatched: number; failed: number }> {
  // NOTE: We always call the server even with empty channels.
  // The server is responsible for injecting the default webhook channel.

  // Prepare channels for server dispatch (without signingSecret)
  const dispatchChannels: WebhookDispatchChannel[] = params.channels.map((channel) => ({
    id: channel.id,
    url: channel.url,
    enabled: channel.enabled,
    topics: channel.topics,
    readyIncludeMessageText: channel.readyIncludeMessageText,
  }));

  // Prepare request for server
  const request: WebhookDispatchRequest = {
    sessionId: params.sessionId,
    sessionTitle: params.sessionTitle ?? null,
    event: params.event,
    channels: dispatchChannels,
  };

  // Dispatch via server
  const result = await dispatchWebhookViaServer({ request });
  return {
    dispatched: result.dispatched,
    failed: result.failed,
  };
}