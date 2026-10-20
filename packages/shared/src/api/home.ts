import type { CalendarEvent, Couple, Memory, Profile } from '../database.types';
import type { UsClient } from '../supabase';
import { partnerNudges } from './growth';
import { listMemories, onThisDay, removeMemoryPhoto, signedPhotoUrls, uploadMemoryPhoto } from './memory';
import { listEvents } from './plan';

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

// --------------------------------------------------------------- status ---

/** A status is a moment, not a bio: it quietly disappears after a day. */
export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
export const STATUS_MAX = 60;

export const STATUS_PRESETS: { emoji: string; text: string }[] = [
  { emoji: '🥰', text: 'missing you' },
  { emoji: '😊', text: 'happy' },
  { emoji: '😴', text: 'sleepy' },
  { emoji: '💼', text: 'busy' },
  { emoji: '🎧', text: 'focused' },
  { emoji: '🍕', text: 'hungry' },
  { emoji: '🤒', text: 'unwell' },
  { emoji: '🚗', text: 'on the way' },
];

export interface Status {
  emoji: string | null;
  text: string | null;
  at: string;
}

/** Someone's status if they set one in the last day, else null. */
export function freshStatus(p: Pick<Profile, 'status_emoji' | 'status_text' | 'status_at'>, now = new Date()): Status | null {
  if (!p.status_at || (!p.status_emoji && !p.status_text)) return null;
  if (now.getTime() - Date.parse(p.status_at) > STATUS_TTL_MS) return null;
  return { emoji: p.status_emoji, text: p.status_text, at: p.status_at };
}

/** Set (or with null, clear) my shared status. */
export async function setMyStatus(sb: UsClient, userId: string, status: { emoji: string | null; text: string | null } | null) {
  const text = status?.text?.trim().slice(0, STATUS_MAX) || null;
  const emoji = status?.emoji?.trim() || null;
  const clear = !status || (!text && !emoji);
  unwrap(
    await sb
      .from('profiles')
      .update(clear ? { status_emoji: null, status_text: null, status_at: null } : { status_emoji: emoji, status_text: text, status_at: new Date().toISOString() })
      .eq('id', userId),
  );
}

// ---------------------------------------------------------- the two of us ---

/** Whole days since pairing, counting the first day as day 1. */
export function daysTogether(pairedAt: string, now = new Date()): number {
  const start = new Date(pairedAt);
  const a = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(1, Math.floor((b - a) / 86_400_000) + 1);
}

/** Upload a new "photo of us", point the couple at it, then drop the old one. */
export async function setCouplePhoto(
  sb: UsClient,
  couple: Pick<Couple, 'id' | 'photo_path'>,
  body: Blob | ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const path = await uploadMemoryPhoto(sb, couple.id, body, contentType);
  unwrap(await sb.rpc('set_couple_photo', { p_path: path }));
  if (couple.photo_path) await removeMemoryPhoto(sb, couple.photo_path).catch(() => {});
  return path;
}

// ----------------------------------------------------------------- home ---

export type FeaturedMemory = Memory & { yearsAgo?: number };

/** "On this day" if there is one, else the latest memory with a photo, else the latest memory. */
export function featuredMemory(memories: Memory[], now = new Date()): FeaturedMemory | null {
  const anniversary = onThisDay(memories, now)[0];
  if (anniversary) return anniversary;
  return memories.find((m) => m.photo_path) ?? memories[0] ?? null;
}

export interface HomeData {
  me: Profile;
  partner: Profile;
  couple: Couple;
  photoUrl: string | null;
  nextEvent: CalendarEvent | null;
  memory: FeaturedMemory | null;
  memoryPhotoUrl: string | null;
  /** My partner asked for a little care recently. */
  nudged: boolean;
}

/** Everything the Home page shows, in one round of requests. */
export async function getHome(sb: UsClient, ids: { coupleId: string; meId: string }, now = new Date()): Promise<HomeData> {
  const [couple, profiles, events, memories, nudges] = await Promise.all([
    sb.from('couples').select('*').eq('id', ids.coupleId).single().then(unwrap<Couple>),
    sb.from('profiles').select('*').then(unwrap<Profile[]>),
    listEvents(sb, ids.coupleId, now, new Date(now.getTime() + 30 * 86_400_000)).catch(() => []),
    listMemories(sb, ids.coupleId).catch(() => []),
    partnerNudges(sb, 24).catch(() => []),
  ]);
  const me = profiles.find((p) => p.id === ids.meId);
  const partner = profiles.find((p) => p.id !== ids.meId);
  if (!me || !partner) throw new Error('Couldn’t load the two of you.');

  const memory = featuredMemory(memories, now);
  const paths = [couple.photo_path, memory?.photo_path].filter((p): p is string => !!p);
  const urls = paths.length ? await signedPhotoUrls(sb, paths).catch(() => ({}) as Record<string, string>) : {};

  return {
    me,
    partner,
    couple,
    photoUrl: (couple.photo_path && urls[couple.photo_path]) || null,
    nextEvent: events[0] ?? null,
    memory,
    memoryPhotoUrl: (memory?.photo_path && urls[memory.photo_path]) || null,
    nudged: nudges.length > 0,
  };
}

/** "just now", "12m ago", "3h ago". */
export function timeAgo(iso: string, now = new Date()): string {
  const mins = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}
