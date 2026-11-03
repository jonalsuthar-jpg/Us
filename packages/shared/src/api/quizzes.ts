import type { QuizRound } from '../database.types';
import { pickQuestions, quizScore, type QuizKind } from '../games/quiz';
import type { UsClient } from '../supabase';
import { notifyPartner } from './push';

/** Broadcast on the couple channel whenever a quiz changes. */
export const QUIZ_TOPIC = 'quizzes';

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

export async function listQuizzes(sb: UsClient, limit = 40): Promise<QuizRound[]> {
  return unwrap(await sb.rpc('quiz_history', { p_limit: limit }));
}

/** A new round, with questions we haven't had lately. Know me: `subject` answers about themselves. */
export async function startQuiz(
  sb: UsClient,
  o: { coupleId: string; me: string; kind: QuizKind; subject?: string | null; history: Pick<QuizRound, 'kind' | 'questions'>[] },
): Promise<string> {
  const used = o.history.filter((r) => r.kind === o.kind).flatMap((r) => r.questions);
  const row = unwrap<{ id: string }>(
    await sb
      .from('quiz_rounds')
      .insert({ couple_id: o.coupleId, kind: o.kind, created_by: o.me, subject_id: o.kind === 'know_me' ? (o.subject ?? o.me) : null, questions: pickQuestions(o.kind, used) })
      .select('id')
      .single(),
  );
  return row.id;
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

export const roundScore = (r: Pick<QuizRound, 'my_answers' | 'partner_answers'>) => quizScore(r.my_answers, r.partner_answers);
