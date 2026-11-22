import { describe, expect, it } from 'vitest';
import { HEX_FILES, hexArtAt } from '../src/isle';

const { existsSync } = (await import('node:fs' as string)) as { existsSync: (p: URL) => boolean };

describe('isle art', () => {
  it('has every card picture in both apps', () => {
    const names = [...['wood', 'brick', 'wool', 'grain', 'ore'].map((r) => `card_${r}`), ...['knight', 'vp', 'roads', 'plenty', 'monopoly'].map((d) => `dev_${d}`)];
    for (const n of names) {
      expect(existsSync(new URL(`../../../apps/mobile/assets/isle/art/${n}.jpg`, import.meta.url)), n).toBe(true);
      expect(existsSync(new URL(`../../../apps/web/public/isle/art/${n}.jpg`, import.meta.url)), n).toBe(true);
    }
  });

  it('has every land’s tile picture in both apps, and the web finds them', () => {
    for (const name of Object.values(HEX_FILES)) {
      expect(existsSync(new URL(`../../../apps/mobile/assets/isle/hex/${name}.png`, import.meta.url)), name).toBe(true);
      expect(existsSync(new URL(`../../../apps/web/public/isle/hex/${name}.png`, import.meta.url)), name).toBe(true);
    }
    expect(hexArtAt('/isle/hex').wood).toBe('/isle/hex/forest.png');
    expect(Object.keys(hexArtAt('/isle/hex')).sort()).toEqual(['brick', 'desert', 'grain', 'ore', 'wood', 'wool']);
  });
});
