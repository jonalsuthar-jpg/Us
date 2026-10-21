import type { Memory, MessageRow, SnapRow } from '../database.types';
import type { UsClient } from '../supabase';
import { uuid } from '../uuid';
import { MEMORY_BUCKET } from './memory';
import { draftMessage, sendMessage } from './messages';
import { toDateKey } from './plan';
import { notifyPartner } from './push';

/**
 * Snaps: photos that last 24 hours. RLS stops returning a snap the moment it
 * expires, and the snaps-cleanup function deletes it and its file hourly.
 */

export const SNAPS_BUCKET = 'snaps';
/** Broadcast on the couple channel whenever a snap is posted, seen, reacted to or deleted. */
export const SNAP_TOPIC = 'snaps';
export const SNAP_REACTIONS = ['❤️', '😂', '😍', '😮', '😢', '🔥'] as const;
/** Each snap shows this long in the story viewer before moving on. */
export const SNAP_SHOW_MS = 5000;

export interface Snap extends SnapRow {
  /** Signed URL, valid until the snap expires (at most an hour). */
  url: string | null;
}

export interface Snaps {
  /** Oldest first, the order a story plays in. */
  mine: Snap[];
  partner: Snap[];
}

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' };

export async function listSnaps(sb: UsClient, coupleId: string, myId: string, now = new Date()): Promise<Snaps> {
  const rows = unwrap<SnapRow[]>(
    await sb
      .from('snaps')
      .select('*')
      .eq('couple_id', coupleId)
      .gt('expires_at', now.toISOString())
      .order('created_at', { ascending: true }),
  );
  const urls: Record<string, string> = {};
  if (rows.length) {
    // One link lifetime for the batch: the soonest expiry, between a minute and an hour.
    const soonest = Math.min(...rows.map((r) => Date.parse(r.expires_at)));
    const expiresIn = Math.max(60, Math.min(3600, Math.floor((soonest - now.getTime()) / 1000)));
    const { data, error } = await sb.storage.from(SNAPS_BUCKET).createSignedUrls(rows.map((r) => r.photo_path), expiresIn);
    if (error) throw error;
    for (const row of data ?? []) if (row.path && row.signedUrl) urls[row.path] = row.signedUrl;
  }
  const snaps = rows.map((r) => ({ ...r, url: urls[r.photo_path] ?? null }));
  return { mine: snaps.filter((s) => s.author_id === myId), partner: snaps.filter((s) => s.author_id !== myId) };
}

/** Upload and share a snap. Throws "too_many_snaps" past 10 live snaps. */
export async function postSnap(
  sb: UsClient,
  coupleId: string,
  authorId: string,
  photo: { body: Blob | ArrayBuffer | Uint8Array; contentType: string },
  caption?: string | null,
): Promise<SnapRow> {
  const path = `${coupleId}/${uuid()}.${EXT[photo.contentType] ?? 'jpg'}`;
  const { error } = await sb.storage.from(SNAPS_BUCKET).upload(path, photo.body, { contentType: photo.contentType, upsert: false });
  if (error) throw error;
  const { data, error: insertError } = await sb
    .from('snaps')
    .insert({ couple_id: coupleId, author_id: authorId, photo_path: path, caption: caption?.trim() || null })
    .select('*')
    .single();
  if (insertError) {
    await sb.storage.from(SNAPS_BUCKET).remove([path]);
    throw insertError;
  }
  void notifyPartner(sb, { category: 'new_snap', snapId: data.id });
  return data;
}

/** I opened my partner's snap. */
export async function markSnapSeen(sb: UsClient, id: string): Promise<SnapRow> {
  return unwrap(await sb.rpc('mark_snap_seen', { p_id: id }));
}

/** React to my partner's snap (null takes it back). */
export async function reactToSnap(sb: UsClient, id: string, emoji: string | null): Promise<SnapRow> {
  const row = unwrap<SnapRow>(await sb.rpc('react_to_snap', { p_id: id, p_emoji: emoji }));
  if (emoji) void notifyPartner(sb, { category: 'snap_reaction', snapId: id });
  return row;
}

/** Delete one of my snaps before it expires. */
export async function deleteSnap(sb: UsClient, snap: Pick<SnapRow, 'id' | 'photo_path'>): Promise<void> {
  const { error } = await sb.storage.from(SNAPS_BUCKET).remove([snap.photo_path]);
  if (error) throw error;
  unwrap(await sb.from('snaps').delete().eq('id', snap.id));
}

/** Reply in chat, linked to the snap. */
export async function replyToSnap(sb: UsClient, snap: Pick<SnapRow, 'id' | 'couple_id'>, senderId: string, text: string) {
  const saved = await sendMessage(sb, draftMessage(snap.couple_id, senderId, text.trim(), { snapId: snap.id }));
  void notifyPartner(sb, { category: 'new_message', messageId: saved.id });
  return saved;
}

/**
 * Keep a snap in Memories: its photo is copied, so the memory outlives the
 * snap. Keeping it again (either of us) returns the memory already made.
 */
export async function keepSnap(
  sb: UsClient,
  snap: Pick<SnapRow, 'id' | 'couple_id' | 'photo_path' | 'caption' | 'created_at'>,
  keptBy: string,
  fallbackTitle: string,
): Promise<Memory> {
  const existing = unwrap<Memory | null>(await sb.from('memories').select('*').eq('from_snap', snap.id).maybeSingle());
  if (existing) return existing;
  const path = `${snap.couple_id}/${uuid()}.${snap.photo_path.split('.').pop() ?? 'jpg'}`;
  const { error } = await sb.storage.from(SNAPS_BUCKET).copy(snap.photo_path, path, { destinationBucket: MEMORY_BUCKET });
  if (error) throw error;
  const { data, error: insertError } = await sb
    .from('memories')
    .insert({
      couple_id: snap.couple_id,
      created_by: keptBy,
      title: snap.caption || fallbackTitle,
      happened_on: toDateKey(new Date(snap.created_at)),
      photo_path: path,
      from_snap: snap.id,
    })
    .select('*')
    .single();
  if (insertError) {
    await sb.storage.from(MEMORY_BUCKET).remove([path]);
    // My partner kept it at the same moment.
    if (insertError.code === '23505') {
      const kept = unwrap<Memory | null>(await sb.from('memories').select('*').eq('from_snap', snap.id).maybeSingle());
      if (kept) return kept;
    }
    throw insertError;
  }
  return data;
}

/** Which of these memories came from snaps, by snap id. */
export async function keptSnapIds(sb: UsClient, snapIds: string[]): Promise<Set<string>> {
  if (!snapIds.length) return new Set();
  const rows = unwrap<{ from_snap: string | null }[]>(await sb.from('memories').select('from_snap').in('from_snap', snapIds));
  return new Set(rows.map((r) => r.from_snap).filter((id): id is string => !!id));
}

// ------------------------------------------------------------- shaping ---

/** "23h left", "40m left". */
export function snapTimeLeft(expiresAt: string, now = new Date()): string {
  const ms = Math.max(0, Date.parse(expiresAt) - now.getTime());
  const hours = Math.floor(ms / 3_600_000);
  return hours >= 1 ? `${hours}h left` : `${Math.max(1, Math.ceil(ms / 60_000))}m left`;
}

/** The quote over a chat reply to a snap: whose snap, and what it was while it lasts. */
export function snapReplyQuote(
  m: Pick<MessageRow, 'sender_id' | 'snap_id'>,
  myId: string,
  partnerName: string,
  live: Pick<SnapRow, 'id' | 'caption'>[] = [],
): { author: string; text: string } | null {
  if (!m.snap_id) return null;
  const snap = live.find((s) => s.id === m.snap_id);
  return {
    author: m.sender_id === myId ? `${partnerName}’s snap` : 'Your snap',
    text: snap ? `📸 ${snap.caption ?? 'Photo'}` : '📸 Snap · expired',
  };
}

/** Where a story should open: the first snap I haven't seen, or the start. */
export function firstUnseen(snaps: Pick<SnapRow, 'seen_at'>[]): number {
  const i = snaps.findIndex((s) => !s.seen_at);
  return i === -1 ? 0 : i;
}
