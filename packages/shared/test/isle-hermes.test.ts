/**
 * Isle runs on phones under Hermes, which lacks some newer built-ins that
 * Node and browsers have. A missing one throws from a tap or a bot's timer,
 * outside any error boundary, and closes the whole app, as structuredClone
 * once did. These keep them out of the game's code.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apply, hardMove, newGame, waitingOn } from '../src/isle';

const fs = (await import('node:fs' as string)) as {
  readdirSync: (p: URL, o: { recursive: true }) => string[];
  readFileSync: (p: URL, enc: 'utf8') => string;
};

/** Built-ins Hermes doesn't have (or not reliably). */
const MISSING = ['structuredClone', 'queueMicrotask', 'Object.hasOwn', '.findLast(', '.findLastIndex(', '.toSorted(', '.toReversed(', '.toSpliced('];

describe('isle on Hermes', () => {
  it('uses no built-ins the phone lacks', () => {
    const dir = new URL('../src/isle/', import.meta.url);
    const files = fs
      .readdirSync(dir, { recursive: true })
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => new URL(f.replace(/\\/g, '/'), dir));
    files.push(new URL('../src/rng.ts', import.meta.url));
    const found: string[] = [];
    for (const f of files) {
      // Comments may name them (saying why not); code may not.
      const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      for (const api of MISSING) if (code.includes(api)) found.push(`${f.pathname.split('/src/')[1]}: ${api}`);
    }
    expect(found).toEqual([]);
  });

  describe('without structuredClone', () => {
    const g = globalThis as { structuredClone?: unknown };
    const saved = g.structuredClone;
    beforeAll(() => {
      delete g.structuredClone;
    });
    afterAll(() => {
      g.structuredClone = saved;
    });

    it('plays a whole game', () => {
      let s = newGame(
        [
          { id: 'a', name: 'A', bot: false },
          { id: 'b', name: 'B', bot: false },
          { id: 'x', name: 'X', bot: true },
          { id: 'y', name: 'Y', bot: true },
        ],
        2024,
      );
      for (let i = 0; i < 20000 && s.phase !== 'over'; i++) {
        const p = waitingOn(s)[0]!;
        const next = apply(s, p, hardMove(s, p));
        if (typeof next === 'string') throw new Error(next);
        s = next;
      }
      expect(s.phase).toBe('over');
    });
  });
});
