import { describe, expect, it } from 'vitest';

import { assertProviderSettingsRegistryValid, getAllProviderSettingsDefinitions } from '@ks-happier/agents';

describe('provider settings registry (@ks-happier/agents)', () => {
  it('exposes a valid registry (no duplicate keys; defaults cover all shape fields)', () => {
    const defs = getAllProviderSettingsDefinitions();
    expect(Array.isArray(defs)).toBe(true);
    expect(defs.length).toBeGreaterThan(0);

    expect(() => assertProviderSettingsRegistryValid()).not.toThrow();
  });
});
