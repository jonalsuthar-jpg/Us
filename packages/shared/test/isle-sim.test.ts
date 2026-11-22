/**
 * Bot against bot. Quick by default; for the full tuning run:
 *   ISLE_SIM=2000 npx vitest run test/isle-sim.test.ts --silent=false
 */
import { describe, expect, it } from 'vitest';
import { apply, cardTotals, greedyMove, hardMove, newGame, waitingOn, type IsleAction, type IsleState } from '../src/isle';

const GAMES = Number((globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.ISLE_SIM ?? 60);
type Brain = (s: IsleState, p: number) => IsleAction;

function play(seed: number, brains: Brain[]): { winner: number | null; turns: number; slowest: number } {
  const seats = brains.map((_, i) => ({ id: `s${i}`, name: `S${i}`, bot: true }));
  let s = newGame(seats, seed);
  let slowest = 0;
  for (let moves = 0; s.phase !== 'over' && s.turnNo < 500; moves++) {
    if (moves > 30000) throw new Error(`seed ${seed} stuck in ${s.phase}`);
    const seat = waitingOn(s)[0]!;
    const brain = brains[Number(s.players[seat]!.id.slice(1))]!;
    const t = performance.now();
    const a = brain(s, seat);
    slowest = Math.max(slowest, performance.now() - t);
    const next = apply(s, seat, a);
    if (typeof next === 'string') throw new Error(`seed ${seed}: ${JSON.stringify(a)} by ${seat} in ${s.phase}: ${next}`);
    s = next;
  }
  for (const n of Object.values(cardTotals(s))) expect(n).toBe(19);
  return { winner: s.winner == null ? null : Number(s.players[s.winner]!.id.slice(1)), turns: s.turnNo, slowest };
}

describe('isle bots', () => {
  it('one hard bot against three greedy ones', () => {
    let wins = 0;
    let done = 0;
    let turns = 0;
    let slowest = 0;
    for (let g = 0; g < GAMES; g++) {
      const hardAt = g % 4;
      const brains = [0, 1, 2, 3].map((i) => (i === hardAt ? hardMove : greedyMove));
      const r = play(1000 + g * 7919, brains);
      if (r.winner != null) {
        done++;
        turns += r.turns;
      }
      if (r.winner === hardAt) wins++;
      slowest = Math.max(slowest, r.slowest);
    }
    console.log(`hard vs 3 greedy: won ${wins}/${GAMES} (${((100 * wins) / GAMES).toFixed(0)}%), ${done} finished, ${(turns / done).toFixed(1)} turns, slowest move ${slowest.toFixed(1)} ms`);
    expect(done).toBe(GAMES);
    // A fair share would be 25%; the hard bot takes about 46% over a long run.
    expect(wins / GAMES).toBeGreaterThan(0.33);
  }, 600000);

  it('two hard bots against two greedy ones', () => {
    let wins = 0;
    for (let g = 0; g < GAMES; g++) {
      const hard = g % 2 ? [0, 2] : [1, 3];
      const r = play(3000 + g * 15485863, [0, 1, 2, 3].map((i) => (hard.includes(i) ? hardMove : greedyMove)));
      if (r.winner != null && hard.includes(r.winner)) wins++;
    }
    console.log(`2 hard vs 2 greedy: hard side won ${wins}/${GAMES} (${((100 * wins) / GAMES).toFixed(0)}%)`);
    expect(wins / GAMES).toBeGreaterThan(0.6);
  }, 600000);

  it('hard bots against each other finish their games', () => {
    let done = 0;
    let turns = 0;
    const n = Math.max(10, Math.floor(GAMES / 3));
    for (let g = 0; g < n; g++) {
      const r = play(5000 + g * 104729, [hardMove, hardMove, hardMove, hardMove]);
      if (r.winner != null) {
        done++;
        turns += r.turns;
      }
    }
    console.log(`4 hard: ${done}/${n} finished, ${(turns / done).toFixed(1)} turns`);
    expect(done).toBe(n);
  }, 600000);
});
