import type { Database, Memory, MemoryRating } from '../database.types';
import type { UsClient } from '../supabase';
import { uuid } from '../uuid';
import { forgetSignedUrl, signedUrls } from './signed-urls';
import { removeFiles, uploadFile } from './media';

type Insert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
type Update<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

export const MEMORY_BUCKET = 'memories' as const;

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

export async function listMemories(sb: UsClient, coupleId: string): Promise<Memory[]> {
  return unwrap(
    await sb
      .from('memories')
      .select('*')
      .eq('couple_id', coupleId)
      .order('happened_on', { ascending: false })
      .order('created_at', { ascending: false }),
  );
}

/**
 * Just what Home needs to pick its memory (see featuredMemory): this date in
 * earlier years, the latest with a photo, and the latest. Three tiny reads
 * instead of the whole timeline.
 */
export async function listHomeMemories(sb: UsClient, coupleId: string, now = new Date()): Promise<Memory[]> {
  const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const sameDay = Array.from({ length: 60 }, (_, i) => `${now.getFullYear() - 1 - i}-${md}`);
  const base = () => sb.from('memories').select('*').eq('couple_id', coupleId);
  const [onDay, withPhoto, latest] = await Promise.all([
    base().in('happened_on', sameDay).then(unwrap<Memory[]>),
    base().not('photo_path', 'is', null).order('happened_on', { ascending: false }).order('created_at', { ascending: false }).limit(1).then(unwrap<Memory[]>),
    base().order('happened_on', { ascending: false }).order('created_at', { ascending: false }).limit(1).then(unwrap<Memory[]>),
  ]);
  const seen = new Set<string>();
  return [...onDay, ...withPhoto, ...latest].filter((m) => !seen.has(m.id) && !!seen.add(m.id));
}

export async function createMemory(sb: UsClient, row: Insert<'memories'>): Promise<Memory> {
  return unwrap(await sb.from('memories').insert(row).select('*').single());
}

export async function updateMemory(sb: UsClient, id: string, patch: Update<'memories'>): Promise<Memory> {
  return unwrap(await sb.from('memories').update(patch).eq('id', id).select('*').single());
}

/** Every photo of a memory, cover first (older rows have only photo_path). */
export function memoryPhotos(m: Pick<Memory, 'photo_path'> & { photo_paths?: string[] | null }): string[] {
  if (m.photo_paths?.length) return m.photo_paths;
  return m.photo_path ? [m.photo_path] : [];
}

/** At most this many photos on one memory. */
export const MEMORY_PHOTOS_MAX = 10;

/** Delete a memory with its photos and video (the files first, so nothing is orphaned on success). */
export async function deleteMemory(sb: UsClient, memory: Pick<Memory, 'id' | 'photo_path'> & { photo_paths?: string[] | null; video_path?: string | null }): Promise<void> {
  const files = [...memoryPhotos(memory), ...(memory.video_path ? [memory.video_path] : [])];
  if (files.length) {
    await removeFiles(sb, MEMORY_BUCKET, files);
    files.forEach((f) => forgetSignedUrl(MEMORY_BUCKET, f));
  }
  unwrap(await sb.from('memories').delete().eq('id', memory.id));
}

/** A memory's video, to "<couple_id>/video/<uuid>.<ext>" in the private bucket; returns the path. */
export async function uploadMemoryVideo(sb: UsClient, coupleId: string, body: Blob | ArrayBuffer | Uint8Array, contentType: string): Promise<string> {
  const ext = contentType === 'video/quicktime' ? 'mov' : contentType === 'video/webm' ? 'webm' : 'mp4';
  const path = `${coupleId}/video/${uuid()}.${ext}`;
  await uploadFile(sb, MEMORY_BUCKET, path, body, contentType);
  return path;
}

// ----------------------------------------------------------------- photos ---

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

/** Upload to "<couple_id>/<uuid>.<ext>" in the private bucket; returns the path. */
export async function uploadMemoryPhoto(
  sb: UsClient,
  coupleId: string,
  body: Blob | ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const path = `${coupleId}/${uuid()}.${EXT[contentType] ?? 'jpg'}`;
  await uploadFile(sb, MEMORY_BUCKET, path, body, contentType);
  return path;
}

export async function removeMemoryPhoto(sb: UsClient, path: string): Promise<void> {
  await removeFiles(sb, MEMORY_BUCKET, [path]);
  forgetSignedUrl(MEMORY_BUCKET, path);
}

/** Signed URLs for private photos, keyed by path (reused while they last; see signed-urls). */
export function signedPhotoUrls(sb: UsClient, paths: string[], expiresIn?: number): Promise<Record<string, string>> {
  return signedUrls(sb, MEMORY_BUCKET, paths, expiresIn);
}

// ---------------------------------------------------------------- ratings ---

/** My private ratings (RLS returns only mine), keyed by memory id. */
export async function myRatings(sb: UsClient): Promise<Record<string, MemoryRating>> {
  const rows = unwrap(await sb.from('memory_ratings').select('*'));
  return Object.fromEntries(rows.map((r) => [r.memory_id, r]));
}

export async function saveMyRating(
  sb: UsClient,
  row: { memory_id: string; owner_id: string; rating: number | null; note: string | null },
): Promise<void> {
  unwrap(await sb.from('memory_ratings').upsert(row, { onConflict: 'memory_id,owner_id' }));
}

// ------------------------------------------------------------- shaping ---

/** Memories from this calendar day in earlier years, most recent first. */
export function onThisDay(memories: Memory[], now = new Date()): (Memory & { yearsAgo: number })[] {
  const md = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return memories
    .filter((m) => m.happened_on.slice(5) === md && Number(m.happened_on.slice(0, 4)) < now.getFullYear())
    .map((m) => ({ ...m, yearsAgo: now.getFullYear() - Number(m.happened_on.slice(0, 4)) }))
    .sort((a, b) => a.yearsAgo - b.yearsAgo);
}

/** Timeline sections, newest first: "October 2026", "June 2025". */
export function groupByMonth(memories: Memory[]): { key: string; label: string; items: Memory[] }[] {
  const groups: { key: string; label: string; items: Memory[] }[] = [];
  const sorted = [...memories].sort((a, b) => b.happened_on.localeCompare(a.happened_on));
  for (const m of sorted) {
    const key = m.happened_on.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(m);
    else {
      const [y, mo] = key.split('-').map(Number);
      const label = new Date(y!, mo! - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      groups.push({ key, label, items: [m] });
    }
  }
  return groups;
}

export const MEMORY_KINDS: { value: Memory['kind']; label: string }[] = [
  { value: 'moment', label: 'Moment' },
  { value: 'date', label: 'Date' },
  { value: 'trip', label: 'Trip' },
];

// ------------------------------------------------------------------ recap ---

export interface YearRecap {
  year: number;
  memories: number;
  photos: number;
  trips: number;
  dates: number;
  /** The month with the most memories, e.g. "June", and how many. */
  busiest: { month: string; count: number } | null;
  /** The year's first memory. */
  first: Memory | null;
  /** Up to six photos for the collage, spread across the year (cover photos first). */
  highlights: string[];
  /** Days together by the end of that year (or today, for this year). */
  daysTogether: number;
}

/** "Our year": what this year's memories add up to. Pure, so it's easy to test. */
export function yearRecap(all: (Memory & { photo_paths?: string[] | null })[], year: number, pairedAt: string, now = new Date()): YearRecap {
  const mine = all.filter((m) => m.happened_on.startsWith(`${year}-`)).sort((a, b) => a.happened_on.localeCompare(b.happened_on));
  const byMonth = new Map<string, number>();
  for (const m of mine) byMonth.set(m.happened_on.slice(5, 7), (byMonth.get(m.happened_on.slice(5, 7)) ?? 0) + 1);
  const top = [...byMonth.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const covers = mine.filter((m) => memoryPhotos(m).length);
  // Every k-th cover, so the collage spans the year rather than one busy week.
  const step = Math.max(1, Math.floor(covers.length / 6));
  const highlights = covers.filter((_, i) => i % step === 0).slice(0, 6).map((m) => memoryPhotos(m)[0]!);
  const end = year < now.getFullYear() ? new Date(year, 11, 31) : now;
  const start = new Date(pairedAt);
  return {
    year,
    memories: mine.length,
    photos: mine.reduce((n, m) => n + memoryPhotos(m).length, 0),
    trips: mine.filter((m) => m.kind === 'trip').length,
    dates: mine.filter((m) => m.kind === 'date').length,
    busiest: top ? { month: new Date(year, Number(top[0]) - 1, 15).toLocaleDateString(undefined, { month: 'long' }), count: top[1] } : null,
    first: mine[0] ?? null,
    highlights,
    daysTogether: Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1),
  };
}

/** Messages and calls between us in a year, for the recap (counts only, nothing is read). */
export async function recapCounts(sb: UsClient, coupleId: string, year: number): Promise<{ messages: number; calls: number }> {
  const from = new Date(year, 0, 1).toISOString();
  const to = new Date(year + 1, 0, 1).toISOString();
  const count = (kind: 'text' | 'call') =>
    sb.from('messages').select('id', { count: 'exact', head: true }).eq('couple_id', coupleId).eq('kind', kind).gte('created_at', from).lt('created_at', to);
  const [m, c] = await Promise.all([count('text'), count('call')]);
  return { messages: m.count ?? 0, calls: c.count ?? 0 };
}

/** Offer "Our year" in December, and in the week after our pairing anniversary. */
export function offerRecap(pairedAt: string, now = new Date()): boolean {
  if (now.getMonth() === 11) return true;
  const p = new Date(pairedAt);
  const anniversary = new Date(now.getFullYear(), p.getMonth(), p.getDate());
  const days = (now.getTime() - anniversary.getTime()) / 86_400_000;
  return now.getFullYear() > p.getFullYear() && days >= 0 && days < 7;
}
