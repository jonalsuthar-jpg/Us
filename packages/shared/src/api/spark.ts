import type { SparkEvent, SparkKind, SparkSeason } from '../database.types';
import type { UsClient } from '../supabase';
import { clockIn, DEFAULT_PLANT_TZ } from './plant';

/**
 * Spark Rank: a rank the two of us climb together, Ember I to Eternal, one
 * season per month. Triggers award Sparks for the things we do for each other
 * (see 20261027000000_spark_rank.sql); each of us can see only our own
 * awards, and both of us see the season's total.
 */

export const SPARK_TOPIC = 'spark';

export type SparkTierKey = 'ember' | 'spark' | 'glow' | 'flame' | 'blaze' | 'starlight' | 'aurora' | 'eternal';

export interface SparkTier {
  key: SparkTierKey;
  name: string;
  /** Emblem gradient, light to deep. */
  colors: [string, string];
}

export const SPARK_TIERS: SparkTier[] = [
  { key: 'ember', name: 'Ember', colors: ['#F6B48A', '#B4532A'] },
  { key: 'spark', name: 'Spark', colors: ['#FFD98A', '#D88C0C'] },
  { key: 'glow', name: 'Glow', colors: ['#A3E2B5', '#258F4C'] },
  { key: 'flame', name: 'Flame', colors: ['#FFB077', '#E2336A'] },
  { key: 'blaze', name: 'Blaze', colors: ['#FF86A3', '#9C1645'] },
  { key: 'starlight', name: 'Starlight', colors: ['#91E3D5', '#0A776D'] },
  { key: 'aurora', name: 'Aurora', colors: ['#D4C2E6', '#4B3468'] },
  { key: 'eternal', name: 'Eternal', colors: ['#FFD98A', '#C41D55'] },
];

/** Sparks per step in each tier below Eternal. Mirrors spark_ladder() in SQL. */
export const SPARK_STEPS = [100, 150, 220, 300, 400, 500, 620];

const NUMERALS = ['I', 'II', 'III'] as const;

export interface SparkDivision {
  /** 0 = Ember I … 21 = Eternal. */
  index: number;
  tier: SparkTier;
  tierIndex: number;
  /** 0, 1 or 2 for I, II, III. Eternal is drawn as a III. */
  step: 0 | 1 | 2;
  name: string;
  /** Season Sparks needed to reach it. */
  at: number;
}

export const SPARK_DIVISIONS: SparkDivision[] = (() => {
  const out: SparkDivision[] = [];
  let at = 0;
  SPARK_STEPS.forEach((size, t) => {
    NUMERALS.forEach((n, step) => {
      out.push({ index: out.length, tier: SPARK_TIERS[t]!, tierIndex: t, step: step as 0 | 1 | 2, name: `${SPARK_TIERS[t]!.name} ${n}`, at });
      at += size;
    });
  });
  out.push({ index: out.length, tier: SPARK_TIERS[7]!, tierIndex: 7, step: 2, name: 'Eternal', at });
  return out;
})();

export interface SparkRank {
  division: SparkDivision;
  next: SparkDivision | null;
  /** Sparks still needed for the next division (0 at the top). */
  toNext: number;
  /** 0–1 of the way through this division. */
  progress: number;
}

export function rankFor(sparks: number): SparkRank {
  let i = 0;
  SPARK_DIVISIONS.forEach((d, j) => {
    if (sparks >= d.at) i = j;
  });
  const division = SPARK_DIVISIONS[i]!;
  const next = SPARK_DIVISIONS[i + 1] ?? null;
  return {
    division,
    next,
    toNext: next ? next.at - sparks : 0,
    progress: next ? Math.min(1, (sparks - division.at) / (next.at - division.at)) : 1,
  };
}

/** What earns Sparks, for each of us: worth each time, and the most a day. Mirrors spark_grant(). */
export const SPARK_RULES: { kind: Exclude<SparkKind, 'together' | 'call_minutes'>; label: string; sparks: number; cap: number }[] = [
  { kind: 'first_move', label: 'Make the first move', sparks: 15, cap: 45 },
  { kind: 'snap', label: 'Post a snap', sparks: 8, cap: 24 },
  { kind: 'call_start', label: 'Call, and they pick up', sparks: 10, cap: 30 },
  { kind: 'call_pickup', label: 'A call you both pick up', sparks: 5, cap: 15 },
  { kind: 'question', label: 'Answer today’s question', sparks: 10, cap: 10 },
  { kind: 'media', label: 'Send a photo or voice note', sparks: 4, cap: 12 },
  { kind: 'tap', label: 'Send a thinking-of-you', sparks: 3, cap: 9 },
  { kind: 'status', label: 'Share your status', sparks: 3, cap: 3 },
  { kind: 'message', label: 'Messages', sparks: 2, cap: 20 },
];

/** How a kind of award reads in "my effort". */
export const SPARK_KIND_LABEL: Record<SparkKind, string> = {
  first_move: 'First moves',
  message: 'Messages',
  media: 'Photos & voice',
  tap: 'Thinking of you',
  snap: 'Snaps',
  status: 'Status',
  call_start: 'Calling',
  call_pickup: 'Calls',
  call_minutes: 'Time talking',
  question: 'Daily questions',
  together: 'Together days',
};

/** A new season starts at this share of the last one. Mirrors spark_add(). */
export const SPARK_CARRY = 0.4;

export interface SparkData {
  /** Every season we've had, newest first. */
  seasons: SparkSeason[];
  /** My awards from the last month or so (RLS: never my partner's). */
  mine: SparkEvent[];
  /** Partner A's zone: the couple's clock. */
  timezone: string;
}

export async function getSpark(sb: UsClient, coupleId: string, userAId: string): Promise<SparkData> {
  const since = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);
  const [seasons, mine, a] = await Promise.all([
    sb.from('spark_seasons').select('*').eq('couple_id', coupleId).order('season', { ascending: false }),
    // Only mine come back: the policy hides my partner's.
    sb.from('spark_events').select('*').eq('couple_id', coupleId).gte('day', since).order('created_at', { ascending: true }),
    sb.from('profiles').select('timezone').eq('id', userAId).maybeSingle(),
  ]);
  if (seasons.error) throw seasons.error;
  if (mine.error) throw mine.error;
  return { seasons: seasons.data ?? [], mine: mine.data ?? [], timezone: a.data?.timezone ?? DEFAULT_PLANT_TZ };
}

export interface SparkPeak {
  /** First day of the month. */
  season: string;
  month: string;
  division: SparkDivision;
}

export interface SparkState {
  /** First day of this month on the couple's clock. */
  season: string;
  month: string;
  daysLeft: number;
  sparks: number;
  rank: SparkRank;
  /** Ours, today. */
  today: number;
  mine: {
    season: number;
    today: number;
    firstMoves: number;
    /** This season, biggest first. */
    byKind: { kind: SparkKind; sparks: number }[];
    /** Sparks I've earned today, per kind, to show what's left. */
    usedToday: Partial<Record<SparkKind, number>>;
  };
  /** Earlier seasons' final ranks, newest first. */
  peaks: SparkPeak[];
}

function monthName(season: string): string {
  return new Date(`${season}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
}

export function sparkState(data: SparkData, now = new Date()): SparkState {
  const { day: today } = clockIn(data.timezone, now);
  const season = `${today.slice(0, 8)}01`;
  const current = data.seasons.find((s) => s.season === season);
  const before = data.seasons.find((s) => s.season < season);
  // Nothing earned yet this month: the season opens at its carry-in.
  const sparks = current?.sparks ?? Math.floor((before?.sparks ?? 0) * SPARK_CARRY);

  const [y, m] = season.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const mine = data.mine.filter((e) => e.day >= season);
  const byKind = new Map<SparkKind, number>();
  const usedToday: Partial<Record<SparkKind, number>> = {};
  for (const e of mine) {
    byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + e.sparks);
    if (e.day === today) usedToday[e.kind] = (usedToday[e.kind] ?? 0) + e.sparks;
  }

  return {
    season,
    month: monthName(season),
    daysLeft: lastDay - Number(today.slice(8, 10)),
    sparks,
    rank: rankFor(sparks),
    today: current?.today === today ? current.today_sparks : 0,
    mine: {
      season: mine.reduce((n, e) => n + e.sparks, 0),
      today: mine.filter((e) => e.day === today).reduce((n, e) => n + e.sparks, 0),
      firstMoves: mine.filter((e) => e.kind === 'first_move').length,
      byKind: [...byKind].map(([kind, sparks]) => ({ kind, sparks })).sort((a, b) => b.sparks - a.sparks),
      usedToday,
    },
    peaks: data.seasons
      .filter((s) => s.season < season)
      .map((s) => ({ season: s.season, month: monthName(s.season), division: rankFor(s.sparks).division })),
  };
}

/** "38 Sparks to Flame III", or the top. */
export function sparkNextLine(s: SparkState): string {
  return s.rank.next ? `${s.rank.toNext} ${s.rank.toNext === 1 ? 'Spark' : 'Sparks'} to ${s.rank.next.name}` : 'You’re at the top. Eternal.';
}

/** Days in a row we both showed up, from the plant's last 30 days (today counts once it's done). */
export function togetherStreak(last30: ('both' | 'one' | 'none')[]): number {
  const days = [...last30];
  if (days[days.length - 1] !== 'both') days.pop();
  let n = 0;
  for (let i = days.length - 1; i >= 0 && days[i] === 'both'; i--) n++;
  return n;
}
