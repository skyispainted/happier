import { AGENTS_CORE } from '@ks-happier/agents';

import type { AgentId } from './registryCore';

export function buildAgentSessionStorageUiConfig(params: Readonly<{ agentId: AgentId }>) {
    return AGENTS_CORE[params.agentId].sessionStorage;
}
