import { SYSTEM_TASK_PROTOCOL_VERSION, type SystemTaskSpec } from '@ks-happier/protocol';
import { createTailscaleSecureAccessTaskSpec } from '@ks-happier/protocol';

export function buildLocalTailscaleSecureAccessSystemTaskSpec(params: Readonly<{
    upstreamUrl: string;
}>): SystemTaskSpec {
    return {
        protocolVersion: SYSTEM_TASK_PROTOCOL_VERSION,
        ...createTailscaleSecureAccessTaskSpec({
            upstreamUrl: params.upstreamUrl,
            servePath: '/',
            installPolicy: 'installIfMissing',
            loginPolicy: 'interactive',
            mode: 'normalUser',
        }),
    };
}
