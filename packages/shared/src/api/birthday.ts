import type { Database } from '../database.types';
import type { UsClient } from '../supabase';
import { signedUrls } from './signed-urls';

/**
 * The birthday story (see 20261107000000_birthday.sql): written for one
 * birthday, now kept read-only and opened from its card in Memories.
 */
export const BIRTHDAY_BUCKET = 'birthday' as const;

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

/**
 * The story's pages in order. "Us, so far" is computed, the rest was written.
 * Cutting the cake on a call and signing the card were for the day itself.
 */
export type BirthdayStep = Exclude<BirthdaySection, 'moments' | 'cake' | 'card'> | 'us';
export const BIRTHDAY_STEPS: BirthdayStep[] = ['wish', 'song', 'notes', 'us', 'quiz', 'gift', 'ending'];

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

/** The story kept with this memory, if it has one (see 20261117000000_birthday_story.sql). */
export async function getBirthdayStory(sb: UsClient, memoryId: string): Promise<BirthdayRoom | null> {
  const { data, error } = await sb.from('birthday_rooms').select('*').eq('memory_id', memoryId).maybeSingle();
  if (error) throw error;
  return data ? toRoom(data) : null;
}

/** Which memories open a story: memory id → room id. */
export async function birthdayStoryMemories(sb: UsClient): Promise<Set<string>> {
  const { data, error } = await sb.from('birthday_rooms').select('memory_id').not('memory_id', 'is', null);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.memory_id as string));
}

export function birthdayUrls(sb: UsClient, paths: string[]): Promise<Record<string, string>> {
  return signedUrls(sb, BIRTHDAY_BUCKET, paths);
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
