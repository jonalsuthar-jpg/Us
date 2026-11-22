/**
 * Small seeded random numbers (mulberry32), so both phones draw the same
 * thing from the same seed with nothing sent between them.
 */

const STEP = 0x6d2b79f5;

function mix(a: number): number {
  let x = Math.imul(a ^ (a >>> 15), 1 | a);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

/** A stream of numbers in [0, 1) from a seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + STEP) >>> 0;
    return mix(a);
  };
}

/** The n-th number (from 0) of mulberry32(seed), without running through the others. */
export function randomAt(seed: number, n: number): number {
  return mix((seed + Math.imul(n + 1, STEP)) >>> 0);
}

/** Shuffles a copy of the list with the given random stream. */
export function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
