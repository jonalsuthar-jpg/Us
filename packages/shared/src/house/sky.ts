/**
 * Our House's sky: where the sun is at this moment of the day, how light it
 * is, and today's weather. Pure, so both of us compute the same thing.
 *
 * Time is the world's own: a whole day passes in 4 real hours (worldHours),
 * worked out from the real time so both of us always see the same hour, with
 * no syncing. "Night for now" (the moon button) overrides it for half an
 * hour, for both of us (SKY_KEY in house_items). Things that belong to real
 * days (the garden, letters, anniversaries, the weather) keep real days.
 */

export type Weather = 'clear' | 'cloudy' | 'rain' | 'fog';

export interface SkyNow {
  /** 0 midnight … 1 noon, smooth: how much daylight there is. */
  daylight: number;
  /** 0…1 how golden the light is (around sunrise and sunset). */
  golden: number;
  /** The sun's direction, as a point far away (x, y, z), y up. */
  sun: [number, number, number];
  night: boolean;
}

const SUNRISE = 6.25;
const SUNSET = 18.75;

/** The sky at a time of day (hours, 0–24, fractional). */
export function skyAt(hours: number): SkyNow {
  const h = ((hours % 24) + 24) % 24;
  const dayLen = SUNSET - SUNRISE;
  // Sun angle across the day: 0 at sunrise, π at sunset.
  const a = ((h - SUNRISE) / dayLen) * Math.PI;
  const up = Math.sin(a);
  const daylight = h >= SUNRISE - 0.6 && h <= SUNSET + 0.6 ? Math.min(1, Math.max(0, (up + 0.12) / 0.5)) : 0;
  const golden = Math.max(0, 1 - Math.abs(up) / 0.35) * (daylight > 0 ? 1 : 0);
  const height = Math.max(0.08, up) * 30;
  return {
    daylight,
    golden,
    sun: [Math.cos(a) * 30, height, 12],
    night: daylight < 0.15,
  };
}

/** Hours since midnight now, here (real time). */
export const hoursNow = (d = new Date()) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;

/** A world day lasts this long in real time: dawn to dawn in 4 hours. */
export const WORLD_DAY_MS = 4 * 60 * 60 * 1000;

/**
 * The world's time of day (hours, 0–24) at a real moment: 6× faster than the
 * clock, the same on both our phones whatever their time zones. Each couple's
 * day starts at its own hour.
 */
export function worldHours(now: Date | number = Date.now(), coupleId = ''): number {
  const t = typeof now === 'number' ? now : now.getTime();
  const h = (t / WORLD_DAY_MS) * 24 + (coupleId ? hash(coupleId) % 24 : 0);
  return ((h % 24) + 24) % 24;
}

/** "6:40 pm", for the clock on screen. */
export function formatWorldTime(hours: number): string {
  const total = Math.floor(hours * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** Real minutes until the world's next sunset (dusk), and until the next sunrise. */
export function untilWorld(hours: number): { dusk: number; dawn: number } {
  const real = (worldH: number) => (((worldH - hours + 24) % 24) / 24) * (WORLD_DAY_MS / 60_000);
  return { dusk: real(SUNSET), dawn: real(SUNRISE) };
}

/** A whole-number hash of a string (FNV-1a). */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Today's weather for the two of us: the same on both phones, a new one each day. */
export function weatherFor(coupleId: string, day: string): Weather {
  const n = hash(`${coupleId}:${day}`) % 100;
  if (n < 55) return 'clear';
  if (n < 78) return 'cloudy';
  if (n < 93) return 'rain';
  return 'fog';
}

/** "Night for now" lasts this long (3 world hours), then the world's clock takes over again. */
export const NIGHT_FOR_NOW_MS = 30 * 60 * 1000;

/** Whether it's night in the house: the moon button while it lasts, else the world's clock. */
export function isNight(sky: { on?: boolean; at?: string } | undefined, now: Date, coupleId = ''): boolean {
  const at = sky?.at ? Date.parse(sky.at) : NaN;
  if (sky?.on !== undefined && Number.isFinite(at) && now.getTime() - at < NIGHT_FOR_NOW_MS) return sky.on;
  return skyAt(worldHours(now, coupleId)).night;
}
