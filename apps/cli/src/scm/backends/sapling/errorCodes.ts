import { mapSaplingScmErrorCode, type ScmOperationErrorCode } from '@ks-happier/protocol';

export function mapSaplingErrorCode(stderr: string): ScmOperationErrorCode {
    return mapSaplingScmErrorCode(stderr);
}
