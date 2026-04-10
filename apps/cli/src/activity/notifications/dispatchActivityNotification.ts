import {
  resolveNotificationChannelsV1FromAccountSettings,
  type AccountSettings,
  type WebhookNotificationChannelV1,
  type ExpoPushNotificationChannelV1,
} from '@happier-dev/protocol';

import { logger } from '@/ui/logger';
import type { ActivityNotificationEvent } from './activityNotificationEvent';
import {
  sendExpoPushActivityNotificationAsync,
  type ExpoPushActivityNotificationSender,
} from './sendExpoPushActivityNotification';
import {
  sendWebhookActivityNotificationAsync,
  dispatchWebhookNotificationsAsync,
} from './sendWebhookActivityNotification';

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

  // Separate expo_push and webhook channels
  const expoPushChannels = channels.filter((c): c is ExpoPushNotificationChannelV1 =>
    c.kind === 'expo_push' && isTopicEnabled(c, params.event.topic),
  );
  const webhookChannels = channels.filter((c): c is WebhookNotificationChannelV1 =>
    c.kind === 'webhook' && isTopicEnabled(c, params.event.topic),
  );

  // Handle Expo push notifications (existing logic)
  for (const channel of expoPushChannels) {
    if (!params.expoPushSender) continue;
    attemptedChannels += 1;
    try {
      await sendExpoPushActivityNotificationAsync({
        channel,
        event: params.event,
        sender: params.expoPushSender,
      });
      deliveredChannels += 1;
    } catch (error) {
      logger.debug('[activityNotifications] Failed to dispatch expo push notification', error);
    }
  }

  // Handle webhook notifications via server (new logic)
  if (webhookChannels.length > 0) {
    attemptedChannels += webhookChannels.length;
    try {
      const result = await dispatchWebhookNotificationsAsync({
        sessionId: params.event.sessionId,
        sessionTitle: params.event.sessionTitle,
        event: params.event,
        channels: webhookChannels,
      });
      deliveredChannels += result.dispatched;
    } catch (error) {
      logger.debug('[activityNotifications] Failed to dispatch webhook notifications via server', error);
    }
  }

  return {
    attemptedChannels,
    deliveredChannels,
  };
}