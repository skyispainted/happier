import { describe, expect, it } from 'vitest';

import type { AppVariant } from '@/sync/runtime/appVariant';

import { buildHappierCliInstallCommand } from './happierCliInstallCommand';

describe('buildHappierCliInstallCommand', () => {
    it('returns the npm install command regardless of app variant', () => {
        const expected = 'npm install -g @ks-happier/cli@latest --registry https://registry.npmjs.org';
        expect(buildHappierCliInstallCommand({ appVariant: 'preview' })).toBe(expected);
        expect(buildHappierCliInstallCommand({ appVariant: 'development' })).toBe(expected);
        expect(buildHappierCliInstallCommand({ appVariant: 'production' })).toBe(expected);
        expect(buildHappierCliInstallCommand({ appVariant: 'production', distTagOverride: 'next' })).toBe(expected);
    });
});
