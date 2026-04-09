import test from 'node:test';
import assert from 'node:assert/strict';

import { readBundledWorkspaceSyncConfig } from './readBundledWorkspaceSyncConfig.mjs';

test('readBundledWorkspaceSyncConfig derives stack workspace packages from bundledDependencies', () => {
  const config = readBundledWorkspaceSyncConfig('/repo/apps/stack', {
    existsSync: (candidate) => candidate === '/repo/apps/stack/package.json',
    readFileSync: () => JSON.stringify({
      bundledDependencies: [
        '@ks-happier/agents',
        '@ks-happier/cli-common',
        '@ks-happier/connection-supervisor',
        'qrcode',
        '@ks-happier/protocol',
        '@ks-happier/release-runtime',
      ],
    }),
  });

  assert.deepEqual(config, {
    hostApps: ['stack'],
    packages: ['agents', 'cli-common', 'connection-supervisor', 'protocol', 'release-runtime'],
  });
});

test('readBundledWorkspaceSyncConfig returns null when package.json is unavailable', () => {
  const config = readBundledWorkspaceSyncConfig('/repo/apps/stack', {
    existsSync: () => false,
  });

  assert.equal(config, null);
});
