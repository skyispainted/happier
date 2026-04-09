import type { MemoryStatusV1 } from '@ks-happier/protocol';

export function isDaemonMemorySearchUsable(status: MemoryStatusV1 | null | undefined): boolean {
  if (!status || status.enabled !== true) return false;
  return status.activeIndexReady === true;
}
