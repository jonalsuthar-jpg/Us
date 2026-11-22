import { describe, expect, it } from 'vitest';
import { ART_LAND, artAt, generateBoard, tileLooks } from '../src/isle';

const { existsSync } = (await import('node:fs' as string)) as { existsSync: (p: URL) => boolean };

describe('isle art', () => {
  it('has every picture in both apps', () => {
    const names = [...Object.values(ART_LAND).flatMap((land) => [1, 2].map((v) => `tile_${land}_${v}`)), 'sea'];
    names.push(...['wood', 'brick', 'wool', 'grain', 'ore'].map((r) => `card_${r}`));
    names.push(...['knight', 'vp', 'roads', 'plenty', 'monopoly'].map((d) => `dev_${d}`));
    for (const n of names) {
      expect(existsSync(new URL(`../../../apps/mobile/assets/isle/art/${n}.jpg`, import.meta.url)), n).toBe(true);
      expect(existsSync(new URL(`../../../apps/web/public/isle/art/${n}.jpg`, import.meta.url)), n).toBe(true);
    }
  });

  it('points the board at the web’s pictures', () => {
    const art = artAt('/isle/art');
    expect(art.tiles.wood).toEqual(['/isle/art/tile_forest_1.jpg', '/isle/art/tile_forest_2.jpg']);
    expect(art.sea).toBe('/isle/art/sea.jpg');
  });

  it('dresses each hex the same way on both phones', () => {
    const board = generateBoard(77);
    const a = tileLooks(board, 77);
    expect(tileLooks(board, 77)).toEqual(a);
    expect(a).toHaveLength(19);
    for (const l of a) {
      expect([0, 1]).toContain(l.variant);
      expect(l.turn).toBeGreaterThanOrEqual(0);
      expect(l.turn).toBeLessThan(6);
    }
    // Both pictures get used across the island.
    expect(new Set(a.map((l) => l.variant)).size).toBe(2);
  });
});
