import type { AppVariant } from '@/sync/runtime/appVariant';

export function buildHappierCliInstallCommand(_input: Readonly<{ appVariant: AppVariant; distTagOverride?: unknown }>): string {
    return 'npm install -g @ks-happier/cli@latest --registry https://registry.npmjs.org';
}
