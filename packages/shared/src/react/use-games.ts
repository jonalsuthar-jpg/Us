import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  answerQuiz,
  GAMES_TOPIC,
  gameScore,
  listGames,
  listQuizzes,
  playMove,
  QUIZ_TOPIC,
  quizState,
  resignGame,
  startGame,
  startQuiz,
  type Game,
} from '../api/games';
import { notifyPartner } from '../api/push';
import type { QuizRound } from '../database.types';
import { cardAt, type CardTable, type DeckId } from '../games/cards';
import type { QuizKind } from '../games/quiz';
import type { GameKind, GameMove } from '../games/rules';
import { useCouple } from './couple-provider';
import { useCoupleData } from './use-couple-data';

/**
 * Our games, newest first, kept fresh live: every move pings my partner's
 * open apps, and a push goes when they're away.
 */
export function useGames(enabled = true) {
  const { sb, couple, me, partner, partnerOnline } = useCouple();
  const data = useCoupleData<Game[]>(GAMES_TOPIC, () => (enabled ? listGames(sb, couple.id) : Promise.resolve([])), [sb, couple.id, enabled]);
  const games = useMemo(() => data.data ?? [], [data.data]);
  const online = useRef(partnerOnline);
  online.current = partnerOnline;

  const start = useCallback(
    (kind: GameKind) => data.mutate(() => startGame(sb, { coupleId: couple.id, me: me.id, partner: partner.id, kind })),
    [data.mutate, sb, couple.id, me.id, partner.id],
  );
  const move = useCallback(
    // When my partner has Us open, the live ping is enough; otherwise a push tells them it's their go.
    (game: Game, m: GameMove) => data.mutate(() => playMove(sb, game, me.id, m, { notify: !online.current })),
    [data.mutate, sb, me.id],
  );
  const resign = useCallback(
    (gameId: string) =>
      data.mutate(async () => {
        const g = await resignGame(sb, gameId);
        if (!online.current) void notifyPartner(sb, { category: 'game_turn', gameId });
        return g;
      }),
    [data.mutate, sb],
  );

  const active = useMemo(() => games.filter((g) => g.status === 'active'), [games]);
  return {
    games,
    active,
    myTurn: active.filter((g) => g.turn === me.id).length,
    score: useMemo(() => gameScore(games, me.id), [games, me.id]),
    loading: data.loading,
    error: data.error,
    reload: data.reload,
    start,
    move,
    resign,
  };
}

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
