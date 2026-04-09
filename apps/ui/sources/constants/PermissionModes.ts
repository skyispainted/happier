import { SESSION_PERMISSION_MODES } from '@ks-happier/protocol';

export const PERMISSION_MODES = SESSION_PERMISSION_MODES;

export type PermissionMode = (typeof PERMISSION_MODES)[number];
