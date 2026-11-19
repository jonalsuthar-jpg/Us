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

/** Delete a memory and its photo (the photo first, so nothing is orphaned on success). */
export async function deleteMemory(sb: UsClient, memory: Pick<Memory, 'id' | 'photo_path'>): Promise<void> {
  if (memory.photo_path) await removeMemoryPhoto(sb, memory.photo_path);
  unwrap(await sb.from('memories').delete().eq('id', memory.id));
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
