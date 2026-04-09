import {
  resolveNotificationChannelsV1FromAccountSettings,
  type AccountSettings,
  type WebhookNotificationChannelV1,
} from '@ks-happier/protocol';

import { logger } from '@/ui/logger';
import type { ActivityNotificationEvent } from './activityNotificationEvent';
import {
  sendExpoPushActivityNotificationAsync,
  type ExpoPushActivityNotificationSender,
} from './sendExpoPushActivityNotification';
import { sendWebhookActivityNotificationAsync } from './sendWebhookActivityNotification';

const DEFAULT_WEBHOOK_CHANNEL_ID = 'builtin:default_webhook';

function resolveDefaultWebhookChannelFromEnv(): WebhookNotificationChannelV1 | null {
  const url = (process.env.HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_URL ?? '').trim();
  if (!url) return null;
  try {
    new URL(url);
  } catch {
    logger.warn(`[activityNotifications] Invalid HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_URL: ${url}`);
    return null;
  }
  const signingSecretValue = (process.env.HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_SECRET ?? '').trim() || null;
  return {
    v: 1,
    id: DEFAULT_WEBHOOK_CHANNEL_ID,
    kind: 'webhook',
    enabled: true,
    url,
    signingSecret: signingSecretValue ? { _isSecretValue: true as const, value: signingSecretValue } : null,
    topics: {
      ready: true,
      permissionRequest: true,
      userActionRequest: true,
    },
    readyIncludeMessageText: true,
  };
}

function isTopicEnabled(channel: {
  enabled: boolean;
  topics: {
    ready: boolean;
    permissionRequest: boolean;
    userActionRequest: boolean;
  };
}, topic: ActivityNotificationEvent['topic']): boolean {
  if (channel.enabled !== true) return false;
  if (topic === 'ready') return channel.topics.ready === true;
  if (topic === 'permission_request') return channel.topics.permissionRequest === true;
  return channel.topics.userActionRequest === true;
}

export async function dispatchActivityNotificationAsync(params: Readonly<{
  settings: AccountSettings | null | undefined;
  settingsSecretsReadKeys?: ReadonlyArray<Uint8Array | null | undefined>;
  event: ActivityNotificationEvent;
  expoPushSender?: ExpoPushActivityNotificationSender | null;
  nowMs?: () => number;
}>): Promise<Readonly<{ attemptedChannels: number; deliveredChannels: number }>> {
  const channels = resolveNotificationChannelsV1FromAccountSettings(params.settings ?? null);
  let attemptedChannels = 0;
  let deliveredChannels = 0;

  for (const channel of channels) {
    if (!isTopicEnabled(channel, params.event.topic)) continue;
    attemptedChannels += 1;
    try {
      if (channel.kind === 'expo_push') {
        if (!params.expoPushSender) continue;
        await sendExpoPushActivityNotificationAsync({
          channel,
          event: params.event,
          sender: params.expoPushSender,
        });
        deliveredChannels += 1;
        continue;
      }

      await sendWebhookActivityNotificationAsync({
        channel,
        event: params.event,
        settingsSecretsReadKeys: params.settingsSecretsReadKeys,
        nowMs: params.nowMs,
      });
      deliveredChannels += 1;
    } catch (error) {
      logger.debug('[activityNotifications] Failed to dispatch outbound notification', error);
    }
  }

  // Handle default webhook channel from environment variable
  const defaultWebhookChannel = resolveDefaultWebhookChannelFromEnv();
  if (defaultWebhookChannel && isTopicEnabled(defaultWebhookChannel, params.event.topic)) {
    attemptedChannels += 1;
    try {
      await sendWebhookActivityNotificationAsync({
        channel: defaultWebhookChannel,
        event: params.event,
        settingsSecretsReadKeys: params.settingsSecretsReadKeys,
        nowMs: params.nowMs,
      });
      deliveredChannels += 1;
    } catch (error) {
      logger.debug('[activityNotifications] Failed to dispatch default webhook notification', error);
    }
  }

  return {
    attemptedChannels,
    deliveredChannels,
  };
}
