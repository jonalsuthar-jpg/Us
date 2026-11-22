import { describe, expect, it } from 'vitest';
import { apply, cuesFor, DICE_LAND_S, hardMove, ISLE_LOOPS, ISLE_SHOTS, newGame, waitingOn, type IsleState } from '../src/isle';

const { existsSync } = (await import('node:fs' as string)) as { existsSync: (p: URL) => boolean };

const SEATS = [
  { id: 'a', name: 'A', bot: false },
  { id: 'b', name: 'B', bot: false },
  { id: 'x', name: 'X', bot: true },
  { id: 'y', name: 'Y', bot: true },
];
const next = (s: IsleState) => {
  const p = waitingOn(s)[0]!;
  return apply(s, p, hardMove(s, p)) as IsleState;
};

describe('isle sounds', () => {
  it('has every sound file in both apps', () => {
    for (const n of [...ISLE_SHOTS, ...ISLE_LOOPS]) {
      expect(existsSync(new URL(`../../../apps/mobile/assets/isle/${n}.wav`, import.meta.url))).toBe(true);
      expect(existsSync(new URL(`../../../apps/web/public/isle/sounds/${n}.wav`, import.meta.url))).toBe(true);
    }
  });

  it('plays a piece going down, and nothing for the same state', () => {
    const s = newGame(SEATS, 4);
    const t = next(s);
    expect(cuesFor(s, t, 0).map((c) => c.name)).toContain('town');
    expect(cuesFor(t, t, 0)).toEqual([]);
    expect(cuesFor(null, t, 0)).toEqual([]);
  });

  it('rattles the dice, then chimes once they land', () => {
    let s = newGame(SEATS, 8);
    for (let i = 0; i < 4000; i++) {
      const t = next(s);
      const roll = t.log.at(-1);
      const got = t.log.some((e, j) => j >= s.log.length - (s.n - (t.n - t.log.length)) && e.k === 'gain');
      if (t.phase !== 'setup' && s.phase === 'roll' && roll && got) {
        const me = (t.log.find((e) => e.k === 'gain' && t.n - t.log.length + 1 + t.log.indexOf(e) > s.n) as { p: number }).p;
        const cues = cuesFor(s, t, me);
        expect(cues[0]).toMatchObject({ name: 'dice', at: 0 });
        expect(cues.find((c) => c.name === 'gain')!.at).toBeGreaterThanOrEqual(DICE_LAND_S);
        return;
      }
      s = t;
    }
    throw new Error('no roll that paid');
  });

  it('rings for my turn', () => {
    let s = newGame(SEATS, 12);
    while (s.phase === 'setup') s = next(s);
    // Play until the turn passes to someone, then hear it from their seat.
    for (let i = 0; i < 400; i++) {
      const t = next(s);
      if (t.turn !== s.turn && t.phase === 'roll') {
        expect(cuesFor(s, t, t.turn).map((c) => c.name)).toContain('turn');
        expect(cuesFor(s, t, s.turn).map((c) => c.name)).not.toContain('turn');
        return;
      }
      s = t;
    }
    throw new Error('the turn never passed');
  });
});
