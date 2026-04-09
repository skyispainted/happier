import type { CliAuthSpec } from './types';
import { createCatalogCliAuthSpec } from './createCatalogCliAuthSpec';
import type { AgentId } from '@ks-happier/agents';

export function createUnknownCliAuthSpec(agentId: AgentId): CliAuthSpec {
  return createCatalogCliAuthSpec(agentId, {
    detectAuthStatus: async () => ({
      state: 'unknown',
      reason: 'unsupported',
    }),
  });
}
