import { AGENTS_CORE } from '@ks-happier/agents';
import { ConnectedServiceIdSchema, type ConnectedServiceId } from '@ks-happier/protocol';

export function resolveConnectTargetServiceIds(targetId: string): ConnectedServiceId[] {
  const normalized = String(targetId ?? '').trim().toLowerCase();
  if (!normalized) return [];

  const core = (AGENTS_CORE as Record<string, { cloudConnect?: unknown; connectedServices?: { supportedServiceIds: readonly unknown[] } | null }>)[normalized];
  if (!core?.cloudConnect) return [];

  const supported = core.connectedServices?.supportedServiceIds ?? [];
  return supported.map((serviceId) => ConnectedServiceIdSchema.parse(serviceId));
}
