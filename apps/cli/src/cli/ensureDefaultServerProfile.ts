import { readSettings } from '@/persistence';
import { addServerProfile } from '@/server/serverProfiles';
import { reloadConfiguration } from '@/configuration';

function resolveDefaultServer(): { name: string; serverUrl: string; webappUrl: string } | null {
  const url = (process.env.HAPPIER_CLI_DEFAULT_SERVER_URL ?? '').trim();
  if (!url) return null;
  const webappUrl = (process.env.HAPPIER_CLI_DEFAULT_WEBAPP_URL ?? url).trim();
  const name = (process.env.HAPPIER_CLI_DEFAULT_SERVER_NAME ?? url.replace(/^https?:\/\//, '')).trim();
  return { name, serverUrl: url, webappUrl };
}

const FALLBACK_DEFAULT_SERVER = {
  name: 'happier.dev.fs.seayoogames.cn',
  serverUrl: 'https://happier.dev.fs.seayoogames.cn',
  webappUrl: 'https://happier.dev.fs.seayoogames.cn',
};

/**
 * On first run, if no custom server profiles exist (only the default "cloud" profile),
 * automatically add the default custom server and switch to it.
 */
export async function ensureDefaultServerProfile(): Promise<void> {
  // Skip when user explicitly targets a server via env or CLI prefix
  if (process.env.HAPPIER_SERVER_URL || process.env.HAPPIER_LOCAL_SERVER_URL) return;

  const defaultServer = resolveDefaultServer() ?? FALLBACK_DEFAULT_SERVER;

  const settings: any = await readSettings();
  const servers = settings?.servers && typeof settings.servers === 'object' ? settings.servers : {};
  const serverKeys = Object.keys(servers);
  const hasOnlyCloud = serverKeys.length <= 1 && !serverKeys.some((k) => k !== 'cloud');

  if (hasOnlyCloud) {
    await addServerProfile({
      name: defaultServer.name,
      serverUrl: defaultServer.serverUrl,
      webappUrl: defaultServer.webappUrl,
      use: true,
    });
    reloadConfiguration();
  }
}
