/**
 * Daily life in the village, as pure rules (both phones work out the same
 * thing from the day and the couple, so nothing is sent):
 * - small requests from the villagers, two each day;
 * - "today together": three little things to do together each day, and the streak;
 * - our stamp book: places we've been together, and firsts.
 */
import type { RegionId } from './layout';

// ------------------------------------------------------------------ requests

/** What a request needs handed over: something carried, or a vegetable from the basket. */
export type RequestNeed = 'bouquet' | 'bread' | 'kulfi' | 'puri' | 'veg';

export interface VillageRequest {
  id: string;
  /** The villager (villagers.ts id). */
  who: string;
  /** What they say about it. */
  ask: string;
  need: RequestNeed;
  /** What they say when it's done. */
  thanks: string;
}

export const REQUESTS: VillageRequest[] = [
  { id: 'asha_flowers', who: 'baker', ask: 'Flowers would brighten up my bakery. Could you bring me some?', need: 'bouquet', thanks: 'They’re beautiful! The bakery smells of roses now.' },
  { id: 'meera_kulfi', who: 'florist', ask: 'It’s so warm at the stall… I’d love a kulfi.', need: 'kulfi', thanks: 'Malai kulfi! You two are the sweetest.' },
  { id: 'ravi_bread', who: 'walker', ask: 'I forgot to buy bread on my walk. Would you get me a loaf?', need: 'bread', thanks: 'Still warm! Thank you, both.' },
  { id: 'leo_veg', who: 'barista', ask: 'I’m out of fresh vegetables for the sandwiches. Anything from your garden?', need: 'veg', thanks: 'Home-grown! The best sandwiches in the village today.' },
  { id: 'zoe_puri', who: 'jogger', ask: 'I’ve never had pani puri. Is it as good as they say?', need: 'puri', thanks: 'Wow, that’s amazing! I’m running back for more.' },
  { id: 'dev_bouquet', who: 'stroller', ask: 'It’s my wife’s birthday and I forgot flowers…', need: 'bouquet', thanks: 'You’ve saved me! She’ll love them.' },
  { id: 'kamla_bread', who: 'kulfi', ask: 'No time for lunch at the cart today. A loaf of bread would help.', need: 'bread', thanks: 'Thank you! Kulfi’s on me next time.' },
];

/** A simple stable hash (the same on both phones). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Today's two requests (a real day, YYYY-MM-DD), the same for both of us. */
export function requestsFor(day: string, coupleId: string): VillageRequest[] {
  const n = REQUESTS.length;
  const a = hash(`${coupleId}:${day}:r`) % n;
  let b = hash(`${coupleId}:${day}:s`) % (n - 1);
  if (b >= a) b += 1;
  return [REQUESTS[a]!, REQUESTS[b]!];
}

// ------------------------------------------------------------ today together

export type TodayTask = 'coffee' | 'cycle' | 'boat' | 'sunset' | 'kites' | 'swings' | 'puri' | 'cook' | 'diya' | 'help';

export const TODAY_LABEL: Record<TodayTask, string> = {
  coffee: 'A coffee date at the café',
  cycle: 'A ride on the tandem together',
  boat: 'Row round the lake together',
  sunset: 'Watch the sunset from the hill',
  kites: 'Fly kites together',
  swings: 'Swing together in the park',
  puri: 'Feed each other pani puri',
  cook: 'Cook something together',
  diya: 'Light diyas at the temple',
  help: 'Help someone in the village',
};

const TASKS = Object.keys(TODAY_LABEL) as TodayTask[];

/** Today's three, the same for both of us. */
export function todayFor(day: string, coupleId: string): TodayTask[] {
  const pool = [...TASKS];
  const out: TodayTask[] = [];
  let seed = hash(`${coupleId}:${day}:t`);
  while (out.length < 3) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    out.push(pool.splice(seed % pool.length, 1)[0]!);
  }
  return out;
}

/** Which task a moment (its id, and what it said) counts towards, if any. */
export function taskOfMoment(id: string, text: string): TodayTask | null {
  const kind = id.split(':')[0];
  if (kind === 'coffee') return 'coffee';
  if (kind === 'cycle' && text.includes('together')) return 'cycle';
  if (kind === 'row' && text.includes('together')) return 'boat';
  if (kind === 'sunset') return 'sunset';
  if (kind === 'kites') return 'kites';
  if (kind === 'swings') return 'swings';
  if (kind === 'puri') return 'puri';
  if (kind === 'dinner') return 'cook';
  if (kind === 'diya') return 'diya';
  if (kind === 'request') return 'help';
  return null;
}

/** The streak after finishing today: one more if we finished yesterday too, else a fresh start. */
export function nextStreak(prev: { last?: string; streak?: number } | null, day: string): number {
  if (prev?.last === day) return prev.streak ?? 1;
  const y = new Date(`${day}T12:00:00`);
  y.setDate(y.getDate() - 1);
  const yesterday = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
  return prev?.last === yesterday ? (prev.streak ?? 0) + 1 : 1;
}

// ------------------------------------------------------------------- stamps

export type StampId = 'cafe' | 'square' | 'park' | 'temple' | 'beach' | 'jetty' | 'hill' | 'first_boat' | 'first_coffee' | 'first_sunset' | 'first_cycle' | 'first_six';

export const STAMPS: { id: StampId; label: string; emoji: string }[] = [
  { id: 'square', label: 'The square', emoji: '⛲' },
  { id: 'cafe', label: 'The café', emoji: '☕' },
  { id: 'park', label: 'The park', emoji: '🦆' },
  { id: 'temple', label: 'The temple', emoji: '🛕' },
  { id: 'beach', label: 'The beach', emoji: '🏖️' },
  { id: 'jetty', label: 'The jetty', emoji: '🚣' },
  { id: 'hill', label: 'The hilltop', emoji: '⛰️' },
  { id: 'first_coffee', label: 'Our first coffee date', emoji: '💞' },
  { id: 'first_boat', label: 'Our first row on the lake', emoji: '🛶' },
  { id: 'first_cycle', label: 'Our first ride together', emoji: '🚲' },
  { id: 'first_sunset', label: 'Our first sunset on the hill', emoji: '🌅' },
  { id: 'first_six', label: 'Our first six', emoji: '🏏' },
];

/** The place-stamp for a region (both of us there together earns it). */
export function stampOfRegion(r: RegionId | string | undefined): StampId | null {
  if (!r) return null;
  if (r === 'cafe') return 'cafe';
  if (r.startsWith('square')) return 'square';
  if (r.startsWith('park')) return 'park';
  if (r === 'templeCourt' || r === 'templeHall') return 'temple';
  if (r === 'beach' || r === 'shallows') return 'beach';
  if (r === 'jetty') return 'jetty';
  if (r === 'hillTop') return 'hill';
  return null;
}

/** The first-time stamp a moment earns, if any. */
export function stampOfMoment(id: string, text: string): StampId | null {
  const kind = id.split(':')[0];
  if (kind === 'coffee') return 'first_coffee';
  if (kind === 'row' && text.includes('together')) return 'first_boat';
  if (kind === 'cycle' && text.includes('together')) return 'first_cycle';
  if (kind === 'sunset') return 'first_sunset';
  if (kind === 'six') return 'first_six';
  return null;
}
