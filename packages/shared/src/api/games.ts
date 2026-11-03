import type { GameRow, Json, QuizRound } from '../database.types';
import { applyMove, initialState, type GameKind, type GameMove, type BoardState, type Players, type Seat } from '../games/rules';
import { pickQuestions, quizScore, type QuizKind } from '../games/quiz';
import type { UsClient } from '../supabase';
import { notifyPartner } from './push';

/** Broadcast on the couple channel whenever a game or quiz changes. */
export const GAMES_TOPIC = 'games';
export const QUIZ_TOPIC = 'quizzes';

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

export interface Game extends Omit<GameRow, 'state' | 'kind'> {
  kind: GameKind;
  state: BoardState;
}

export const asGame = (row: GameRow): Game => row as unknown as Game;

/** My seat in a game (0 moves first), or null if somehow I'm not in it. */
export function seatOf(game: Pick<Game, 'state'>, me: string): Seat | null {
  const i = (game.state as { players: Players }).players.indexOf(me);
  return i === 0 || i === 1 ? i : null;
}

/** Newest first. */
export async function listGames(sb: UsClient, coupleId: string, limit = 40): Promise<Game[]> {
  return unwrap(await sb.from('games').select('*').eq('couple_id', coupleId).order('updated_at', { ascending: false }).limit(limit)).map(asGame);
}

/** I move first. */
export async function startGame(sb: UsClient, o: { coupleId: string; me: string; partner: string; kind: GameKind }): Promise<Game> {
  const state = initialState(o.kind, [o.me, o.partner]);
  const row = unwrap<GameRow>(
    await sb
      .from('games')
      .insert({ couple_id: o.coupleId, kind: o.kind, created_by: o.me, state: state as unknown as Json, turn: o.me })
      .select('*')
      .single(),
  );
  return asGame(row);
}

/**
 * Play my move: the rules run here, the database checks it's my turn and the
 * board is current. Throws IllegalMove for a move the rules refuse.
 */
export async function playMove(sb: UsClient, game: Game, me: string, move: GameMove, opts: { notify?: boolean } = {}): Promise<Game> {
  const seat = seatOf(game, me);
  if (seat === null) throw new Error('not_in_game');
  const { state, outcome } = applyMove(game.kind, game.state, move, seat);
  const winner = outcome.status === 'won' ? (state as { players: Players }).players[outcome.winner!] : null;
  const row = asGame(
    unwrap(
      await sb.rpc('game_move', { p_id: game.id, p_version: game.version, p_state: state as unknown as Json, p_status: outcome.status, p_winner: winner }),
    ),
  );
  if (opts.notify !== false) void notifyPartner(sb, { category: 'game_turn', gameId: row.id });
  return row;
}

/** Give up (or "I'm stuck" in word chain): my partner wins. */
export async function resignGame(sb: UsClient, gameId: string): Promise<Game> {
  return asGame(unwrap(await sb.rpc('game_resign', { p_id: gameId })));
}

export interface GameScore {
  me: number;
  partner: number;
  draws: number;
}

/** Wins each, over finished games of one kind (or all). Word chain finished together counts as a draw. */
export function gameScore(games: Pick<Game, 'kind' | 'status' | 'winner'>[], me: string, kind?: GameKind): GameScore {
  const out = { me: 0, partner: 0, draws: 0 };
  for (const g of games) {
    if (kind && g.kind !== kind) continue;
    if (g.status === 'draw') out.draws++;
    else if (g.winner === me) out.me++;
    else if (g.winner) out.partner++;
  }
  return out;
}

// ---------------------------------------------------------------- quizzes ---

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
