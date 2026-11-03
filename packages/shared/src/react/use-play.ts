import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { answerQuiz, listQuizzes, QUIZ_TOPIC, quizState, startQuiz } from '../api/quizzes';
import type { QuizRound } from '../database.types';
import { cardAt, type CardTable, type DeckId } from '../games/cards';
import type { QuizKind } from '../games/quiz';
import { useCouple } from './couple-provider';
import { useCoupleData } from './use-couple-data';

/** Our quiz rounds, newest first, with my picks and (once we've both answered) my partner's. */
export function useQuizzes(enabled = true) {
  const { sb, couple, me } = useCouple();
  const data = useCoupleData<QuizRound[]>(QUIZ_TOPIC, () => (enabled ? listQuizzes(sb) : Promise.resolve([])), [sb, enabled]);
  const rounds = useMemo(() => data.data ?? [], [data.data]);

  const start = useCallback(
    (kind: QuizKind, subject?: string | null) => data.mutate(() => startQuiz(sb, { coupleId: couple.id, me: me.id, kind, subject, history: rounds })),
    [data.mutate, sb, couple.id, me.id, rounds],
  );
  const answer = useCallback((roundId: string, picks: number[]) => data.mutate(() => answerQuiz(sb, roundId, picks)), [data.mutate, sb]);

  return {
    rounds,
    /** Rounds waiting for my answers. */
    toAnswer: rounds.filter((r) => quizState(r) === 'mine').length,
    loading: data.loading,
    error: data.error,
    reload: data.reload,
    start,
    answer,
  };
}

/**
 * Talk cards during a call: the same card on both screens. Whoever taps
 * "Next" deals for both; the shuffle travels as a seed.
 */
export function useCallCards() {
  const { channel, me } = useCouple();
  const [table, setTable] = useState<CardTable | null>(null);
  const current = useRef(table);
  current.current = table;

  useEffect(() => channel.cards.on((e) => e.from !== me.id && setTable(e.table)), [channel, me.id]);

  const put = useCallback(
    (next: CardTable | null) => {
      setTable(next);
      channel.sendCards(next);
    },
    [channel],
  );

  return {
    table,
    card: table ? cardAt(table) : null,
    open: useCallback((deck: DeckId) => put({ deck, seed: Math.floor(Math.random() * 2 ** 31), index: 0 }), [put]),
    next: useCallback(() => current.current && put({ ...current.current, index: current.current.index + 1 }), [put]),
    back: useCallback(() => current.current && current.current.index > 0 && put({ ...current.current, index: current.current.index - 1 }), [put]),
    close: useCallback(() => put(null), [put]),
  };
}
