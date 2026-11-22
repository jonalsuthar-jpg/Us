/**
 * Isle, kept in step between the two of us. A move shows at once on my
 * screen, goes to my partner straight away over the couple channel (just the
 * move: their phone plays it through the same rules and lands on the same
 * state), then the whole state saves. A save only lands if it's further on
 * than what's saved, so when we both moved from the same point one of us
 * gets 'stale': that phone loads what's saved, plays its own move again on
 * top (if it still can be made) and tells the other.
 *
 * The bots are played by one phone: mine when my partner isn't in the game,
 * otherwise whichever of us has the lower id. A bot's move is worked out
 * from the state alone and carries an id made from the move count, so if
 * both phones ever play it, it still only counts once.
 */
import { greedyMove } from './bots/greedy';
import { hardMove } from './bots/hard';
import { apply, newGame, waitingOn, type IsleAction, type IsleState, type Seat } from './rules';

export interface IsleGame {
  id: string;
  state: IsleState;
}

export interface IsleApi {
  /** The game being played, or the last one finished; null before the first. */
  load(): Promise<IsleGame | null>;
  /** Starts a game (setting aside any other) and gives its id. */
  start(state: IsleState): Promise<string>;
  /** Saves a state that's further on; rejects with StaleIsleError when it isn't. */
  save(id: string, state: IsleState): Promise<number>;
}

export class StaleIsleError extends Error {
  constructor() {
    super('stale');
  }
}

/** What goes between our phones on the couple channel. */
export type IsleWire =
  | { k: 'move'; from: string; game: string; mv: number; seat: number; a: IsleAction; id: string }
  | { k: 'state'; from: string; game: string; state: IsleState }
  | { k: 'new'; from: string; game: string; state: IsleState }
  | { k: 'want'; from: string; game: string; mv: number }
  | { k: 'hello' | 'here' | 'bye'; from: string };

export interface IsleLink {
  send(w: IsleWire): void;
  on(fn: (w: IsleWire) => void): () => void;
}

export interface IsleClock {
  now(): number;
  later(fn: () => void, ms: number): unknown;
  cancel(t: unknown): void;
}

const realClock: IsleClock = {
  now: () => Date.now(),
  later: (fn, ms) => setTimeout(fn, ms),
  cancel: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
};

/** How long a bot waits before moving, so we can follow what it does. */
export function botDelay(s: IsleState): number {
  // Answering a trade or giving back cards is quicker than playing a turn.
  const answer = s.phase === 'discard' || s.offer != null;
  return (answer ? 700 : 1000) + (s.mv % 5) * 150;
}

const SAVE_GAP_MS = 250;
const HEARTBEAT_MS = 15_000;
const GONE_AFTER_MS = 40_000;

export interface IsleSnapshot {
  loaded: boolean;
  game: IsleGame | null;
  /** My seat in the game, or -1. */
  seat: number;
  partnerHere: boolean;
  /** A bot is about to move (for a "thinking…" sign). */
  botThinking: number | null;
}

type Pending = { id: string; seat: number; a: IsleAction };

export class IsleStore {
  private game: IsleGame | null = null;
  private loaded = false;
  /** My moves (and bot moves I played) not yet seen in a save. */
  private pending: Pending[] = [];
  private saving = false;
  private lastSaveAt = 0;
  private saveTimer: unknown = null;
  private partnerSeenAt = 0;
  private partnerHere = false;
  private botTimer: unknown = null;
  private botFor = -1;
  private beat: unknown = null;
  private catchUp: unknown = null;
  private offLink: (() => void) | null = null;
  private listeners = new Set<() => void>();
  private snap: IsleSnapshot | null = null;
  private closed = false;

  constructor(
    private readonly api: IsleApi,
    private readonly link: IsleLink,
    readonly me: string,
    private readonly clock: IsleClock = realClock,
  ) {}

  /** The game screen opened: load, say hello, start listening. */
  open() {
    this.closed = false;
    this.offLink = this.link.on((w) => this.receive(w));
    this.link.send({ k: 'hello', from: this.me });
    const tick = () => {
      if (this.closed) return;
      this.link.send({ k: 'here', from: this.me });
      if (this.partnerHere && this.clock.now() - this.partnerSeenAt > GONE_AFTER_MS) this.setPartner(false);
      this.beat = this.clock.later(tick, HEARTBEAT_MS);
    };
    this.beat = this.clock.later(tick, HEARTBEAT_MS);
    return this.load();
  }

  close() {
    this.closed = true;
    this.link.send({ k: 'bye', from: this.me });
    this.offLink?.();
    this.offLink = null;
    for (const t of [this.beat, this.botTimer, this.saveTimer, this.catchUp]) if (t != null) this.clock.cancel(t);
    this.beat = this.botTimer = this.saveTimer = this.catchUp = null;
    this.botFor = -1;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  snapshot(): IsleSnapshot {
    if (!this.snap) {
      const seat = this.game ? this.game.state.players.findIndex((p) => p.id === this.me) : -1;
      this.snap = {
        loaded: this.loaded,
        game: this.game,
        seat,
        partnerHere: this.partnerHere,
        botThinking: this.botTimer != null ? this.botFor : null,
      };
    }
    return this.snap;
  }

  /** What's saved; my unsaved moves are played again on top of it. */
  async load() {
    const row = await this.api.load();
    this.loaded = true;
    if (!row) {
      if (!this.game) this.changed();
      return;
    }
    if (this.game?.id === row.id) this.rebase(row.state, true);
    else this.adopt(row);
  }

  /** A fresh game; whatever was being played is set aside. */
  async start(seats: Seat[], seed = Math.floor(Math.random() * 2 ** 31)) {
    const state = newGame(seats, seed);
    const id = await this.api.start(state);
    this.adopt({ id, state });
    this.link.send({ k: 'new', from: this.me, game: id, state });
  }

  /** Makes a move for my seat (or a bot's); null when done, otherwise why not. */
  move(seat: number, a: IsleAction, id = moveId()): string | null {
    const g = this.game;
    if (!g) return 'no game';
    const who = g.state.players[seat];
    if (!who) return 'not at the table';
    if (who.id !== this.me && !who.bot) return 'not your seat';
    const next = apply(g.state, seat, a, id);
    if (typeof next === 'string') return next;
    const mv = g.state.mv;
    this.game = { id: g.id, state: next };
    this.pending.push({ id, seat, a });
    this.link.send({ k: 'move', from: this.me, game: g.id, mv, seat, a, id });
    this.changed();
    this.queueSave();
    return null;
  }

  /** Something from my partner's phone. A bad message is dropped, never thrown at the channel. */
  receive(w: IsleWire) {
    try {
      this.take(w);
    } catch (e) {
      console.warn('[isle] message dropped', e);
    }
  }

  private take(w: IsleWire) {
    if (w.from === this.me || this.closed) return;
    this.partnerSeenAt = this.clock.now();
    switch (w.k) {
      case 'hello':
        this.link.send({ k: 'here', from: this.me });
        this.setPartner(true);
        return;
      case 'here':
        this.setPartner(true);
        return;
      case 'bye':
        this.setPartner(false);
        return;
    }
    this.setPartner(true);
    const g = this.game;
    switch (w.k) {
      case 'new':
        if (g?.id !== w.game) {
          this.adopt({ id: w.game, state: w.state });
          // If we both started one at once, the server knows which is being played.
          this.loadSoon();
        }
        return;
      case 'move': {
        if (!g || g.id !== w.game) return this.want();
        if (g.state.recent.includes(w.id)) return;
        if (w.mv > g.state.mv) return this.want();
        // Behind it: we both moved from the same point; the server sorts out whose counts.
        if (w.mv < g.state.mv) return;
        const next = apply(g.state, w.seat, w.a, w.id);
        if (typeof next === 'string') return this.want();
        this.game = { id: g.id, state: next };
        this.changed();
        return;
      }
      case 'state':
        if (g?.id === w.game && w.state.mv > g.state.mv) this.rebase(w.state, false);
        else if (!g || g.id !== w.game) void this.load().catch(() => {});
        return;
      case 'want':
        if (g?.id === w.game && g.state.mv > w.mv) {
          this.link.send({ k: 'state', from: this.me, game: g.id, state: g.state });
        }
        return;
    }
  }

  private want() {
    const g = this.game;
    if (g) this.link.send({ k: 'want', from: this.me, game: g.id, mv: g.state.mv });
    // And if nobody answers, what's saved.
    this.loadSoon();
  }

  private loadSoon() {
    if (this.catchUp != null) return;
    this.catchUp = this.clock.later(() => {
      this.catchUp = null;
      if (!this.closed) void this.load().catch(() => {});
    }, 1500);
  }

  private adopt(g: IsleGame) {
    this.game = g;
    this.pending = [];
    this.changed();
  }

  /**
   * Moves onto a state from the server or my partner, playing my unsaved
   * moves again on top. From the server (force) it's taken even when it's
   * no further on: that's what counts.
   */
  private rebase(base: IsleState, force: boolean) {
    const g = this.game;
    if (!g) return;
    if (!force && base.mv <= g.state.mv) return;
    let s = base;
    const kept: Pending[] = [];
    for (const p of this.pending) {
      if (s.recent.includes(p.id)) continue;
      const next = apply(s, p.seat, p.a, p.id);
      if (typeof next === 'string') continue;
      s = next;
      kept.push(p);
    }
    this.pending = kept;
    this.game = { id: g.id, state: s };
    if (kept.length) {
      this.link.send({ k: 'state', from: this.me, game: g.id, state: s });
      this.queueSave();
    }
    this.changed();
  }

  private queueSave() {
    if (this.saving || this.saveTimer != null || !this.pending.length || !this.game) return;
    const wait = Math.max(0, this.lastSaveAt + SAVE_GAP_MS - this.clock.now());
    this.saveTimer = this.clock.later(() => {
      this.saveTimer = null;
      void this.save();
    }, wait);
  }

  private async save() {
    const g = this.game;
    if (!g || !this.pending.length || this.saving) return;
    this.saving = true;
    this.lastSaveAt = this.clock.now();
    let retry = false;
    try {
      await this.api.save(g.id, g.state);
      this.pending = this.pending.filter((p) => !g.state.recent.includes(p.id));
    } catch (e) {
      if (e instanceof StaleIsleError) {
        await this.load().catch(() => {});
      } else {
        // Too fast, or the network: try again shortly.
        retry = true;
      }
    } finally {
      this.saving = false;
    }
    if (this.closed) return;
    if (retry) {
      this.lastSaveAt = this.clock.now() + 1000;
    }
    this.queueSave();
  }

  private setPartner(here: boolean) {
    if (here) this.partnerSeenAt = this.clock.now();
    if (this.partnerHere === here) return;
    this.partnerHere = here;
    this.changed();
  }

  /** Whether this phone plays the bots right now. */
  drivesBots(): boolean {
    const g = this.game;
    if (!g) return false;
    if (!this.partnerHere) return true;
    const partner = g.state.players.find((p) => !p.bot && p.id !== this.me);
    return !partner || this.me < partner.id;
  }

  /** A bot's turn to act and this phone plays them: move after a moment. */
  private botsNext() {
    const g = this.game;
    const s = g?.state;
    const seat = s && s.phase !== 'over' ? waitingOn(s).find((p) => s.players[p]!.bot) : undefined;
    if (seat == null || !this.drivesBots() || this.closed) {
      if (this.botTimer != null) {
        this.clock.cancel(this.botTimer);
        this.botTimer = null;
        this.botFor = -1;
      }
      return;
    }
    if (this.botTimer != null) return;
    const mv = s!.mv;
    this.botFor = seat;
    this.botTimer = this.clock.later(() => {
      this.botTimer = null;
      this.botFor = -1;
      const now = this.game?.state;
      // This runs from a timer: anything thrown here would close the app on a phone.
      try {
        if (now && now.mv === mv && this.drivesBots()) this.botMove(now, seat);
        else this.changed();
      } catch (e) {
        console.warn('[isle] bot move failed', e);
      }
    }, botDelay(s!));
  }

  private botMove(s: IsleState, seat: number) {
    const id = `bot:${s.mv}:${seat}`;
    let a: IsleAction;
    try {
      a = hardMove(s, seat);
    } catch (e) {
      console.warn('[isle] bot failed', e);
      a = greedyMove(s, seat);
    }
    if (this.move(seat, a, id) === null) return;
    // Never leave the table stuck on a bot.
    const fallback = greedyMove(s, seat);
    if (this.move(seat, fallback, id) === null) return;
    console.warn('[isle] bot has no move', s.phase);
    this.changed();
  }

  private changed() {
    this.botsNext();
    this.snap = null;
    for (const fn of [...this.listeners]) fn();
  }
}

function moveId(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}
