import type { DirectTranscriptRawMessageV1 } from '@ks-happier/protocol';

export function measureDirectTranscriptItemBytes(item: DirectTranscriptRawMessageV1): number {
  return Buffer.byteLength(JSON.stringify(item), 'utf8');
}
