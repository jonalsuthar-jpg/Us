import type { MediaKind, MediaMeta, Message, MessageRow, MessageStatus } from '../database.types';
import type { UsClient } from '../supabase';
import { uuid } from '../uuid';

const SELECT = '*, call:calls(*)';

export const PAGE_SIZE = 50;

/** Newest-first page of the thread; pass the oldest loaded created_at to page back. */
export async function fetchMessages(sb: UsClient, coupleId: string, before?: string): Promise<Message[]> {
  let q = sb
    .from('messages')
    .select(SELECT)
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function fetchMessage(sb: UsClient, id: string): Promise<Message | null> {
  const { data, error } = await sb.from('messages').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Message | null;
}

export interface DraftExtras {
  replyTo?: string | null;
  /** A reply to one of our snaps. */
  snapId?: string | null;
  media?: {
    kind: MediaKind;
    meta?: MediaMeta | null;
    /** Shown immediately while the file uploads. */
    localUri?: string;
    /** Photos and voice notes; GIFs and stickers are links and upload nothing. */
    upload?: { body: Blob | ArrayBuffer | Uint8Array; contentType: string };
    /** A file already in our folder (one of our saved stickers): nothing to upload. */
    path?: string;
  };
}

/** Build the optimistic row the UI shows immediately. */
export function draftMessage(coupleId: string, senderId: string, body: string | null, extras: DraftExtras = {}): Message {
  return {
    id: uuid(),
    couple_id: coupleId,
    sender_id: senderId,
    kind: 'text',
    body: body || null,
    call_id: null,
    status: 'sent',
    delivered_at: null,
    read_at: null,
    created_at: new Date().toISOString(),
    reply_to: extras.replyTo ?? null,
    media_path: extras.media?.path ?? null,
    media_kind: extras.media?.kind ?? null,
    media_meta: extras.media?.meta ?? null,
    reactions: {},
    pinned_at: null,
    pinned_by: null,
    snap_id: extras.snapId ?? null,
    call: null,
    pending: true,
    localUri: extras.media?.localUri,
    upload: extras.media?.upload,
  };
}

/**
 * Insert a message (uploading its photo / voice note first, if any). The
 * client-generated id makes retries idempotent, and the upload path is
 * derived from it, so a retry overwrites rather than duplicating the file.
 */
export async function sendMessage(sb: UsClient, draft: Message): Promise<MessageRow> {
  let mediaPath = draft.media_path;
  if (!mediaPath && draft.upload && draft.media_kind) {
    mediaPath = await uploadChatMedia(sb, draft.couple_id, draft.id, draft.upload.body, draft.upload.contentType);
  }
  const linked = isLinkedMedia(draft.media_kind);
  const { data, error } = await sb
    .from('messages')
    .insert({
      id: draft.id,
      couple_id: draft.couple_id,
      sender_id: draft.sender_id,
      body: draft.body?.trim() ? draft.body : null,
      reply_to: draft.reply_to,
      snap_id: draft.snap_id,
      media_path: mediaPath,
      media_kind: mediaPath || linked ? draft.media_kind : null,
      media_meta: mediaPath || linked ? draft.media_meta : null,
    })
    .select('*')
    .single();
  if (error) {
    // Unique violation on retry means the first attempt actually landed.
    if (error.code === '23505') {
      const existing = await fetchMessage(sb, draft.id);
      if (existing) return existing;
    }
    throw error;
  }
  return data;
}

/** Acknowledge my incoming messages (all of them when ids is omitted). */
export async function ackMessages(sb: UsClient, status: Exclude<MessageStatus, 'sent'>, ids?: string[]) {
  const { error } = await sb.rpc('ack_messages', { p_status: status, p_ids: ids ?? null });
  if (error) throw error;
}

// ------------------------------------------------------------------ media ---

export const CHAT_BUCKET = 'chat';

/** GIFs and stickers are GIPHY links rather than files in our folder. */
export function isLinkedMedia(kind: MediaKind | null | undefined): kind is 'gif' | 'sticker' {
  return kind === 'gif' || kind === 'sticker';
}

const MEDIA_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/gif': 'gif',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

/** Strip codec parameters ("audio/webm;codecs=opus" → "audio/webm"). */
export const baseMime = (type: string) => type.split(';')[0]!.trim().toLowerCase();

export async function uploadChatMedia(
  sb: UsClient,
  coupleId: string,
  messageId: string,
  body: Blob | ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const type = baseMime(contentType);
  const path = `${coupleId}/${messageId}.${MEDIA_EXT[type] ?? 'bin'}`;
  const { error } = await sb.storage.from(CHAT_BUCKET).upload(path, body, { contentType: type, upsert: true });
  if (error) throw error;
  return path;
}

/** Short-lived URLs for chat media, keyed by path. */
export async function chatMediaUrls(sb: UsClient, paths: string[], expiresIn = 6 * 3600): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await sb.storage.from(CHAT_BUCKET).createSignedUrls(unique, expiresIn);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

/** "0:42" */
export function formatVoiceLength(ms: number | undefined | null): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** One line describing a message, for reply quotes, pins, search and pushes. */
export function messagePreview(m: Pick<MessageRow, 'body' | 'media_kind' | 'kind'>): string {
  if (m.body?.trim()) return m.body.trim();
  if (m.media_kind === 'image') return '📷 Photo';
  if (m.media_kind === 'audio') return '🎤 Voice note';
  if (m.media_kind === 'gif') return 'GIF';
  if (m.media_kind === 'sticker') return 'Sticker';
  return m.kind === 'call' ? 'Call' : '';
}

// ------------------------------------------------ reactions, pins, search ---

export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'] as const;

/** Behind the "+" next to the quick reactions. Any emoji works; these are the ones a couple reaches for. */
export const MORE_REACTIONS = [
  '😍', '🥰', '😘', '🤗', '🥺', '😊', '😁', '🤣', '😅', '😉', '😎', '🤔',
  '😴', '😭', '😡', '🙄', '😬', '🤯', '🥳', '🙈', '💕', '💖', '💔', '✨',
  '🙏', '👏', '💪', '👌', '🤞', '🌹', '🎉', '💯',
] as const;

/** Set (or with null, remove) my reaction. */
export async function reactToMessage(sb: UsClient, id: string, emoji: string | null): Promise<MessageRow> {
  const { data, error } = await sb.rpc('react_to_message', { p_id: id, p_emoji: emoji });
  if (error) throw error;
  return data;
}

export async function pinMessage(sb: UsClient, id: string, pinned: boolean): Promise<MessageRow> {
  const { data, error } = await sb.rpc('pin_message', { p_id: id, p_pinned: pinned });
  if (error) throw error;
  return data;
}

/** Reactions grouped for display: [{ emoji, count, mine }], most used first. */
export function groupReactions(reactions: Record<string, string> | null | undefined, myId: string) {
  const out = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const [user, emoji] of Object.entries(reactions ?? {})) {
    const g = out.get(emoji) ?? { emoji, count: 0, mine: false };
    g.count++;
    if (user === myId) g.mine = true;
    out.set(emoji, g);
  }
  return [...out.values()].sort((a, b) => b.count - a.count);
}

export async function listPinned(sb: UsClient, coupleId: string): Promise<Message[]> {
  const { data, error } = await sb
    .from('messages')
    .select(SELECT)
    .eq('couple_id', coupleId)
    .not('pinned_at', 'is', null)
    .order('pinned_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Message[];
}

/** Escape LIKE wildcards so a search for "50%" means exactly that. */
export const escapeLike = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function searchMessages(sb: UsClient, coupleId: string, query: string): Promise<Message[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await sb
    .from('messages')
    .select(SELECT)
    .eq('couple_id', coupleId)
    .ilike('body', `%${escapeLike(q)}%`)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Message[];
}

const RANK: Record<MessageStatus, number> = { sent: 0, delivered: 1, read: 2 };

/** Merge an incoming row into local state without ever regressing its status. */
export function mergeMessage(existing: Message | undefined, incoming: Message): Message {
  if (!existing) return incoming;
  const status = RANK[incoming.status] >= RANK[existing.status] ? incoming.status : existing.status;
  return {
    ...existing,
    ...incoming,
    status,
    call: incoming.call ?? existing.call ?? null,
    pending: false,
    failed: false,
    // Keep the local preview so the bubble doesn't flash while the signed URL loads.
    localUri: incoming.localUri ?? existing.localUri,
    upload: undefined,
  };
}
