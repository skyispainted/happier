import { SavedSecretSchema as ProtocolSavedSecretSchema } from '@ks-happier/protocol';
import { z } from 'zod';

export const SavedSecretSchema = ProtocolSavedSecretSchema;

export type SavedSecret = z.infer<typeof SavedSecretSchema>;
