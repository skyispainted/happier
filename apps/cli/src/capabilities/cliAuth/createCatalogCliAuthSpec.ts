import { getProviderCliRuntimeSpec, type AgentId } from '@ks-happier/agents';

import type { CliAuthSpec } from './types';

export function createCatalogCliAuthSpec(
  agentId: AgentId,
  spec: Omit<CliAuthSpec, 'binaryNames'>,
): CliAuthSpec {
  return {
    binaryNames: [getProviderCliRuntimeSpec(agentId).binaryName],
    ...spec,
  };
}
