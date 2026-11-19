/**
 * Time capsules: a message written now, sealed until a date and time, then
 * opened into our chat by the server (see 20261121000300_time_capsules.sql).
 *
 * It's encrypted here for the chat message it will become: the capsule's id
 * is that message's id, so the ciphertext opens in the thread unchanged and
 * the server never reads it. Until then only I can see, change or cancel it;
 * my partner only knows that something is waiting, and when.
 */
import type { ChatCipher } from '../crypto/chat-cipher';
import type { Countdown, Database, MessageRow } from '../database.types';
import type { UsClient } from '../supabase';
import { uuid } from '../uuid';
import { nextOccurrence } from './together';
import { fromDateKey, toDateKey } from './plan';

export type Capsule = Database['public']['Tables']['time_capsules']['Row'];
export const CAPSULE_TOPIC = 'chat:capsules';

/** The soonest a capsule may open (the server checks this too). */
export const CAPSULE_MIN_MS = 10 * 60_000;

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

/** A local date (YYYY-MM-DD) and time (HH:MM) as the moment it names on this device. */
export function capsuleMoment(dateKey: string, time: string): Date | null {
  const m = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !m) return null;
  const at = fromDateKey(dateKey);
  at.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Why a moment can't be used, or null when it's fine. */
export function capsuleProblem(at: Date | null, now = new Date()): string | null {
  if (!at) return 'Pick a date and a time.';
  if (at.getTime() - now.getTime() < CAPSULE_MIN_MS) return 'Pick a moment at least 10 minutes from now.';
  if (at.getTime() - now.getTime() > 10 * 365 * 86_400_000) return 'Pick a moment within the next 10 years.';
  return null;
}

/** "Opens Sat 14 Feb 2027 at 21:00". */
export function formatCapsuleMoment(iso: string | Date): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} at ${time}`;
}

/** Quick picks for the date: in a month, in a year, our anniversary, their next birthday. */
export function capsuleDatePicks(countdowns: Pick<Countdown, 'title' | 'on_date' | 'yearly'>[], partnerName: string, now = new Date()): { label: string; date: string }[] {
  const plus = (months: number) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() + months);
    return toDateKey(d);
  };
  const picks = [
    { label: 'In a month', date: plus(1) },
    { label: 'In a year', date: plus(12) },
  ];
  const next = (match: (c: Pick<Countdown, 'title'>) => boolean) => {
    const c = countdowns.find((x) => x.yearly && match(x));
    const n = c ? nextOccurrence(c.on_date, true, now) : null;
    // Today's would be too soon to be a surprise: take next year's.
    if (n && n.date === toDateKey(now)) {
      const d = fromDateKey(n.date);
      d.setFullYear(d.getFullYear() + 1);
      return toDateKey(d);
    }
    return n?.date ?? null;
  };
  const anniversary = next((c) => /anniversary/i.test(c.title));
  if (anniversary) picks.push({ label: 'Our anniversary', date: anniversary });
  const first = partnerName.trim().split(/\s+/)[0]!.toLowerCase();
  const birthday = next((c) => /birthday/i.test(c.title) && c.title.toLowerCase().includes(first));
  if (birthday) picks.push({ label: `${partnerName}’s birthday`, date: birthday });
  return picks;
}

export const CAPSULE_TIMES = [
  { label: 'Morning', time: '09:00' },
  { label: 'Evening', time: '20:00' },
  { label: 'Midnight', time: '00:00' },
];

/** Seal a capsule to open at `at`. */
export async function sealCapsule(sb: UsClient, ids: { coupleId: string; me: string }, text: string, at: Date, cipher: ChatCipher): Promise<Capsule> {
  const body = text.trim();
  if (!body) throw new Error('Write something to seal.');
  const id = uuid();
  const sealedAt = new Date().toISOString();
  const ciphertext = cipher.encryptMessage({ couple_id: ids.coupleId, id, sender_id: ids.me }, { body, capsule: sealedAt });
  return unwrap(await sb.from('time_capsules').insert({ id, couple_id: ids.coupleId, sender_id: ids.me, ciphertext, key_version: cipher.version, deliver_at: at.toISOString() }).select('*').single());
}

/** The capsules I've sealed that haven't opened yet, soonest first. */
export async function listMyCapsules(sb: UsClient, me: string): Promise<Capsule[]> {
  return unwrap(await sb.from('time_capsules').select('*').eq('sender_id', me).is('delivered_at', null).order('deliver_at'));
}

/** What a capsule of mine says (only I can open it before it's delivered). */
export function capsuleText(c: Capsule, cipher: ChatCipher | null): string | null {
  if (!cipher || c.key_version !== cipher.version) return null;
  try {
    const p = cipher.decryptMessage({ couple_id: c.couple_id, id: c.id, sender_id: c.sender_id }, c.ciphertext);
    return typeof p.body === 'string' ? p.body : null;
  } catch {
    return null;
  }
}

/** New words or a new moment for one of mine, before it opens. */
export async function editCapsule(sb: UsClient, c: Capsule, change: { text?: string; at?: Date }, cipher: ChatCipher): Promise<void> {
  const patch: Database['public']['Tables']['time_capsules']['Update'] = {};
  if (change.text !== undefined) {
    const body = change.text.trim();
    if (!body) throw new Error('Write something to seal.');
    patch.ciphertext = cipher.encryptMessage({ couple_id: c.couple_id, id: c.id, sender_id: c.sender_id }, { body, capsule: c.created_at });
    patch.key_version = cipher.version;
  }
  if (change.at) patch.deliver_at = change.at.toISOString();
  unwrap(await sb.from('time_capsules').update(patch).eq('id', c.id));
}

export async function cancelCapsule(sb: UsClient, id: string): Promise<void> {
  unwrap(await sb.from('time_capsules').delete().eq('id', id));
}

/** Open one of mine now, into the chat. */
export async function openCapsuleNow(sb: UsClient, id: string): Promise<MessageRow> {
  return unwrap(await sb.rpc('open_capsule_now', { p_id: id }));
}

/** How many my partner has sealed for me, and when the next one opens. */
export async function capsulesWaiting(sb: UsClient): Promise<{ waiting: number; nextAt: string | null }> {
  const rows = unwrap(await sb.rpc('capsules_waiting_for_me'));
  const r = (rows ?? [])[0];
  return { waiting: r?.waiting ?? 0, nextAt: r?.next_at ?? null };
}
