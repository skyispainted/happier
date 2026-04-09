import { extractTailscaleServeHttpsUrl } from '@ks-happier/cli-common/tailscale';

export function extractTailscaleHttpsUrlFromStatusText(statusText) {
  return extractTailscaleServeHttpsUrl(String(statusText ?? ''));
}
