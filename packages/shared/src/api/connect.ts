import type { DailyEntry } from '../database.types';
import type { UsClient } from '../supabase';
import { addDays, toDateKey } from './plan';
import { notifyPartner } from './push';

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

// --------------------------------------------------------- daily question ---

export const DAILY_ANSWER_MAX = 2000;

/**
 * Where today's question stands for me:
 *   ask      neither of us has answered
 *   nudge    my partner answered; mine unlocks theirs
 *   waiting  I answered; theirs (and the reveal) is still to come
 *   revealed we've both answered
 */
export type DailyState = 'ask' | 'nudge' | 'waiting' | 'revealed';

export function dailyState(e: Pick<DailyEntry, 'my_answer' | 'partner_answered'>): DailyState {
  if (e.my_answer !== null && e.partner_answered) return 'revealed';
  if (e.my_answer !== null) return 'waiting';
  return e.partner_answered ? 'nudge' : 'ask';
}

/** Days in a row, ending today or yesterday, on which we both answered. */
export function dailyStreak(entries: Pick<DailyEntry, 'for_date' | 'my_answer' | 'partner_answered'>[], now = new Date()): number {
  const both = new Set(entries.filter((e) => dailyState(e) === 'revealed').map((e) => e.for_date));
  let day = now;
  // Today not done yet doesn't break a streak that ran through yesterday.
  if (!both.has(toDateKey(day))) day = addDays(day, -1);
  let n = 0;
  while (both.has(toDateKey(day))) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export interface DailyData {
  today: DailyEntry;
  /** Earlier days where at least one of us answered, newest first. */
  past: DailyEntry[];
  streak: number;
}

/** Today's question (created on first ask) plus recent days. */
export async function getDaily(sb: UsClient, now = new Date()): Promise<DailyData> {
  const q = unwrap(await sb.rpc('todays_question', { p_date: toDateKey(now) }));
  const history = unwrap(await sb.rpc('daily_history', { p_limit: 60 }));
  const today = history.find((e) => e.question_id === q.id) ?? {
    question_id: q.id,
    prompt: q.prompt,
    for_date: q.for_date,
    my_answer: null,
    my_answered_at: null,
    partner_answered: false,
    partner_answer: null,
  };
  const past = history.filter((e) => e.question_id !== q.id && (e.my_answer !== null || e.partner_answered));
  return { today, past, streak: dailyStreak(history, now) };
}

/** Send my answer. It's sealed once sent. */
export async function answerDaily(sb: UsClient, row: { question_id: string; owner_id: string; answer: string }): Promise<void> {
  const answer = row.answer.trim().slice(0, DAILY_ANSWER_MAX);
  if (!answer) throw new Error('Write a few words first.');
  unwrap(await sb.from('daily_answers').insert({ ...row, answer }));
  void notifyPartner(sb, { category: 'daily_question', questionId: row.question_id });
}
