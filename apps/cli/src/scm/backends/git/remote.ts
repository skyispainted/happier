import type { ScmOperationErrorCode, ScmRemoteRequest } from '@ks-happier/protocol';
import { mapGitScmErrorCode, normalizeScmRemoteRequest } from '@ks-happier/protocol';

export function buildGitPushArgs(request: Readonly<Pick<ScmRemoteRequest, 'remote' | 'branch'>>): string[] {
    const args = ['push'];
    if (request.remote) {
        args.push(request.remote);
        if (request.branch) args.push(request.branch);
        return args;
    }
    if (request.branch) {
        args.push('origin', request.branch);
    }
    return args;
}

export function buildGitPullArgs(request: Readonly<Pick<ScmRemoteRequest, 'remote' | 'branch'>>): string[] {
    const args = ['pull', '--ff-only'];
    if (request.remote) {
        args.push(request.remote);
        if (request.branch) args.push(request.branch);
        return args;
    }
    if (request.branch) {
        args.push('origin', request.branch);
    }
    return args;
}
export { normalizeScmRemoteRequest };

export function mapGitErrorCode(stderr: string): ScmOperationErrorCode {
    return mapGitScmErrorCode(stderr);
}
