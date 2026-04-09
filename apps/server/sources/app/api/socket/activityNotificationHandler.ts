import { Socket } from "socket.io";
import { ClientConnection } from "@/app/events/eventRouter";
import { dispatchActivityWebhookNotificationAsync, type ActivityNotificationEvent } from "@/app/activity/dispatchActivityWebhook";
import { websocketEventsCounter } from "@/app/monitoring/metrics2";
import { log } from "@/utils/logging/log";

/**
 * Handles activity-notification socket events from CLI daemon.
 *
 * CLI sends these events when:
 * - Agent finishes responding and waits for user input (ready)
 * - Agent requests permission for tool execution (permission_request)
 * - Agent requires user action (user_action_request)
 *
 * Server forwards these to configured webhook URL via environment variables:
 * - HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_URL
 * - HAPPIER_DEFAULT_NOTIFICATION_WEBHOOK_SECRET
 */
export function activityNotificationHandler(userId: string, socket: Socket, connection: ClientConnection) {
    socket.on('activity-notification', async (data: ActivityNotificationEvent) => {
        try {
            websocketEventsCounter.inc({ event_type: 'activity-notification' });

            // Validate required fields
            if (!data?.topic || !data?.sessionId) {
                log({ module: 'websocket', level: 'warn' }, 'Invalid activity-notification payload: missing topic or sessionId');
                return;
            }

            // Only session-scoped or machine-scoped connections can send activity notifications
            if (connection.connectionType !== 'session-scoped' && connection.connectionType !== 'machine-scoped') {
                log(
                    { module: 'websocket', level: 'warn', userId, connectionType: connection.connectionType },
                    'activity-notification rejected: invalid connection type',
                );
                return;
            }

            // Session-scoped connections must match the session ID
            if (connection.connectionType === 'session-scoped' && connection.sessionId !== data.sessionId) {
                log(
                    { module: 'websocket', level: 'warn', userId, sessionId: data.sessionId, connectionSessionId: connection.sessionId },
                    'activity-notification rejected: sessionId mismatch',
                );
                return;
            }

            await dispatchActivityWebhookNotificationAsync(data);
        } catch (error) {
            log({ module: 'websocket', level: 'error' }, `Error in activity-notification handler: ${error}`);
        }
    });
}