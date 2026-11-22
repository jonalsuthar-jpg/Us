/**
 * Isle's sounds (scripts/generate-isle-sounds.mjs, bundled with each app):
 * which one goes with what just happened at the table, how loud, and when,
 * so a roll's rattle starts with the dice and the chime for cards coming in
 * waits until they've landed. Each app plays them its own way.
 */
import { waitingOn, type IsleEvent, type IsleState } from './rules';

export const ISLE_SHOTS = [
  'dice',
  'town',
  'road',
  'city',
  'click',
  'card',
  'steal',
  'gain',
  'trade',
  'robber',
  'knight',
  'seven',
  'turn',
  'bonus',
  'win',
] as const;
export const ISLE_LOOPS = ['waves', 'music'] as const;
export type IsleShot = (typeof ISLE_SHOTS)[number];
export type IsleLoop = (typeof ISLE_LOOPS)[number];

export interface IsleSound {
  play(name: IsleShot, volume: number): void;
  /** Keep playing at this volume; 0 stops it. */
  loop(name: IsleLoop, volume: number): void;
  setMaster(volume: number): void;
  dispose(): void;
}

export interface Cue {
  name: IsleShot;
  volume: number;
  /** Seconds from now. */
  at: number;
}

/** When the dice land after a roll (the board's tumble). */
export const DICE_LAND_S = 1.15;

/** The sounds for what happened between two states of the same game, as heard from my seat. */
export function cuesFor(prev: IsleState | null, next: IsleState, me: number): Cue[] {
  if (!prev || prev.seed !== next.seed || next.n <= prev.n) return [];
  const first = next.n - next.log.length + 1;
  const fresh: IsleEvent[] = next.log.filter((_, i) => first + i > prev.n);
  const cues: Cue[] = [];
  let rolled = false;
  for (const e of fresh) {
    const mine = 'p' in e && e.p === me;
    const after = rolled ? DICE_LAND_S : 0;
    switch (e.k) {
      case 'roll':
        rolled = true;
        cues.push({ name: 'dice', volume: 0.9, at: 0 });
        if (e.d[0] + e.d[1] === 7) cues.push({ name: 'seven', volume: 0.7, at: DICE_LAND_S });
        break;
      case 'gain':
        if (mine) cues.push({ name: 'gain', volume: 0.6, at: after + 0.15 });
        break;
      case 'settle':
        cues.push({ name: 'town', volume: mine ? 0.9 : 0.6, at: 0.25 });
        break;
      case 'city':
        cues.push({ name: 'city', volume: mine ? 0.9 : 0.6, at: 0.25 });
        break;
      case 'road':
        cues.push({ name: 'road', volume: mine ? 0.8 : 0.5, at: 0.25 });
        break;
      case 'robber':
        cues.push({ name: 'robber', volume: 0.8, at: 0.55 });
        break;
      case 'steal':
        if (mine || e.from === me) cues.push({ name: 'steal', volume: 0.8, at: 0.8 });
        break;
      case 'buy':
        cues.push({ name: 'card', volume: mine ? 0.8 : 0.4, at: 0 });
        break;
      case 'play':
        cues.push({ name: e.card === 'knight' ? 'knight' : 'card', volume: 0.7, at: 0 });
        break;
      case 'monopoly':
      case 'discard':
        cues.push({ name: 'card', volume: 0.6, at: 0 });
        break;
      case 'bank':
      case 'trade':
        cues.push({ name: 'trade', volume: mine || (e.k === 'trade' && e.with === me) ? 0.8 : 0.4, at: 0 });
        break;
      case 'offer':
        if (!mine) cues.push({ name: 'card', volume: 0.6, at: 0 });
        break;
      case 'longest':
      case 'army':
        if (e.p != null) cues.push({ name: 'bonus', volume: mine ? 0.8 : 0.5, at: 0.5 });
        break;
      case 'win':
        cues.push({ name: 'win', volume: 1, at: 0.4 });
        break;
    }
  }
  // My turn (or the opening waiting on me): a bell, unless I'm the one who just moved.
  const now = waitingOn(next).includes(me) && (next.phase === 'roll' || next.phase === 'setup');
  const before = waitingOn(prev).includes(me) && (prev.phase === 'roll' || prev.phase === 'setup');
  if (now && !before) cues.push({ name: 'turn', volume: 0.7, at: rolled ? DICE_LAND_S + 0.4 : 0.5 });
  return cues;
}
