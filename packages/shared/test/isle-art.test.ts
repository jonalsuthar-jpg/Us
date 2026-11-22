import { describe, expect, it } from 'vitest';

const { existsSync } = (await import('node:fs' as string)) as { existsSync: (p: URL) => boolean };

describe('isle art', () => {
  it('has every card picture in both apps', () => {
    const names = [...['wood', 'brick', 'wool', 'grain', 'ore'].map((r) => `card_${r}`), ...['knight', 'vp', 'roads', 'plenty', 'monopoly'].map((d) => `dev_${d}`)];
    for (const n of names) {
      expect(existsSync(new URL(`../../../apps/mobile/assets/isle/art/${n}.jpg`, import.meta.url)), n).toBe(true);
      expect(existsSync(new URL(`../../../apps/web/public/isle/art/${n}.jpg`, import.meta.url)), n).toBe(true);
    }
  });
});
