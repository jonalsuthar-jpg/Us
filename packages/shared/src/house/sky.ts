/**
 * Our House's sky: where the sun is at this moment of the day, how light it
 * is, and today's weather. Pure, so both of us compute the same thing.
 *
 * Time follows the clock on this device: morning light in the morning, a
 * sunset in the evening, night at night. "Night for now" (the moon button)
 * overrides it for a few hours, for both of us (SKY_KEY in house_items).
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

/** Hours since midnight now, here. */
export const hoursNow = (d = new Date()) => d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;

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

/** "Night for now" lasts this long, then the clock takes over again. */
export const NIGHT_FOR_NOW_MS = 3 * 60 * 60 * 1000;

/** Whether it's night in the house: the moon button while it lasts, else the clock. */
export function isNight(sky: { on?: boolean; at?: string } | undefined, now: Date): boolean {
  const at = sky?.at ? Date.parse(sky.at) : NaN;
  if (sky?.on !== undefined && Number.isFinite(at) && now.getTime() - at < NIGHT_FOR_NOW_MS) return sky.on;
  return skyAt(hoursNow(now)).night;
}
