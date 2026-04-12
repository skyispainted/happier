import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  accountSettingsParse,
} from '@happier-dev/protocol';

import { dispatchActivityNotificationAsync } from './dispatchActivityNotification';

// Mock the persistence module
vi.mock('@/persistence', () => ({
  readCredentials: vi.fn(async () => ({ token: 'test-token', encryption: { type: 'legacy', secret: new Uint8Array(32) } })),
}));

// Mock the configuration module
vi.mock('@/configuration', () => ({
  configuration: {
    apiServerUrl: 'https://api.test.local',
  },
}));

describe('dispatchActivityNotificationAsync', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchSpy);
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, dispatched: 1, failed: 0 }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to the builtin expo push channel when explicit channels are missing', async () => {
    const sendToAllDevicesAsync = vi.fn(async () => {});
    const settings = accountSettingsParse({
      notificationsSettingsV1: {
        v: 1,
        pushEnabled: true,
        ready: true,
        readyIncludeMessageText: true,
        permissionRequest: true,
        userActionRequest: true,
        foregroundBehavior: 'full',
      },
    });

    await dispatchActivityNotificationAsync({
      settings,
      expoPushSender: { sendToAllDevicesAsync },
      event: {
        topic: 'ready',
        sessionId: 'session-1',
        sessionTitle: 'Review branch',
        waitingForCommandLabel: 'Codex',
        assistantPreviewText: 'The branch is ready to review.',
      },
    });

    expect(sendToAllDevicesAsync).toHaveBeenCalledWith(
      'Review branch',
      'The branch is ready to review.',
      { sessionId: 'session-1' },
    );
    // Server is always called (even with empty channels, server injects default)
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] ?? [];
    const body = JSON.parse(String(init.body));
    expect(body.channels).toHaveLength(0); // CLI sends no channels; server injects default
    expect(body.event.topic).toBe('ready');

    // Expo push is called
    expect(sendToAllDevicesAsync).toHaveBeenCalledWith(
      'Review branch',
      'The branch is ready to review.',
      { sessionId: 'session-1' },
    );
  });

  it('dispatches webhook notifications via server API', async () => {
    const sendToAllDevicesAsync = vi.fn(async () => {});
    const settings = accountSettingsParse({
      notificationChannelsV1: [
        {
          v: 1,
          id: 'webhook-primary',
          kind: 'webhook',
          enabled: true,
          url: 'https://hooks.example.test/happier',
          signingSecret: {
            _isSecretValue: true,
            value: 'webhook-secret',
          },
          topics: {
            ready: true,
            permissionRequest: true,
            userActionRequest: true,
          },
          readyIncludeMessageText: false,
        },
      ],
    });

    await dispatchActivityNotificationAsync({
      settings,
      expoPushSender: { sendToAllDevicesAsync },
      event: {
        topic: 'ready',
        sessionId: 'session-2',
        sessionTitle: 'Deploy fix',
        waitingForCommandLabel: 'Gemini',
        assistantPreviewText: 'Deployment is complete.',
      },
    });

    // Expo push should not be called (no expo channel configured)
    expect(sendToAllDevicesAsync).not.toHaveBeenCalled();

    // fetch should be called to the server API, not directly to webhook URL
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe('https://api.test.local/v1/webhooks/dispatch');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer test-token',
      },
    });

    // Verify the request body structure
    const body = JSON.parse(String(init.body));
    expect(body.sessionId).toBe('session-2');
    expect(body.sessionTitle).toBe('Deploy fix');
    expect(body.event.topic).toBe('ready');
    expect(body.event.waitingForCommandLabel).toBe('Gemini');
    expect(body.channels).toHaveLength(1);
    expect(body.channels[0].id).toBe('webhook-primary');
    expect(body.channels[0].url).toBe('https://hooks.example.test/happier');
    // signingSecret should NOT be included in the request to server
    expect(body.channels[0].signingSecret).toBeUndefined();
  });

  it('sends permission_request events to webhook via server', async () => {
    const sendToAllDevicesAsync = vi.fn(async () => {});
    const settings = accountSettingsParse({
      notificationChannelsV1: [
        {
          v: 1,
          id: 'webhook-primary',
          kind: 'webhook',
          enabled: true,
          url: 'https://hooks.example.test/happier',
          signingSecret: {
            _isSecretValue: true,
            value: 'webhook-secret',
          },
          topics: {
            ready: false,
            permissionRequest: true,
            userActionRequest: true,
          },
          readyIncludeMessageText: false,
        },
      ],
    });

    await dispatchActivityNotificationAsync({
      settings,
      expoPushSender: { sendToAllDevicesAsync },
      event: {
        topic: 'permission_request',
        sessionId: 'session-3',
        sessionTitle: 'Fix prod issue',
        requestId: 'request-9',
        toolName: 'Bash',
        toolInput: { command: 'git status --short && echo secret-token' },
      },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] ?? [];
    const body = JSON.parse(String(init.body));
    expect(body.event.topic).toBe('permission_request');
    expect(body.event.requestId).toBe('request-9');
    expect(body.event.toolName).toBe('Bash');
  });

  it('filters channels by topic subscription', async () => {
    const sendToAllDevicesAsync = vi.fn(async () => {});
    const settings = accountSettingsParse({
      notificationChannelsV1: [
        {
          v: 1,
          id: 'webhook-ready-only',
          kind: 'webhook',
          enabled: true,
          url: 'https://hooks.example.test/ready',
          topics: {
            ready: true,
            permissionRequest: false,
            userActionRequest: false,
          },
          readyIncludeMessageText: false,
        },
        {
          v: 1,
          id: 'webhook-permission-only',
          kind: 'webhook',
          enabled: true,
          url: 'https://hooks.example.test/permission',
          topics: {
            ready: false,
            permissionRequest: true,
            userActionRequest: false,
          },
          readyIncludeMessageText: false,
        },
      ],
    });

    // Send a 'ready' event - should only go to webhook-ready-only
    await dispatchActivityNotificationAsync({
      settings,
      expoPushSender: { sendToAllDevicesAsync },
      event: {
        topic: 'ready',
        sessionId: 'session-4',
        waitingForCommandLabel: 'Codex',
      },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1].body));
    expect(body.channels).toHaveLength(1);
    expect(body.channels[0].id).toBe('webhook-ready-only');
  });

  it('handles server API errors gracefully', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
    });

    const settings = accountSettingsParse({
      notificationChannelsV1: [
        {
          v: 1,
          id: 'webhook-primary',
          kind: 'webhook',
          enabled: true,
          url: 'https://hooks.example.test/happier',
          topics: { ready: true, permissionRequest: true, userActionRequest: true },
          readyIncludeMessageText: false,
        },
      ],
    });

    // Should not throw, just log and continue
    const result = await dispatchActivityNotificationAsync({
      settings,
      event: {
        topic: 'ready',
        sessionId: 'session-5',
        waitingForCommandLabel: 'Codex',
      },
    });

    expect(result.attemptedChannels).toBe(1);
    expect(result.deliveredChannels).toBe(0);
  });
});