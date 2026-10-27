import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawHub, GameStore, ROUNDS, type DrawEvent, type UsClient } from '../src';

/** Just enough of the Supabase client for a live game. */
function fakeSb(calls: string[]): UsClient {
  const chain = {
    insert: () => chain,
    select: () => chain,
    single: async () => ({ data: { id: 'game-1' }, error: null }),
  };
  return {
    from: (t: string) => (calls.push(`from:${t}`), chain),
    rpc: async (fn: string, args: unknown) => (calls.push(`rpc:${fn}:${JSON.stringify(args)}`), { data: null, error: null }),
  } as unknown as UsClient;
}

function link() {
  const ends: ((e: DrawEvent) => void)[][] = [[], []];
  const make = (i: number) => ({
    send: (e: DrawEvent) => queueMicrotask(() => ends[1 - i]!.forEach((fn) => fn(JSON.parse(JSON.stringify(e))))),
    on: (fn: (e: DrawEvent) => void) => (ends[i]!.push(fn), () => {}),
  });
  return [new DrawHub('alice', make(0)), new DrawHub('bob', make(1))] as const;
}

describe('live Draw & Guess between two devices', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('plays six rounds with roles swapping, scores once, and records the game', async () => {
    const calls: string[] = [];
    const [ha, hb] = link();
    const alice = new GameStore(ha, fakeSb(calls), 'c1', 'alice', 'bob');
    const bob = new GameStore(hb, fakeSb(calls), 'c1', 'bob', 'alice');
    for (const s of [alice, bob]) s.subscribe(() => s.tick());

    await alice.invite(['everyday']);
    await vi.advanceTimersByTimeAsync(1);
    expect(bob.state?.phase).toBe('invited');
    await bob.join();
    await vi.advanceTimersByTimeAsync(1);

    for (let round = 0; round < ROUNDS; round++) {
      const drawer = round % 2 ? bob : alice;
      const guesser = round % 2 ? alice : bob;
      expect(drawer.state?.phase).toBe('choosing');
      expect(drawer.state?.choices).toHaveLength(3);
      expect(guesser.state?.choices).toHaveLength(0);
      const word = drawer.state!.choices[0]!;
      drawer.pick(word);
      await vi.advanceTimersByTimeAsync(1);
      expect(guesser.state?.phase).toBe('drawing');
      expect(guesser.state?.word).toBeNull();
      await vi.advanceTimersByTimeAsync(27_000);
      expect(Object.keys(guesser.state!.revealed).length).toBeGreaterThanOrEqual(word.text.replace(/\W/g, '').length >= 3 ? 1 : 0);
      if (round === 3) {
        // Nobody gets this one: time runs out.
        await vi.advanceTimersByTimeAsync(54_000);
      } else {
        expect(guesser.guess('definitely not it')).toBe('wrong');
        expect(guesser.guess(word.text)).toBe('right');
      }
      await vi.advanceTimersByTimeAsync(1);
      expect(guesser.state?.phase).toBe('reveal');
      expect(guesser.state?.word).toBe(word.text);
      await vi.advanceTimersByTimeAsync(5_000);
    }
    expect(alice.state?.phase).toBe('done');
    expect(bob.state?.phase).toBe('done');
    expect(alice.state?.score).toBe(bob.state?.score);
    expect(alice.state!.results.filter((r) => r.solved)).toHaveLength(5);
    const finishes = calls.filter((c) => c.startsWith('rpc:finish_draw_game'));
    expect(finishes).toHaveLength(1);
    expect(finishes[0]).toContain(`"p_score":${alice.state!.score}`);
  });
});
