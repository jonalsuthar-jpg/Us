import type { ArrivalCheck, Countdown, ListItem, ListName, LocationShare } from '../database.types';
import type { UsClient } from '../supabase';
import { fromDateKey, toDateKey } from './plan';
import { notifyPartner } from './push';

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

// ============================================================ countdowns ===

const DAY = 86_400_000;

/** Whole days from one YYYY-MM-DD key to another (negative if b is earlier). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!)) / DAY);
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** The date key of month/day in a given year; 29 Feb falls on 28 Feb in other years. */
function inYear(year: number, month: number, day: number): string {
  const d = month === 2 && day === 29 && !isLeap(year) ? 28 : day;
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * When a countdown next happens, on or after today. Yearly ones roll to next
 * year once passed (with how many years it marks); one-offs in the past are null.
 */
export function nextOccurrence(onDate: string, yearly: boolean, now = new Date()): { date: string; years: number } | null {
  const today = toDateKey(now);
  if (!yearly) return daysBetween(today, onDate) >= 0 ? { date: onDate, years: 0 } : null;
  const [y, m, d] = onDate.split('-').map(Number);
  let year = now.getFullYear();
  let date = inYear(year, m!, d!);
  if (daysBetween(today, date) < 0) date = inYear(++year, m!, d!);
  return { date, years: year - y! };
}

export interface Upcoming {
  key: string;
  title: string;
  emoji: string;
  /** YYYY-MM-DD */
  date: string;
  daysLeft: number;
  kind: 'countdown' | 'milestone' | 'anniversary';
  /** Years this occurrence marks (anniversaries, yearly countdowns), else 0. */
  years: number;
  countdown?: Countdown;
}

const DAY_MILESTONES = [100, 200, 300, 500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000, 20000];

/** The next day-count milestone and the next anniversary since pairing. */
export function relationshipMilestones(pairedAt: string, now = new Date()): Upcoming[] {
  const start = toDateKey(new Date(pairedAt));
  const today = toDateKey(now);
  const out: Upcoming[] = [];

  const dayNumber = daysBetween(start, today) + 1; // day 1 = the day you paired
  const next = DAY_MILESTONES.find((n) => n >= dayNumber);
  if (next) {
    const date = toDateKey(new Date(fromDateKey(start).getTime() + (next - 1) * DAY + DAY / 2));
    out.push({ key: `days-${next}`, title: `${next.toLocaleString()} days together`, emoji: '💞', date, daysLeft: next - dayNumber, kind: 'milestone', years: 0 });
  }

  const anniversary = nextOccurrence(start, true, now);
  if (anniversary && anniversary.years > 0) {
    out.push({
      key: `anniversary-${anniversary.years}`,
      title: anniversary.years === 1 ? 'One year together' : `${anniversary.years} years together`,
      emoji: '🥂',
      date: anniversary.date,
      daysLeft: daysBetween(today, anniversary.date),
      kind: 'anniversary',
      years: anniversary.years,
    });
  }
  return out;
}

/** Everything coming up, soonest first: your countdowns plus relationship milestones. */
export function upcoming(countdowns: Countdown[], pairedAt: string, now = new Date(), limit = 4): Upcoming[] {
  const today = toDateKey(now);
  const mine: Upcoming[] = [];
  for (const c of countdowns) {
    const occ = nextOccurrence(c.on_date, c.yearly, now);
    if (!occ) continue;
    mine.push({
      key: c.id,
      title: c.title,
      emoji: c.emoji || (c.yearly ? '🎉' : '✈️'),
      date: occ.date,
      daysLeft: daysBetween(today, occ.date),
      kind: 'countdown',
      years: c.yearly ? occ.years : 0,
      countdown: c,
    });
  }
  return [...mine, ...relationshipMilestones(pairedAt, now)]
    .sort((a, b) => a.daysLeft - b.daysLeft || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** "Today", "Tomorrow", "in 12 days". */
export function describeDaysLeft(n: number): string {
  if (n <= 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return `in ${n} days`;
}

export const COUNTDOWN_PRESETS: { emoji: string; title: string; yearly: boolean }[] = [
  { emoji: '✈️', title: 'Our trip', yearly: false },
  { emoji: '🎂', title: 'Birthday', yearly: true },
  { emoji: '💍', title: 'Anniversary', yearly: true },
  { emoji: '🏡', title: 'Moving day', yearly: false },
  { emoji: '🎫', title: 'The concert', yearly: false },
];

export async function listCountdowns(sb: UsClient, coupleId: string): Promise<Countdown[]> {
  return unwrap(await sb.from('countdowns').select('*').eq('couple_id', coupleId).order('on_date'));
}

export async function addCountdown(
  sb: UsClient,
  row: { couple_id: string; created_by: string; title: string; emoji: string | null; on_date: string; yearly: boolean },
): Promise<Countdown> {
  return unwrap(await sb.from('countdowns').insert(row).select('*').single());
}

export async function updateCountdown(sb: UsClient, id: string, patch: { title?: string; emoji?: string | null; on_date?: string; yearly?: boolean }) {
  unwrap(await sb.from('countdowns').update(patch).eq('id', id));
}

export async function deleteCountdown(sb: UsClient, id: string) {
  unwrap(await sb.from('countdowns').delete().eq('id', id));
}

// ================================================================= lists ===

export const LISTS: Record<ListName, { title: string; emoji: string; placeholder: string; doneLabel: string }> = {
  groceries: { title: 'Groceries', emoji: '🛒', placeholder: 'Oat milk, basil, the good bread…', doneLabel: 'In the basket' },
  bucket: { title: 'Bucket list', emoji: '🌍', placeholder: 'See the northern lights…', doneLabel: 'Done together' },
  watch: { title: 'To watch', emoji: '🎬', placeholder: 'A film or a show…', doneLabel: 'Watched' },
  read: { title: 'To read', emoji: '📚', placeholder: 'A book one of you mentioned…', doneLabel: 'Read' },
};
export const LIST_NAMES = Object.keys(LISTS) as ListName[];

/** Open items oldest first (the order you added them), then done ones, latest first. */
export function sortListItems(items: ListItem[]): ListItem[] {
  const open = items.filter((i) => !i.done_at).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const done = items.filter((i) => i.done_at).sort((a, b) => b.done_at!.localeCompare(a.done_at!));
  return [...open, ...done];
}

export async function listItems(sb: UsClient, coupleId: string): Promise<ListItem[]> {
  return unwrap(await sb.from('list_items').select('*').eq('couple_id', coupleId).order('created_at').limit(1000));
}

export async function addListItem(sb: UsClient, row: { couple_id: string; list: ListName; text: string; added_by: string; note?: string | null }) {
  const text = row.text.trim().slice(0, 200);
  if (!text) throw new Error('Write something first.');
  return unwrap<ListItem>(await sb.from('list_items').insert({ ...row, text }).select('*').single());
}

/** Tick (with my id) or untick an item. */
export async function setListItemDone(sb: UsClient, id: string, doneBy: string | null) {
  unwrap(await sb.from('list_items').update({ done_at: doneBy ? new Date().toISOString() : null, done_by: doneBy }).eq('id', id));
}

export async function deleteListItem(sb: UsClient, id: string) {
  unwrap(await sb.from('list_items').delete().eq('id', id));
}

export async function clearDoneItems(sb: UsClient, coupleId: string, list: ListName) {
  unwrap(await sb.from('list_items').delete().eq('couple_id', coupleId).eq('list', list).not('done_at', 'is', null));
}

// ======================================================= thinking of you ===

/** Changed-topic my partner's open apps listen on, to show the heart right away. */
export const TAP_TOPIC = 'tap';

/** Send a "thinking of you". Throws "too_soon" if tapped again within 10 seconds. */
export async function sendTap(sb: UsClient, coupleId: string, fromId: string) {
  const tap = unwrap<{ id: string }>(await sb.from('taps').insert({ couple_id: coupleId, from_id: fromId }).select('id').single());
  void notifyPartner(sb, { category: 'thinking_of_you', tapId: tap.id });
  return tap;
}

/** My partner's taps in the last day: how many, and the latest. */
export async function partnerTaps(sb: UsClient, coupleId: string, partnerId: string, now = new Date()) {
  const rows = unwrap<{ created_at: string }[]>(
    await sb
      .from('taps')
      .select('created_at')
      .eq('couple_id', coupleId)
      .eq('from_id', partnerId)
      .gte('created_at', new Date(now.getTime() - DAY).toISOString())
      .order('created_at', { ascending: false }),
  );
  return rows.length ? { count: rows.length, latest: rows[0]!.created_at } : null;
}

// ====================================================== location sharing ===

export const LOCATION_TOPIC = 'home:safety';
export const SHARE_DURATIONS = [
  { hours: 1, label: '1 hour' },
  { hours: 8, label: '8 hours' },
  { hours: 24, label: '24 hours' },
] as const;

export interface Coords {
  lat: number;
  lng: number;
  accuracy?: number | null;
}

export function isSharing(row: Pick<LocationShare, 'sharing_until'> | null | undefined, now = new Date()): boolean {
  return !!row?.sharing_until && Date.parse(row.sharing_until) > now.getTime();
}

/** Great-circle distance in metres. */
export function distanceMeters(a: Coords, b: Coords): number {
  const R = 6_371_000;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "120 m", "3.4 km", "42 km". */
export function describeDistance(m: number): string {
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return m < 10_000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000)} km`;
}

export const mapsUrl = (c: Coords) => `https://www.google.com/maps/search/?api=1&query=${c.lat.toFixed(6)},${c.lng.toFixed(6)}`;

/** My row plus my partner's, if they're sharing with me right now (RLS decides). */
export async function getLocations(sb: UsClient, meId: string): Promise<{ mine: LocationShare | null; theirs: LocationShare | null }> {
  const rows = unwrap<LocationShare[]>(await sb.from('location_shares').select('*'));
  return { mine: rows.find((r) => r.owner_id === meId) ?? null, theirs: rows.find((r) => r.owner_id !== meId) ?? null };
}

/** Start (or extend) sharing for `hours`, from where I am now. */
export async function startSharing(sb: UsClient, ids: { meId: string; coupleId: string }, coords: Coords, hours: number) {
  const until = new Date(Date.now() + Math.min(hours, 24) * 3600_000).toISOString();
  unwrap(
    await sb.from('location_shares').upsert(
      { owner_id: ids.meId, couple_id: ids.coupleId, lat: coords.lat, lng: coords.lng, accuracy_m: coords.accuracy ?? null, sharing_until: until },
      { onConflict: 'owner_id' },
    ),
  );
  void notifyPartner(sb, { category: 'location_shared' });
}

/** A fresh position while sharing. */
export async function updateMyLocation(sb: UsClient, meId: string, coords: Coords) {
  unwrap(await sb.from('location_shares').update({ lat: coords.lat, lng: coords.lng, accuracy_m: coords.accuracy ?? null }).eq('owner_id', meId));
}

/** Stop sharing. The server clears the coordinates too. */
export async function stopSharing(sb: UsClient, meId: string) {
  unwrap(await sb.from('location_shares').update({ sharing_until: null }).eq('owner_id', meId));
}

// ================================================= "tell me you're home" ===

/** Within this distance of the saved home spot counts as home. */
export const HOME_RADIUS_M = 150;

/** Recent checks (open, or settled in the last 12 hours), newest first. */
export async function listArrivalChecks(sb: UsClient, coupleId: string, now = new Date()): Promise<ArrivalCheck[]> {
  const since = new Date(now.getTime() - 12 * 3600_000).toISOString();
  return unwrap(
    await sb
      .from('arrival_checks')
      .select('*')
      .eq('couple_id', coupleId)
      .or(`and(arrived_at.is.null,cancelled_at.is.null),arrived_at.gte."${since}",cancelled_at.gte."${since}"`)
      .order('created_at', { ascending: false })
      .limit(10),
  );
}

export const isOpenCheck = (c: Pick<ArrivalCheck, 'arrived_at' | 'cancelled_at'>) => !c.arrived_at && !c.cancelled_at;

/** Ask my partner to let me know (traveller = them), or offer to let them know (traveller = me). */
export async function requestArrival(sb: UsClient, row: { couple_id: string; requested_by: string; traveller_id: string; label?: string }) {
  const check = unwrap<ArrivalCheck>(await sb.from('arrival_checks').insert(row).select('*').single());
  void notifyPartner(sb, { category: 'arrival', checkId: check.id });
  return check;
}

export async function markArrived(sb: UsClient, id: string) {
  const check = unwrap<ArrivalCheck>(await sb.rpc('mark_arrived', { p_id: id }));
  void notifyPartner(sb, { category: 'arrival', checkId: id });
  return check;
}

export async function cancelArrival(sb: UsClient, id: string) {
  return unwrap<ArrivalCheck>(await sb.rpc('cancel_arrival', { p_id: id }));
}

/** Should this device mark me arrived: I'm the traveller on an open check and I'm at home? */
export function shouldAutoArrive(
  check: Pick<ArrivalCheck, 'traveller_id' | 'arrived_at' | 'cancelled_at'> | null | undefined,
  meId: string,
  here: Coords | null,
  home: Coords | null,
): boolean {
  if (!check || !here || !home || check.traveller_id !== meId || !isOpenCheck(check)) return false;
  return distanceMeters(here, home) <= HOME_RADIUS_M + Math.min(here.accuracy ?? 0, 100);
}
