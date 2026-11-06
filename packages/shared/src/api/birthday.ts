import type { Database, Json } from '../database.types';
import type { UsClient } from '../supabase';
import { uuid } from '../uuid';
import { forgetSignedUrl, signedUrls } from './signed-urls';
import { removeFiles, uploadFile } from './media';

/**
 * A birthday room (see 20261107000000_birthday.sql): a story the maker writes
 * and the birthday person taps through, locked until midnight on the day.
 */
export const BIRTHDAY_BUCKET = 'birthday' as const;
export const BIRTHDAY_TOPIC = 'birthday';

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

export interface BirthdayMoment {
  text: string;
  /** yyyy-mm-dd */
  date: string | null;
  photo_path: string | null;
}

export interface BirthdayQuestion {
  q: string;
  a: string;
}

export interface BirthdayContent {
  /** Sections still showing placeholder text. */
  drafts: BirthdaySection[];
  wish: { line: string };
  song: { caption: string; audio_path: string | null; duration_ms?: number | null };
  notes: string[];
  moments: BirthdayMoment[];
  quiz: BirthdayQuestion[];
  gift: { title: string; body: string };
  cake: { line: string };
  card: { line: string };
  ending: { line: string };
}

export type BirthdaySection = 'wish' | 'song' | 'notes' | 'moments' | 'quiz' | 'gift' | 'cake' | 'card' | 'ending';

/** The story, in the order she taps through it. "Us, so far" is computed, the rest is written. */
export type BirthdayStep = Exclude<BirthdaySection, 'moments'> | 'us';
export const BIRTHDAY_STEPS: BirthdayStep[] = ['wish', 'song', 'notes', 'us', 'quiz', 'gift', 'cake', 'card', 'ending'];

export type BirthdayRow = Database['public']['Tables']['birthday_rooms']['Row'];
export interface BirthdayRoom extends Omit<BirthdayRow, 'content' | 'marks'> {
  content: BirthdayContent;
  marks: Record<string, boolean>;
}

const EMPTY: BirthdayContent = {
  drafts: [],
  wish: { line: 'Close your eyes, make a wish… now blow.' },
  song: { caption: '', audio_path: null },
  notes: [],
  moments: [],
  quiz: [],
  gift: { title: '', body: '' },
  cake: { line: '' },
  card: { line: '' },
  ending: { line: 'Happy birthday. I’m really glad I met you. 🙂' },
};

function toRoom(row: BirthdayRow): BirthdayRoom {
  const c = (row.content ?? {}) as Partial<BirthdayContent>;
  return {
    ...row,
    content: { ...EMPTY, ...c, drafts: Array.isArray(c.drafts) ? c.drafts : [] },
    marks: (row.marks ?? {}) as Record<string, boolean>,
  };
}

/** The room I can see right now: always mine to preview, hers only from midnight. */
export async function getBirthdayRoom(sb: UsClient): Promise<BirthdayRoom | null> {
  const { data, error } = await sb.from('birthday_rooms').select('*').order('created_at').limit(1).maybeSingle();
  if (error) throw error;
  return data ? toRoom(data) : null;
}

/** Before the day, the day itself (the festive Home), or after. */
export function birthdayPhase(room: Pick<BirthdayRoom, 'unlock_at' | 'ends_at'>, now = Date.now()): 'before' | 'day' | 'after' {
  if (now < Date.parse(room.unlock_at)) return 'before';
  return now < Date.parse(room.ends_at) ? 'day' : 'after';
}

/** The maker rewrites one section; it stops being a draft. */
export async function saveBirthdaySection<K extends BirthdaySection>(
  sb: UsClient,
  room: BirthdayRoom,
  section: K,
  value: BirthdayContent[K],
): Promise<BirthdayRoom> {
  const content: BirthdayContent = { ...room.content, [section]: value, drafts: room.content.drafts.filter((d) => d !== section) };
  const row = unwrap<BirthdayRow>(await sb.from('birthday_rooms').update({ content: content as unknown as Json }).eq('id', room.id).select('*').single());
  return toRoom(row);
}

const EXT: Record<string, string> = {
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

/** Upload to "<couple_id>/<room_id>/<uuid>.<ext>"; returns the path. Only the maker can. */
export async function uploadBirthdayFile(
  sb: UsClient,
  room: Pick<BirthdayRoom, 'id' | 'couple_id'>,
  body: Blob | ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const type = contentType.split(';')[0]!.trim().toLowerCase();
  const path = `${room.couple_id}/${room.id}/${uuid()}.${EXT[type] ?? 'bin'}`;
  await uploadFile(sb, BIRTHDAY_BUCKET, path, body, type);
  return path;
}

export async function removeBirthdayFile(sb: UsClient, path: string): Promise<void> {
  await removeFiles(sb, BIRTHDAY_BUCKET, [path]);
  forgetSignedUrl(BIRTHDAY_BUCKET, path);
}

export function birthdayUrls(sb: UsClient, paths: string[]): Promise<Record<string, string>> {
  return signedUrls(sb, BIRTHDAY_BUCKET, paths);
}

export async function openBirthday(sb: UsClient, id: string): Promise<BirthdayRoom> {
  return toRoom(unwrap(await sb.rpc('birthday_open', { p_id: id })));
}

export async function markBirthdayQuiz(sb: UsClient, id: string, index: number, right: boolean): Promise<BirthdayRoom> {
  return toRoom(unwrap(await sb.rpc('birthday_mark', { p_id: id, p_index: index, p_right: right })));
}

export async function keepBirthday(sb: UsClient, id: string): Promise<BirthdayRoom> {
  return toRoom(unwrap(await sb.rpc('birthday_keep', { p_id: id })));
}

export interface BirthdayTotals {
  messages: number;
  first_message_at: string | null;
  calls: number;
  call_seconds: number;
  paired_at: string;
}

export async function birthdayTotals(sb: UsClient): Promise<BirthdayTotals | null> {
  return unwrap(await sb.rpc('birthday_totals')) as unknown as BirthdayTotals | null;
}
