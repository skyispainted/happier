import type { SessionHandoffWorkspaceTransfer } from '@ks-happier/protocol';

export type SessionHandoffWorkspaceTransferInput = Readonly<
  Omit<SessionHandoffWorkspaceTransfer, 'strategy'> & {
    strategy?: SessionHandoffWorkspaceTransfer['strategy'];
  }
>;
