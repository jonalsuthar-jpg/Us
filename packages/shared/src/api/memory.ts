import type { Database, Memory, MemoryRating } from '../database.types';
import type { UsClient } from '../supabase';
import { uuid } from '../uuid';

type Insert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
type Update<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];

export const MEMORY_BUCKET = 'memories';

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
  const { error } = await sb.storage.from(MEMORY_BUCKET).upload(path, body, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

export async function removeMemoryPhoto(sb: UsClient, path: string): Promise<void> {
  const { error } = await sb.storage.from(MEMORY_BUCKET).remove([path]);
  if (error) throw error;
}

/** Short-lived URLs for private photos, keyed by path. */
export async function signedPhotoUrls(sb: UsClient, paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await sb.storage.from(MEMORY_BUCKET).createSignedUrls(unique, expiresIn);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
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
