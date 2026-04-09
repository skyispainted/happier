import { join } from 'node:path';

import type { DirectSessionsSource } from '@ks-happier/protocol';
import { expandHomeDirPath, resolveHomeDirFromEnvironment } from '@ks-happier/cli-common/providers';

import { resolveConfiguredClaudeConfigDir } from '../utils/resolveConfiguredClaudeConfigDir';

export { resolveConfiguredClaudeConfigDir } from '../utils/resolveConfiguredClaudeConfigDir';

export function resolveClaudeConfigDir(params: Readonly<{ source: DirectSessionsSource; env: NodeJS.ProcessEnv }>): string {
  if (params.source.kind !== 'claudeConfig') {
    return join(resolveHomeDirFromEnvironment(params.env), '.claude');
  }
  const fromSource = typeof params.source.configDir === 'string' ? params.source.configDir.trim() : '';
  const resolved = fromSource || resolveConfiguredClaudeConfigDir({ env: params.env });
  return expandHomeDirPath(resolved, params.env) || join(resolveHomeDirFromEnvironment(params.env), '.claude');
}

export const resolveClaudeConfigDirForDirectSessions = resolveClaudeConfigDir;
