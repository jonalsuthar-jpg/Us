import type { RegionId } from './layout';

/**
 * Our House's sounds (scripts/generate-house-sounds.mjs, in the house pack
 * under sounds/). The world says what to play and how loud; each app plays
 * them its own way (Web Audio on the web, expo-audio on the phone).
 */
export const ONE_SHOTS = ['step_wood', 'step_tile', 'step_grass', 'step_stone', 'door', 'click', 'fridge', 'splash', 'chime', 'dice', 'pop', 'swish', 'catch', 'bell', 'conch'] as const;
export const LOOPS = ['sizzle', 'pour', 'rain', 'crickets', 'birds', 'music', 'fire', 'bubbles', 'aarti'] as const;
export type OneShot = (typeof ONE_SHOTS)[number];
export type Loop = (typeof LOOPS)[number];

/** The speaker's tune is this long (4 bars at 76 bpm), so we both hear the same bar. */
export const MUSIC_S = (4 * 4 * 60) / 76;

export interface HouseSound {
  /** Once, at this volume (0…1). */
  play(name: OneShot, volume: number): void;
  /** Keep playing at this volume; 0 stops it. `offset` (seconds) only when it starts. */
  loop(name: Loop, volume: number, offset?: number): void;
  /** Everything quieter or silent (the sound button). */
  setMaster(volume: number): void;
  dispose(): void;
}

/** What a step sounds like, by where it lands. */
export function stepSound(at: RegionId): OneShot {
  if (at === 'kitchen' || at === 'stairFoot') return 'step_tile';
  if (at.startsWith('garden') || at === 'lane' || at.startsWith('park')) return 'step_grass';
  if (at === 'pool' || at === 'gate' || at === 'street' || at.startsWith('square')) return 'step_stone';
  return 'step_wood';
}

/** Louder close by: 1 next to you, about a third three metres away. */
export const nearness = (d: number) => 1 / (1 + Math.max(0, d) / 1.5);
