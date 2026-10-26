/**
 * A live Draw & Guess game between our two devices. Holds the game, runs the
 * clock for my rounds (I'm the authority while I draw), and turns taps into
 * game messages. Lives beside the draw hub, so the game keeps going if one of
 * us flips to another screen for a moment.
 */
import { finishDrawGame, ourWordTexts, startDrawGame } from '../api/draw';
import type { UsClient } from '../supabase';
import {
  bestRound,
  checkSecret,
  CHOOSE_MS,
  drawerOf,
  gameReducer,
  guesserOf,
  hintOrder,
  HINT_EVERY_MS,
  pointsFor,
  REVEAL_MS,
  ROUNDS,
  secretFor,
  TURN_MS,
  type GameMsg,
  type GameState,
} from './guess';
import type { DrawHub } from './session';
import { ourWords, pickChoices, type PackId, type Word } from './words';

export const GAME_CHANNEL = 'game';
export const roundCanvas = (gameId: string, round: number) => `game:${gameId}:${round}`;

type Envelope = { m: GameMsg; sent: number };

/** Shift a partner's clock times onto mine (their "sent" vs my "now"). */
function shift(m: GameMsg, delta: number): GameMsg {
  if (m.k === 'choosing') return { ...m, until: m.until + delta };
  if (m.k === 'round') return { ...m, at: m.at + delta, until: m.until + delta };
  if (m.k === 'reveal' || m.k === 'guess') return { ...m, at: m.at + delta };
  if (m.k === 'invite') return { ...m, at: m.at + delta };
  return m;
}

export class GameStore {
  state: GameState | null = null;
  private listeners = new Set<() => void>();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private ours: Word[] = [];
  private finished = new Set<string>();
  error: string | null = null;

  constructor(
    private readonly hub: DrawHub,
    private readonly sb: UsClient,
    private readonly coupleId: string,
    readonly me: string,
    readonly partner: string,
    private readonly now: () => number = Date.now,
  ) {
    hub.onGame(({ g, sid }) => {
      if (sid !== GAME_CHANNEL) return;
      const env = g as Envelope;
      if (!env || !env.m || typeof env.m.k !== 'string') return;
      this.apply(shift(env.m, this.now() - (env.sent || this.now())), false);
    });
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of [...this.listeners]) fn();
  }

  private send(m: GameMsg) {
    this.hub.sendGame(GAME_CHANNEL, { m, sent: this.now() } satisfies Envelope);
  }

  /** Apply a message; mine also go out. Then do whatever my role needs next. */
  private apply(m: GameMsg | { k: 'choices'; choices: Word[] } | { k: 'picked'; word: Word }, mine: boolean) {
    const before = this.state;
    this.state = gameReducer(this.state, m);
    if (mine && m.k !== 'choices' && m.k !== 'picked') this.send(m);
    if (this.state !== before) {
      this.react(before);
      this.emit();
    }
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private at(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, Math.max(0, ms - this.now())));
  }

  /** What my device does when the game moves on. */
  private react(before: GameState | null) {
    const s = this.state;
    if (!s) return;
    const phaseChanged = !before || before.phase !== s.phase || before.round !== s.round;
    if (!phaseChanged && !(s.phase === 'invited' && before?.joined.length !== s.joined.length)) return;
    this.clearTimers();

    // Both in: the starter's device opens round one.
    if (s.phase === 'invited' && s.joined.length >= 2 && s.players[0] === this.me) {
      this.apply({ k: 'choosing', id: s.id, round: 0, drawer: s.players[0], until: this.now() + CHOOSE_MS }, true);
      return;
    }

    if (s.phase === 'choosing' && s.drawer === this.me) {
      const used = s.results.map((r) => r.word);
      const choices = pickChoices(s.packs, this.ours, used);
      this.apply({ k: 'choices', choices }, false);
      // Picks one for me when time's up.
      this.at(s.until, () => {
        const cur = this.state;
        if (cur?.phase === 'choosing' && cur.round === s.round && !cur.word && choices[0]) this.pick(choices[0]);
      });
      return;
    }

    if (s.phase === 'drawing' && s.drawer === this.me && s.word) {
      const chars = [...s.word.trim()];
      const order = hintOrder(s.word, s.round * 31 + s.word.length);
      order.forEach((i, n) => {
        this.at(s.startedAt + HINT_EVERY_MS * (n + 1), () => {
          if (this.state?.phase === 'drawing' && this.state.round === s.round) {
            this.apply({ k: 'hint', id: s.id, round: s.round, i, ch: chars[i]! }, true);
          }
        });
      });
      this.at(s.until, () => this.reveal(false));
      return;
    }

    if (s.phase === 'reveal') {
      const next = s.round + 1;
      if (next >= s.rounds) {
        // The last drawer's device closes the game and records it.
        if (s.drawer === this.me) this.at(s.until, () => this.finish());
        return;
      }
      if (drawerOf(s.players, next) === this.me) {
        this.at(s.until, () => {
          if (this.state?.phase === 'reveal' && this.state.round === s.round) {
            this.apply({ k: 'choosing', id: s.id, round: next, drawer: this.me, until: this.now() + CHOOSE_MS }, true);
          }
        });
      }
    }
  }

  // ---------------------------------------------------------- actions ---

  /** Ask my partner to play. */
  async invite(packs: PackId[], rounds = ROUNDS) {
    this.error = null;
    this.clearTimers();
    try {
      this.ours = packs.includes('ours') ? ourWords(await ourWordTexts(this.sb, this.coupleId)) : [];
      const row = await startDrawGame(this.sb, { coupleId: this.coupleId, me: this.me, mode: 'live', packs, rounds });
      this.state = null;
      this.apply({ k: 'invite', id: row.id, players: [this.me, this.partner], packs, rounds, at: this.now() }, true);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Couldn’t start a game';
      this.emit();
    }
  }

  /** Say the invite again (my partner opened the game screen after I sent it). */
  resendInvite() {
    const s = this.state;
    if (s?.phase === 'invited' && s.players[0] === this.me) {
      this.send({ k: 'invite', id: s.id, players: s.players, packs: s.packs, rounds: s.rounds, at: s.startedAt });
    }
  }

  async join() {
    const s = this.state;
    if (!s || s.phase !== 'invited' || s.joined.includes(this.me)) return;
    if (s.packs.includes('ours')) this.ours = ourWords(await ourWordTexts(this.sb, this.coupleId).catch(() => []));
    this.apply({ k: 'join', id: s.id, by: this.me }, true);
  }

  pick(word: Word) {
    const s = this.state;
    if (!s || s.phase !== 'choosing' || s.drawer !== this.me) return;
    this.apply({ k: 'picked', word }, false);
    const at = this.now();
    this.apply(
      {
        k: 'round',
        id: s.id,
        round: s.round,
        drawer: this.me,
        secret: secretFor(word.text, `${s.id}:${s.round}`),
        level: word.level,
        pack: word.pack,
        at,
        until: at + TURN_MS,
      },
      true,
    );
  }

  /** My guess. Checked here against the hashes; my partner's device scores it. */
  guess(text: string): 'right' | 'close' | 'wrong' | null {
    const s = this.state;
    const t = text.trim();
    if (!s || s.phase !== 'drawing' || !s.secret || guesserOf(s) !== this.me || !t) return null;
    const result = checkSecret(t, s.secret, `${s.id}:${s.round}`);
    this.apply({ k: 'guess', id: s.id, round: s.round, by: this.me, text: t.slice(0, 40), result, at: this.now() }, true);
    return result;
  }

  private reveal(solved: boolean, at = this.now()) {
    const s = this.state;
    if (!s || s.phase !== 'drawing' || s.drawer !== this.me || !s.word) return;
    const ms = Math.max(0, at - s.startedAt);
    const points = solved ? pointsFor(ms, s.level ?? 'easy') : 0;
    this.apply({ k: 'reveal', id: s.id, round: s.round, word: s.word, solved, ms: solved ? ms : TURN_MS, points, at: this.now() }, true);
  }

  /** The drawer's device hears a right answer and closes the round. */
  private watchForAnswer = () => {
    const s = this.state;
    if (!s || s.phase !== 'drawing' || s.drawer !== this.me) return;
    const right = s.guesses.find((g) => g.result === 'right');
    if (right) this.reveal(true, right.at);
  };

  private async finish() {
    const s = this.state;
    if (!s || s.phase !== 'reveal' || this.finished.has(s.id)) return;
    this.finished.add(s.id);
    this.apply({ k: 'done', id: s.id, score: s.score }, true);
    const best = bestRound(s.results);
    await finishDrawGame(this.sb, s.id, {
      played: s.results.length,
      score: s.score,
      solved: s.results.filter((r) => r.solved).length,
      bestWord: best?.word ?? null,
      bestMs: best?.ms ?? null,
    }).catch(() => {});
  }

  leave() {
    const s = this.state;
    this.clearTimers();
    if (s && s.phase !== 'done' && s.phase !== 'left') this.apply({ k: 'leave', id: s.id, by: this.me }, true);
    this.state = null;
    this.emit();
  }

  /** Called after every state change by the hook (cheap). */
  tick() {
    this.watchForAnswer();
  }
}

const stores = new WeakMap<DrawHub, GameStore>();

export function gameStoreFor(hub: DrawHub, make: () => GameStore): GameStore {
  let s = stores.get(hub);
  if (!s) {
    s = make();
    stores.set(hub, s);
    s.subscribe(() => s!.tick());
  }
  return s;
}
