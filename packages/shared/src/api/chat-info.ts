/**
 * The chat's info screen: our media, links and voice notes, what our chat
 * adds up to, what I saved, my nickname for my partner, and the theme we share.
 *
 * Messages are end-to-end encrypted, so the server only filters on what it
 * can see (the media kind, the sender, dates and call rows); links,
 * reactions and text are worked out here, on the device.
 */
import type { ChatCipher } from '../crypto/chat-cipher';
import type { Message } from '../database.types';
import type { UsClient } from '../supabase';
import { isChatTheme, type ChatTheme } from '../chat-themes';
import { firstLink, linkPreviewOf } from './links';
import { hiddenFor, openMessages, openReactions } from './messages';

const SELECT = '*, call:calls(*)';

export const CHAT_THEME_TOPIC = 'chat:theme';
/** Mine alone: nothing pings it but my own saves. */
export const SAVED_TOPIC = 'chat:saved';

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

// ------------------------------------------------------------------ media ---

export const MEDIA_PAGE = 60;

/** Photos and videos, newest first, a page at a time (pass the oldest created_at to go back). */
export async function listChatMedia(sb: UsClient, coupleId: string, me: string, cipher: ChatCipher | null, before?: string): Promise<Message[]> {
  let q = sb.from('messages').select(SELECT).eq('couple_id', coupleId).in('media_kind', ['image', 'video']).is('deleted_at', null).order('created_at', { ascending: false }).limit(MEDIA_PAGE);
  if (before) q = q.lt('created_at', before);
  const rows = unwrap(await q) as Message[];
  return openMessages(rows.filter((m) => !hiddenFor(m, me)), cipher);
}

/** Voice notes, newest first. */
export async function listVoiceNotes(sb: UsClient, coupleId: string, me: string, cipher: ChatCipher | null, before?: string): Promise<Message[]> {
  let q = sb.from('messages').select(SELECT).eq('couple_id', coupleId).eq('media_kind', 'audio').is('deleted_at', null).order('created_at', { ascending: false }).limit(40);
  if (before) q = q.lt('created_at', before);
  const rows = unwrap(await q) as Message[];
  return openMessages(rows.filter((m) => !hiddenFor(m, me)), cipher);
}

const SCAN_PAGE = 500;
const LINKS_LIMIT = 100;

/**
 * Messages with a link, newest first. The text is encrypted, so the thread
 * is read here a page at a time, reporting what's found as it goes.
 */
export async function scanLinks(
  sb: UsClient,
  coupleId: string,
  me: string,
  cipher: ChatCipher | null,
  opts: { onProgress?: (found: Message[], done: boolean) => void; signal?: AbortSignal } = {},
): Promise<Message[]> {
  const found: Message[] = [];
  let before: string | undefined;
  for (;;) {
    let q = sb.from('messages').select(SELECT).eq('couple_id', coupleId).eq('kind', 'text').is('media_kind', null).is('deleted_at', null).order('created_at', { ascending: false }).limit(SCAN_PAGE);
    if (before) q = q.lt('created_at', before);
    const rows = unwrap(await q) as Message[];
    if (opts.signal?.aborted) return found;
    for (const m of openMessages(rows, cipher)) {
      if (found.length < LINKS_LIMIT && !hiddenFor(m, me) && (linkPreviewOf(m.media_meta) || firstLink(m.body))) found.push(m);
    }
    const done = rows.length < SCAN_PAGE || found.length >= LINKS_LIMIT;
    opts.onProgress?.([...found], done);
    if (done) return found;
    before = rows[rows.length - 1]!.created_at;
  }
}

// ------------------------------------------------------------ in numbers ---

export interface ChatNumbers {
  mine: number;
  theirs: number;
  photos: number;
  videos: number;
  voiceNotes: number;
  /** Calls that were picked up, how long they ran altogether, and the longest. */
  calls: number;
  callMs: number;
  longestCallMs: number;
  firstMessageAt: string | null;
  /** The reaction we use most (in the recent messages read), and how often. */
  topReaction: { emoji: string; count: number } | null;
}

/** The adding-up behind chatStats, pure so it can be tested. */
export function summarizeChat(input: {
  mine: number;
  theirs: number;
  photos: number;
  videos: number;
  voiceNotes: number;
  calls: { answered_at: string | null; ended_at: string | null }[];
  firstMessageAt: string | null;
  reactions: Record<string, string>[];
}): ChatNumbers {
  let callMs = 0;
  let longestCallMs = 0;
  let calls = 0;
  for (const c of input.calls) {
    if (!c.answered_at) continue;
    calls++;
    if (!c.ended_at) continue;
    const ms = Math.max(0, Date.parse(c.ended_at) - Date.parse(c.answered_at));
    callMs += ms;
    longestCallMs = Math.max(longestCallMs, ms);
  }
  const tally = new Map<string, number>();
  for (const r of input.reactions) for (const e of Object.values(r)) tally.set(e, (tally.get(e) ?? 0) + 1);
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    mine: input.mine,
    theirs: input.theirs,
    photos: input.photos,
    videos: input.videos,
    voiceNotes: input.voiceNotes,
    calls,
    callMs,
    longestCallMs,
    firstMessageAt: input.firstMessageAt,
    topReaction: top ? { emoji: top[0], count: top[1] } : null,
  };
}

/** Counts only: nothing of what we wrote is read on the server. */
export async function chatStats(sb: UsClient, ids: { coupleId: string; me: string; partner: string }, cipher: ChatCipher | null): Promise<ChatNumbers> {
  const count = async (build: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => (await build(base())).count ?? 0;
  const base = () => sb.from('messages').select('id', { count: 'exact', head: true }).eq('couple_id', ids.coupleId).is('deleted_at', null);
  const [mine, theirs, photos, videos, voiceNotes, calls, first, recent] = await Promise.all([
    count((q) => q.eq('kind', 'text').eq('sender_id', ids.me)),
    count((q) => q.eq('kind', 'text').eq('sender_id', ids.partner)),
    count((q) => q.eq('media_kind', 'image')),
    count((q) => q.eq('media_kind', 'video')),
    count((q) => q.eq('media_kind', 'audio')),
    sb.from('calls').select('answered_at, ended_at').eq('couple_id', ids.coupleId).not('answered_at', 'is', null).limit(5000).then(unwrap),
    sb.from('messages').select('created_at').eq('couple_id', ids.coupleId).order('created_at', { ascending: true }).limit(1).maybeSingle().then(unwrap),
    sb.from('messages').select('id, reactions').eq('couple_id', ids.coupleId).filter('reactions', 'neq', '{}').order('created_at', { ascending: false }).limit(1000).then(unwrap),
  ]);
  return summarizeChat({
    mine,
    theirs,
    photos,
    videos,
    voiceNotes,
    calls: (calls ?? []) as { answered_at: string | null; ended_at: string | null }[],
    firstMessageAt: (first as { created_at: string } | null)?.created_at ?? null,
    reactions: ((recent ?? []) as Pick<Message, 'id' | 'reactions'>[]).map((m) => openReactions(m, cipher)),
  });
}

/** "2 h 14 min", "45 min", "under a minute". */
export function formatCallTime(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return 'under a minute';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// -------------------------------------------------------- saved messages ---

/** Ids of the messages I saved (private to me). */
export async function savedIds(sb: UsClient, me: string): Promise<Set<string>> {
  const rows = unwrap(await sb.from('saved_messages').select('message_id').eq('owner_id', me).limit(2000));
  return new Set((rows ?? []).map((r) => r.message_id));
}

export async function setSaved(sb: UsClient, me: string, messageId: string, saved: boolean): Promise<void> {
  if (saved) unwrap(await sb.from('saved_messages').upsert({ owner_id: me, message_id: messageId }));
  else unwrap(await sb.from('saved_messages').delete().eq('owner_id', me).eq('message_id', messageId));
}

/** What I saved, opened, newest save first. */
export async function listSaved(sb: UsClient, me: string, cipher: ChatCipher | null): Promise<Message[]> {
  const saved = unwrap(await sb.from('saved_messages').select('message_id, saved_at').eq('owner_id', me).order('saved_at', { ascending: false }).limit(200));
  const ids = (saved ?? []).map((r) => r.message_id);
  if (!ids.length) return [];
  const rows = unwrap(await sb.from('messages').select(SELECT).in('id', ids)) as Message[];
  const byId = new Map(openMessages(rows, cipher).map((m) => [m.id, m]));
  return ids.map((id) => byId.get(id)).filter((m): m is Message => !!m && !m.deleted_at);
}

// ------------------------------------------------- nickname and the theme ---

/** My private nickname for my partner, or null. */
export async function getNickname(sb: UsClient, me: string): Promise<string | null> {
  const { data: row, error } = await sb.from('chat_settings').select('partner_nickname').eq('owner_id', me).maybeSingle();
  if (error) throw error;
  return row?.partner_nickname ?? null;
}

export async function setNickname(sb: UsClient, me: string, nickname: string | null): Promise<void> {
  const name = nickname?.trim().slice(0, 40) || null;
  unwrap(await sb.from('chat_settings').upsert({ owner_id: me, partner_nickname: name, updated_at: new Date().toISOString() }));
}

export async function getChatTheme(sb: UsClient, coupleId: string): Promise<ChatTheme> {
  const { data: row, error } = await sb.from('chat_themes').select('theme').eq('couple_id', coupleId).maybeSingle();
  if (error) throw error;
  return isChatTheme(row?.theme) ? row.theme : 'paper';
}

export async function setChatTheme(sb: UsClient, ids: { coupleId: string; me: string }, theme: ChatTheme): Promise<void> {
  unwrap(await sb.from('chat_themes').upsert({ couple_id: ids.coupleId, theme, updated_by: ids.me, updated_at: new Date().toISOString() }));
}
