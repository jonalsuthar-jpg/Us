import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toDateKey } from '../api/plan';
import { answerQuiz, listQuizzes, QUIZ_TOPIC, quizState } from '../api/quizzes';
import type { QuizRound } from '../database.types';
import { cardAt, type CardTable, type DeckId } from '../games/cards';
import type { QuizKind } from '../games/quiz';
import { useCouple } from './couple-provider';
import { useCoupleData } from './use-couple-data';

/**
 * Our quiz rounds, newest first, with my picks and (once we've both answered)
 * my partner's, and today's round of each game.
 */
export function useQuizzes(enabled = true) {
  const { sb } = useCouple();
  // Part of the cache key, so a new day loads (and makes) the new rounds.
  const day = toDateKey(new Date());
  const data = useCoupleData<QuizRound[]>(QUIZ_TOPIC, () => (enabled ? listQuizzes(sb) : Promise.resolve([])), [sb, enabled, day]);
  const rounds = useMemo(() => data.data ?? [], [data.data]);
  const today = useMemo(() => {
    const out: Partial<Record<QuizKind, QuizRound>> = {};
    for (const r of rounds) if (r.for_date === day && !out[r.kind]) out[r.kind] = r;
    return out;
  }, [rounds, day]);

  const answer = useCallback((roundId: string, picks: number[]) => data.mutate(() => answerQuiz(sb, roundId, picks)), [data.mutate, sb]);

  return {
    rounds,
    today,
    /** Today's rounds waiting for my answers. */
    toAnswer: Object.values(today).filter((r) => quizState(r) === 'mine').length,
    loading: data.loading,
    error: data.error,
    reload: data.reload,
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
