import type { QuizRound } from '../database.types';
import { quizScore } from '../games/quiz';
import type { UsClient } from '../supabase';
import { toDateKey } from './plan';
import { notifyPartner } from './push';

/** Broadcast on the couple channel whenever a quiz changes. */
export const QUIZ_TOPIC = 'quizzes';

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

/** Our rounds, newest first. Makes today's rounds first (one of each game), so they're always there. */
export async function listQuizzes(sb: UsClient, now = new Date(), limit = 40): Promise<QuizRound[]> {
  unwrap(await sb.rpc('todays_quizzes', { p_date: toDateKey(now) }));
  return unwrap(await sb.rpc('quiz_history', { p_limit: limit }));
}

/** My picks, sealed once sent. */
export async function answerQuiz(sb: UsClient, roundId: string, answers: number[]): Promise<void> {
  unwrap(await sb.from('quiz_answers').insert({ round_id: roundId, answers }));
  void notifyPartner(sb, { category: 'quiz_ready', roundId });
}

export type QuizState = 'mine' | 'waiting' | 'revealed';

/** Mine: I still have to answer. Waiting: I answered, my partner hasn't. */
export const quizState = (r: Pick<QuizRound, 'my_answers' | 'partner_answers'>): QuizState =>
  !r.my_answers ? 'mine' : r.partner_answers ? 'revealed' : 'waiting';

export const roundScore = (r: Pick<QuizRound, 'kind' | 'my_answers' | 'partner_answers'>) => quizScore(r.kind, r.my_answers, r.partner_answers);
