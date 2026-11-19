/**
 * Plans that repeat (weekly, monthly, yearly), expanded into the occurrences
 * that fall in a range. Dates are worked out on the calendar of the zone the
 * plan was made in (`repeat_tz`), so "the 1st of every month at 9" stays the
 * 1st at 9 there whatever UTC says.
 *
 * Pure, with no imports: the same file is copied to
 * supabase/functions/_shared/recurrence.ts for the reminders function (a
 * test checks the two stay identical).
 */

export type Repeat = 'none' | 'weekly' | 'monthly' | 'yearly';

export interface RepeatingEvent {
  id: string;
  starts_at: string;
  ends_at: string | null;
  repeat?: Repeat | null;
  repeat_tz?: string | null;
  /** Occurrences taken out ("Just this one"), as local dates YYYY-MM-DD. */
  skip_dates?: string[] | null;
}

export type Occurrence<T extends RepeatingEvent> = T & {
  /** The plan this occurrence belongs to (its row's id); `id` is "<series_id>@<date>" for repeats. */
  series_id: string;
  /** The local date of this occurrence. */
  occurrence: string;
};

interface Parts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
}

function partsIn(at: Date, tz: string): Parts {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
    const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
    return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute) };
  } catch {
    return { y: at.getUTCFullYear(), m: at.getUTCMonth() + 1, d: at.getUTCDate(), h: at.getUTCHours(), mi: at.getUTCMinutes() };
  }
}

/** The instant that reads as this wall time in `tz`. */
function fromParts(p: Parts, tz: string): Date {
  const guess = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  // The zone's offset at about that moment, applied twice to settle across a DST change.
  let at = guess;
  for (let i = 0; i < 2; i++) {
    const q = partsIn(new Date(at), tz);
    const seen = Date.UTC(q.y, q.m - 1, q.d, q.h, q.mi);
    at += guess - seen;
  }
  return new Date(at);
}

const dateKey = (p: Pick<Parts, 'y' | 'm' | 'd'>) => `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The local date (YYYY-MM-DD) an instant falls on in `tz`. */
export function localDateKey(iso: string, tz: string | null | undefined): string {
  return dateKey(partsIn(new Date(iso), tz || 'UTC'));
}

/** The k-th repeat's wall time, or null when that month (or year) has no such day. */
function nth(start: Parts, repeat: Repeat, k: number): Parts | null {
  if (repeat === 'weekly') {
    const d = new Date(Date.UTC(start.y, start.m - 1, start.d + 7 * k));
    return { ...start, y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  }
  if (repeat === 'monthly') {
    const months = start.m - 1 + k;
    const y = start.y + Math.floor(months / 12);
    const m = (((months % 12) + 12) % 12) + 1;
    return start.d <= daysIn(y, m) ? { ...start, y, m } : null;
  }
  const y = start.y + k;
  return start.d <= daysIn(y, start.m) ? { ...start, y } : null;
}

/** Every occurrence starting in [from, to), soonest first. Plans that don't repeat pass through. */
export function expandEvents<T extends RepeatingEvent>(events: T[], from: Date, to: Date): Occurrence<T>[] {
  const out: Occurrence<T>[] = [];
  for (const e of events) {
    const start = new Date(e.starts_at);
    const tz = e.repeat_tz || 'UTC';
    const repeat = e.repeat ?? 'none';
    if (repeat === 'none') {
      if (start >= from && start < to) out.push({ ...e, series_id: e.id, occurrence: localDateKey(e.starts_at, tz) });
      continue;
    }
    const length = e.ends_at ? new Date(e.ends_at).getTime() - start.getTime() : null;
    const first = partsIn(start, tz);
    const skip = new Set(e.skip_dates ?? []);
    // Start near the range rather than at the very first occurrence.
    const span = { weekly: 7 * 86_400_000, monthly: 28 * 86_400_000, yearly: 365 * 86_400_000 }[repeat];
    let k = Math.max(0, Math.floor((from.getTime() - start.getTime()) / span) - 2);
    if (repeat === 'monthly') k = Math.max(0, Math.floor(k * (28 / 31)) - 1);
    for (let guard = 0; guard < 2000; guard++, k++) {
      const p = nth(first, repeat, k);
      if (!p) continue;
      const at = fromParts(p, tz);
      if (at >= to) break;
      if (at < from || at < start) continue;
      const day = dateKey(p);
      if (skip.has(day)) continue;
      out.push({
        ...e,
        id: `${e.id}@${day}`,
        series_id: e.id,
        occurrence: day,
        starts_at: at.toISOString(),
        ends_at: length === null ? null : new Date(at.getTime() + length).toISOString(),
      });
    }
  }
  return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

/** The plan's own id, from an occurrence id ("<id>@<date>") or a plain one. */
export const seriesId = (id: string) => id.split('@')[0]!;
