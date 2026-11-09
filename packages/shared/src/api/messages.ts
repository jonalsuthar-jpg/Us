import { isEncryptedReaction, type ChatCipher } from '../crypto/chat-cipher';
import type { MediaKind, MediaMeta, Message, MessageRow, MessageStatus } from '../database.types';
import type { UsClient } from '../supabase';
import { uuid } from '../uuid';
import { isVideoPath, removeChatVideo, uploadChatVideo, videoUrls } from './chat-video';
import { signedUrls } from './signed-urls';
import { removeFiles, uploadFile } from './media';
import { isOurStickerPath } from './stickers';

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
    /** Photos, voice notes and videos; GIFs and stickers are links and upload nothing. */
    upload?: { body: Blob | ArrayBuffer | Uint8Array; contentType: string };
    /** A file already in our folder (one of our saved stickers): nothing to upload. With `upload`, where that goes. */
    path?: string;
    /** Keep the sticker in Ours once it's sent. */
    keep?: boolean;
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
    ciphertext: null,
    key_version: null,
    deleted_at: null,
    hidden_for: [],
    call: null,
    pending: true,
    localUri: extras.media?.localUri,
    upload: extras.media?.upload,
    keep: extras.media?.keep,
  };
}

/**
 * Insert a message (uploading its photo / voice note first, if any). The
 * client-generated id makes retries idempotent, and the upload path is
 * derived from it, so a retry overwrites rather than duplicating the file.
 *
 * With a cipher, the text, media details and file are encrypted on the way
 * out and only the ciphertext reaches the server.
 */
export async function sendMessage(sb: UsClient, draft: Message, cipher?: ChatCipher | null): Promise<MessageRow> {
  let mediaPath = draft.media_path;
  // A new sticker (from the keyboard or a paste): its file goes to the sticker path the draft already has.
  if (mediaPath && draft.upload && draft.media_kind === 'sticker') {
    const bytes = await toBytes(draft.upload.body);
    if (cipher) await uploadFile(sb, CHAT_BUCKET, mediaPath, cipher.encryptFile(mediaPath, bytes), ENCRYPTED_MIME);
    else await uploadFile(sb, CHAT_BUCKET, mediaPath, bytes, baseMime(draft.upload.contentType));
  }
  if (!mediaPath && draft.upload && draft.media_kind) {
    mediaPath =
      draft.media_kind === 'video'
        ? await uploadChatVideo(sb, draft.id, await toBytes(draft.upload.body), cipher)
        : await uploadChatMedia(sb, draft.couple_id, draft.id, draft.upload.body, draft.upload.contentType, cipher);
  }
  const linked = isLinkedMedia(draft.media_kind);
  const body = draft.body?.trim() ? draft.body : null;
  const meta = mediaPath || linked ? draft.media_meta : null;
  const ciphertext = cipher ? cipher.encryptMessage(draft, { body, meta, mime: draft.upload ? baseMime(draft.upload.contentType) : null }) : null;
  const { data, error } = await sb
    .from('messages')
    .insert({
      id: draft.id,
      couple_id: draft.couple_id,
      sender_id: draft.sender_id,
      body: ciphertext ? null : body,
      reply_to: draft.reply_to,
      snap_id: draft.snap_id,
      media_path: mediaPath,
      media_kind: mediaPath || linked ? draft.media_kind : null,
      media_meta: ciphertext ? null : meta,
      ciphertext,
      key_version: ciphertext ? cipher!.version : null,
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

export const CHAT_BUCKET = 'chat' as const;

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

/** Opaque bytes: what every encrypted file is uploaded as. */
export const ENCRYPTED_MIME = 'application/octet-stream';

export async function toBytes(body: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(await body.arrayBuffer());
}

/** With a cipher the file is encrypted first; its real type travels inside the message. */
export async function uploadChatMedia(
  sb: UsClient,
  coupleId: string,
  messageId: string,
  body: Blob | ArrayBuffer | Uint8Array,
  contentType: string,
  cipher?: ChatCipher | null,
): Promise<string> {
  const type = baseMime(contentType);
  if (cipher) {
    const path = `${coupleId}/${messageId}.enc`;
    const sealed = cipher.encryptFile(path, await toBytes(body));
    await uploadFile(sb, CHAT_BUCKET, path, sealed, ENCRYPTED_MIME);
    return path;
  }
  const path = `${coupleId}/${messageId}.${MEDIA_EXT[type] ?? 'bin'}`;
  await uploadFile(sb, CHAT_BUCKET, path, body, type);
  return path;
}

/** Signed URLs for chat media, keyed by path (reused while they last; see signed-urls). Videos are signed for R2. */
export async function chatMediaUrls(sb: UsClient, paths: string[], expiresIn?: number): Promise<Record<string, string>> {
  const videos = paths.filter(isVideoPath);
  const files = paths.filter((p) => !isVideoPath(p));
  const [a, b] = await Promise.all([signedUrls(sb, CHAT_BUCKET, files, expiresIn), videoUrls(sb, videos)]);
  return { ...a, ...b };
}

/** "0:42" */
export function formatVoiceLength(ms: number | undefined | null): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** One line describing a message, for reply quotes, pins, search and pushes. */
export function messagePreview(m: Pick<Message, 'body' | 'media_kind' | 'kind' | 'e2ee'> & { deleted_at?: string | null }): string {
  if (m.deleted_at) return 'This message was deleted';
  if (m.body?.trim()) return m.body.trim();
  if (m.e2ee === 'opening') return '';
  if (m.e2ee === 'locked') return '🔒 Encrypted message';
  if (m.e2ee === 'failed') return '🔒 Couldn’t open this message';
  if (m.media_kind === 'image') return '📷 Photo';
  if (m.media_kind === 'audio') return '🎤 Voice note';
  if (m.media_kind === 'video') return '🎥 Video';
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

/** Set (or with null, remove) my reaction; with a cipher it's encrypted. */
export async function reactToMessage(
  sb: UsClient,
  id: string,
  emoji: string | null,
  sealed?: { cipher: ChatCipher; me: string } | null,
): Promise<MessageRow> {
  const value = emoji && sealed ? sealed.cipher.encryptReaction(id, sealed.me, emoji) : emoji;
  const { data, error } = await sb.rpc('react_to_message', { p_id: id, p_emoji: value });
  if (error) throw error;
  return data;
}

/**
 * Delete a message: for everyone (mine only; both of us then see "This
 * message was deleted", and its file is removed), or just for me (hidden on
 * my devices). Saved stickers keep their file: Ours still uses it.
 */
export async function deleteMessage(sb: UsClient, m: Pick<Message, 'id' | 'media_path'>, forEveryone: boolean): Promise<MessageRow> {
  const { data, error } = await sb.rpc('delete_message', { p_id: m.id, p_for_everyone: forEveryone });
  if (error) throw error;
  if (forEveryone && m.media_path && !isOurStickerPath(m.media_path)) {
    await (isVideoPath(m.media_path) ? removeChatVideo(sb, m.id) : removeFiles(sb, CHAT_BUCKET, [m.media_path])).catch(() => {});
  }
  return data;
}

/** Hidden from me with "Delete for me". */
export const hiddenFor = (m: Pick<Message, 'hidden_for'>, me: string) => !!m.hidden_for?.includes(me);

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

/** Pinned messages, newest pin first, opened with the cipher when they're encrypted. */
export async function listPinned(sb: UsClient, coupleId: string, cipher: ChatCipher | null = null): Promise<Message[]> {
  const { data, error } = await sb
    .from('messages')
    .select(SELECT)
    .eq('couple_id', coupleId)
    .not('pinned_at', 'is', null)
    .order('pinned_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return openMessages((data ?? []) as Message[], cipher);
}

/** Escape LIKE wildcards so a search for "50%" means exactly that. */
export const escapeLike = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

const SEARCH_PAGE = 500;
const SEARCH_LIMIT = 50;

export interface SearchOptions {
  /** Called with everything found so far, as each stretch of history is read. */
  onProgress?: (found: Message[], done: boolean) => void;
  /** Stop reading (a newer search started). */
  signal?: { aborted: boolean };
}

/**
 * Search the thread on this device. The server can't read encrypted
 * messages, so history is read back a page at a time, opened here and
 * matched, newest first, until enough turn up or the thread runs out.
 */
export async function searchMessages(
  sb: UsClient,
  coupleId: string,
  query: string,
  cipher: ChatCipher | null,
  opts: SearchOptions = {},
): Promise<Message[]> {
  const q = query.trim().toLocaleLowerCase();
  if (q.length < 2) return [];
  const found: Message[] = [];
  let before: string | undefined;
  for (;;) {
    let page = sb.from('messages').select(SELECT).eq('couple_id', coupleId).eq('kind', 'text').order('created_at', { ascending: false }).limit(SEARCH_PAGE);
    if (before) page = page.lt('created_at', before);
    const { data, error } = await page;
    if (error) throw error;
    if (opts.signal?.aborted) return found;
    const rows = (data ?? []) as Message[];
    for (const m of openMessages(rows, cipher)) {
      if (found.length < SEARCH_LIMIT && m.body?.toLocaleLowerCase().includes(q)) found.push(m);
    }
    const done = rows.length < SEARCH_PAGE || found.length >= SEARCH_LIMIT;
    opts.onProgress?.([...found], done);
    if (done) return found;
    before = rows[rows.length - 1]!.created_at;
  }
}

// --------------------------------------------------------------- opening ---

type Opened = { body: string | null; meta: MediaMeta | null; mime: string | null } | null;

// A message's ciphertext never changes once set, so each is opened once per key.
const opened = new WeakMap<ChatCipher, Map<string, Opened>>();

function openPayload(m: Message, cipher: ChatCipher): Opened {
  let cache = opened.get(cipher);
  if (!cache) opened.set(cipher, (cache = new Map()));
  const hit = cache.get(m.id);
  if (hit !== undefined) return hit;
  let out: Opened = null;
  try {
    const p = cipher.decryptMessage(m, m.ciphertext!);
    out = {
      body: typeof p.body === 'string' ? p.body : null,
      meta: p.meta && typeof p.meta === 'object' ? p.meta : null,
      mime: typeof p.mime === 'string' ? p.mime : null,
    };
  } catch {
    out = null;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(m.id, out);
  return out;
}

function openReactions(m: Message, cipher: ChatCipher | null): Record<string, string> {
  const raw = m.reactions ?? {};
  if (!Object.values(raw).some(isEncryptedReaction)) return raw;
  const out: Record<string, string> = {};
  for (const [user, value] of Object.entries(raw)) {
    if (!isEncryptedReaction(value)) out[user] = value;
    else if (cipher) {
      // One that doesn't open isn't shown.
      try {
        out[user] = cipher.decryptReaction(m.id, user, value);
      } catch {
        // skip
      }
    }
  }
  return out;
}

/**
 * A row from the server, made readable. An encrypted message gets its text
 * and media details back (e2ee 'ok') or says why not ('opening': the key is
 * still being looked for; 'locked': this device has no key; 'failed': it
 * doesn't open). Older plain rows pass through.
 */
export function openMessage(m: Message, cipher: ChatCipher | null, opening = false): Message {
  const reactions = openReactions(m, cipher);
  if (!m.ciphertext) return reactions === m.reactions ? m : { ...m, reactions };
  if (!cipher) return { ...m, reactions, e2ee: opening ? 'opening' : 'locked' };
  const p = m.key_version === cipher.version ? openPayload(m, cipher) : null;
  if (!p) return { ...m, reactions, e2ee: 'failed' };
  return { ...m, reactions, body: p.body, media_meta: p.meta, mime: p.mime, e2ee: 'ok' };
}

export function openMessages(rows: Message[], cipher: ChatCipher | null): Message[] {
  return rows.map((m) => openMessage(m, cipher));
}

const RANK: Record<MessageStatus, number> = { sent: 0, delivered: 1, read: 2 };

/** Merge an incoming row into local state without ever regressing its status. */
export function mergeMessage(existing: Message | undefined, incoming: Message): Message {
  if (!existing) return incoming;
  const status = RANK[incoming.status] >= RANK[existing.status] ? incoming.status : existing.status;
  const merged: Message = {
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
  return sameMessage(existing, merged) ? existing : merged;
}

/** True when nothing on screen would differ, so a row can keep its identity and not redraw. */
function sameMessage(a: Message, b: Message): boolean {
  if (!!a.pending !== !!b.pending || !!a.failed !== !!b.failed || a.upload !== b.upload) return false;
  for (const key of Object.keys(b) as (keyof Message)[]) {
    if (key === 'pending' || key === 'failed' || key === 'upload') continue;
    const x = a[key];
    const y = b[key];
    if (x === y) continue;
    if (typeof x !== 'object' || typeof y !== 'object' || JSON.stringify(x) !== JSON.stringify(y)) return false;
  }
  return true;
}

/**
 * Merge rows into a thread kept oldest → newest. Rows that didn't change keep
 * their identity, and if nothing changed the same array comes back, so a
 * re-fetch of what's already on screen costs no redraw.
 */
export function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  const fresh = new Map(incoming.map((m) => [m.id, m]));
  let changed = false;
  const merged = prev.map((m) => {
    const update = fresh.get(m.id);
    if (!update) return m;
    fresh.delete(m.id);
    const next = mergeMessage(m, update);
    if (next !== m) changed = true;
    return next;
  });
  if (!changed && !fresh.size) return prev;
  const next = fresh.size ? [...merged, ...fresh.values()] : merged;
  // Timestamps sort as plain strings; localeCompare is far too slow for a long thread on Hermes.
  const sorted = next.every((m, i) => i === 0 || next[i - 1]!.created_at <= m.created_at);
  return sorted ? next : next.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
}

/**
 * Forget rows the server no longer has. `page` is the newest page, newest
 * first, and is the truth for the stretch of time it covers (back to the start
 * of the thread when `wholeThread`). Unsent drafts and anything newer than the
 * page, which arrived while it was being fetched, are left alone.
 */
export function dropDeleted(prev: Message[], page: Message[], wholeThread: boolean): Message[] {
  const seen = new Set(page.map((m) => m.id));
  const newest = page[0]?.created_at;
  const oldest = wholeThread ? undefined : page[page.length - 1]?.created_at;
  const next = prev.filter(
    (m) => m.pending || m.failed || seen.has(m.id) || (newest !== undefined && m.created_at > newest) || (oldest !== undefined && m.created_at < oldest),
  );
  return next.length === prev.length ? prev : next;
}
