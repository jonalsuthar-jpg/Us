import type { PlantDay, Profile } from '../database.types';
import type { UsClient } from '../supabase';
import type { PartnerSlot } from '../tokens';

/**
 * Our little plant. It grows one step for every day we both did something
 * for each other (a snap, a tap, a message, today's question, a call), which
 * triggers record in plant_days. It never shrinks; it droops when we go quiet.
 */

export const PLANT_TOPIC = 'plant';

export type PlantStageKey = 'seed' | 'sprout' | 'seedling' | 'young' | 'bud' | 'flower' | 'bloom' | 'tree';

export interface PlantStage {
  key: PlantStageKey;
  /** Together days needed to reach it. */
  at: number;
  name: string;
}

export const PLANT_STAGES: PlantStage[] = [
  { key: 'seed', at: 0, name: 'a seed' },
  { key: 'sprout', at: 1, name: 'a sprout' },
  { key: 'seedling', at: 3, name: 'a seedling' },
  { key: 'young', at: 7, name: 'a young plant' },
  { key: 'bud', at: 14, name: 'budding' },
  { key: 'flower', at: 30, name: 'in flower' },
  { key: 'bloom', at: 60, name: 'in full bloom' },
  { key: 'tree', at: 100, name: 'a blossoming tree' },
];

/** What a day looked like: both of us showed up, one of us, or neither. */
export type PlantDot = 'both' | 'one' | 'none';

export interface PlantState {
  togetherDays: number;
  stage: PlantStage;
  /** Index into PLANT_STAGES. */
  level: number;
  next: PlantStage | null;
  daysToNext: number | null;
  today: { me: boolean; partner: boolean };
  /** We both showed up today. */
  grewToday: boolean;
  /** Neither today nor yesterday was a together day (and it has started growing). */
  drooping: boolean;
  /** The last 30 days, oldest first, ending today. */
  last30: PlantDot[];
  /** Morning, day, evening or night on the couple's clock, for the scene's sky. */
  daypart: 'morning' | 'day' | 'evening' | 'night';
}

export interface PlantData {
  days: PlantDay[];
  /** Partner A's zone: the couple's clock. */
  timezone: string;
}

export const DEFAULT_PLANT_TZ = 'Asia/Kolkata';

export async function getPlant(sb: UsClient, coupleId: string, userAId: string): Promise<PlantData> {
  const [days, a] = await Promise.all([
    sb.from('plant_days').select('*').eq('couple_id', coupleId).order('day', { ascending: true }),
    sb.from('profiles').select('timezone').eq('id', userAId).maybeSingle(),
  ]);
  if (days.error) throw days.error;
  return { days: days.data ?? [], timezone: a.data?.timezone ?? DEFAULT_PLANT_TZ };
}

/** Keep my profile's zone in step with this device, so the couple's "today" is right. */
export async function setMyTimezone(sb: UsClient, me: Pick<Profile, 'id' | 'timezone'>): Promise<void> {
  let tz: string | undefined;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return;
  }
  if (!tz || tz === me.timezone) return;
  await sb.from('profiles').update({ timezone: tz }).eq('id', me.id);
}

/** YYYY-MM-DD and the hour for a moment on a given clock. */
export function clockIn(tz: string, at: Date): { day: string; hour: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(at)
      .reduce<Record<string, string>>((o, p) => ((o[p.type] = p.value), o), {});
    return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return { day: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`, hour: at.getHours() };
  }
}

/** The day before a YYYY-MM-DD key (calendar arithmetic, no time zones involved). */
function dayBefore(key: string, n = 1): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function plantState(data: PlantData, mySlot: PartnerSlot, now = new Date()): PlantState {
  const { day: today, hour } = clockIn(data.timezone, now);
  const byDay = new Map(data.days.map((d) => [d.day, d]));
  const both = (d?: PlantDay) => !!d?.a_at && !!d?.b_at;

  const togetherDays = data.days.filter(both).length;
  let level = 0;
  PLANT_STAGES.forEach((s, i) => {
    if (togetherDays >= s.at) level = i;
  });
  const stage = PLANT_STAGES[level]!;
  const next = PLANT_STAGES[level + 1] ?? null;

  const t = byDay.get(today);
  const mine = mySlot === 'a' ? t?.a_at : t?.b_at;
  const theirs = mySlot === 'a' ? t?.b_at : t?.a_at;
  const grewToday = both(t);

  const last30: PlantDot[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = byDay.get(dayBefore(today, i));
    last30.push(both(d) ? 'both' : d?.a_at || d?.b_at ? 'one' : 'none');
  }

  return {
    togetherDays,
    stage,
    level,
    next,
    daysToNext: next ? next.at - togetherDays : null,
    today: { me: !!mine, partner: !!theirs },
    grewToday,
    drooping: togetherDays > 0 && !grewToday && !both(byDay.get(dayBefore(today))),
    last30,
    daypart: hour < 5 || hour >= 21 ? 'night' : hour < 11 ? 'morning' : hour < 17 ? 'day' : 'evening',
  };
}

/** The line under the plant: what today looks like, from my side. */
export function plantLine(s: PlantState, partnerName: string): string {
  if (s.grewToday) return s.level === 0 ? 'Planted today 🌱' : 'You both watered it today. It grew 🌿';
  if (s.today.partner) return `${partnerName} watered it today. Your turn 🌱`;
  if (s.today.me) return `You watered it today. Waiting for ${partnerName} 💧`;
  if (s.drooping) return 'It misses you two. A message or a snap will perk it up 🥀';
  return 'A snap, a message or a call from each of you waters it 💧';
}
