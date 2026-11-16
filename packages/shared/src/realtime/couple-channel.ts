import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Call, MessageRow } from '../database.types';
import type { UsClient } from '../supabase';
import type { DrawEvent } from '../draw/session';
import type { CardEvent } from '../games/cards';
import type { SignalEvent } from '../webrtc/signals';

type Listener<T> = (value: T) => void;

class Emitter<T> {
  private listeners = new Set<Listener<T>>();
  on(fn: Listener<T>) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  emit(value: T) {
    for (const fn of [...this.listeners]) fn(value);
  }
}

export type ChannelStatus = 'connecting' | 'live' | 'offline';

export interface JoinOptions {
  /** Show me online to my partner (default true). */
  presence?: boolean;
  /** Messages and calls from Postgres Changes (default true). */
  db?: boolean;
}

/** How long the app sits in the background before the link sleeps (see sleepInBackground). */
const SLEEP_AFTER_MS = 30_000;

/**
 * Joins and leaves one after another, app-wide. Supabase hands back a
 * channel that is still leaving if the same topic is joined again too soon
 * (the app reopened, a parked call), so each waits for the last.
 */
let queue: Promise<unknown> = Promise.resolve();
function inTurn<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

export interface TypingEvent {
  from: string;
  typing: boolean;
}

/** Every signal on the wire carries its sender so other devices of the same person can ignore or react. */
export type SignalEnvelope = SignalEvent & { from: string };

export type RowChange<T> = { type: 'INSERT' | 'UPDATE' | 'DELETE'; row: T };

/** "Something in this area changed — refetch." Sent after shared-data writes. */
export interface ChangedEvent {
  from: string;
  topic: string;
}

/**
 * The couple's realtime link. Two Supabase channels:
 *
 *  - `couple:<id>` (private broadcast + presence) — typing, online presence,
 *    WebRTC signaling and "changed" pings for the Plan/Memory data.
 *    Ephemeral; nothing touches the database. Access is restricted to the
 *    two members by Realtime Authorization policies.
 *  - `db:<id>` (Postgres Changes) — message inserts / receipt updates, call
 *    status changes, filtered server-side by RLS.
 */
export class CoupleChannel {
  readonly messages = new Emitter<RowChange<MessageRow>>();
  readonly calls = new Emitter<RowChange<Call>>();
  readonly typing = new Emitter<TypingEvent>();
  readonly signals = new Emitter<SignalEnvelope>();
  readonly presence = new Emitter<Set<string>>();
  readonly status = new Emitter<ChannelStatus>();
  readonly changes = new Emitter<ChangedEvent>();
  /** Draw together: strokes, cursors and Draw & Guess moves (see draw/session.ts). */
  readonly draw = new Emitter<DrawEvent>();
  /** Talk cards on a call: which card is up (see games/cards.ts). */
  readonly cards = new Emitter<CardEvent>();

  private live?: RealtimeChannel;
  private db?: RealtimeChannel;
  private online = new Set<string>();
  private _status: ChannelStatus = 'connecting';
  private joined: JoinOptions | null = null;
  private holds = 0;
  private sleepy = false;
  private background = false;
  private sleeping = false;
  private sleepTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly sb: UsClient,
    readonly coupleId: string,
    readonly userId: string,
    readonly platform: string,
  ) {}

  get currentStatus() {
    return this._status;
  }

  get onlineUsers(): ReadonlySet<string> {
    return this.online;
  }

  join(opts: JoinOptions = {}) {
    this.joined = opts;
    return inTurn(() => this.open(opts));
  }

  leave() {
    this.joined = null;
    clearTimeout(this.sleepTimer);
    this.sleepTimer = undefined;
    this.sleeping = false;
    return inTurn(() => this.close());
  }

  /**
   * Phones only: sleep the link once the app has been in the background a
   * while, so it holds no socket or presence there (calls still ring by
   * push), and wake it when the app is back. Not for the web, where a
   * hidden tab must still ring.
   */
  sleepInBackground() {
    this.sleepy = true;
  }

  /** The app came to the front (true) or went to the back (false). */
  setForeground(active: boolean) {
    this.background = !active;
    if (active) {
      clearTimeout(this.sleepTimer);
      this.sleepTimer = undefined;
      this.wake();
    } else {
      this.maybeSleep();
    }
  }

  /** Keep the link awake (say, a call is on) until the returned release is called. */
  hold(): () => void {
    this.holds++;
    this.wake();
    let held = true;
    return () => {
      if (!held) return;
      held = false;
      this.holds--;
      this.maybeSleep();
    };
  }

  private maybeSleep() {
    if (!this.sleepy || !this.background || this.holds > 0 || this.sleeping || this.sleepTimer || !this.joined) return;
    this.sleepTimer = setTimeout(() => {
      this.sleepTimer = undefined;
      if (!this.background || this.holds > 0 || !this.joined) return;
      this.sleeping = true;
      void inTurn(() => this.close());
    }, SLEEP_AFTER_MS);
  }

  private wake() {
    if (!this.sleeping || !this.joined) return;
    this.sleeping = false;
    const opts = this.joined;
    void inTurn(() => this.open(opts));
  }

  private async open({ presence = true, db = true }: JoinOptions) {
    // Private channels authorise with the user's JWT.
    await this.sb.realtime.setAuth();

    this.live = this.sb
      .channel(`couple:${this.coupleId}`, {
        config: { private: true, broadcast: { self: false, ack: false }, ...(presence ? { presence: { key: this.userId } } : {}) },
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => this.typing.emit(payload as TypingEvent))
      .on('broadcast', { event: 'signal' }, ({ payload }) => this.signals.emit(payload as SignalEnvelope))
      .on('broadcast', { event: 'changed' }, ({ payload }) => this.changes.emit(payload as ChangedEvent))
      .on('broadcast', { event: 'draw' }, ({ payload }) => this.draw.emit(payload as DrawEvent))
      .on('broadcast', { event: 'cards' }, ({ payload }) => this.cards.emit(payload as CardEvent))
      .on('presence', { event: 'sync' }, () => {
        const state = this.live?.presenceState() ?? {};
        this.online = new Set(Object.keys(state));
        this.presence.emit(this.online);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          if (presence) await this.live?.track({ platform: this.platform, at: new Date().toISOString() });
          this.setStatus('live');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.setStatus('offline');
        }
      });

    if (!db) return;
    const filter = `couple_id=eq.${this.coupleId}`;
    this.db = this.sb
      .channel(`db:${this.coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter }, (p) =>
        this.messages.emit({ type: p.eventType, row: (p.eventType === 'DELETE' ? p.old : p.new) as MessageRow }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter }, (p) =>
        this.calls.emit({ type: p.eventType, row: (p.eventType === 'DELETE' ? p.old : p.new) as Call }),
      )
      .subscribe((status, err) => {
        // Supabase rejoins on its own; this is only so a failure isn't silent.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') console.warn('[us] database changes', status, err);
      });
  }

  private async close() {
    const channels = [this.live, this.db].filter(Boolean) as RealtimeChannel[];
    this.live = this.db = undefined;
    await Promise.all(channels.map((c) => this.sb.removeChannel(c)));
    this.setStatus('offline');
  }

  sendTyping(typing: boolean) {
    void this.live?.send({ type: 'broadcast', event: 'typing', payload: { from: this.userId, typing } });
  }

  /** Tell my partner's open clients that `topic` changed. Carries no data. */
  sendChanged(topic: string) {
    void this.live?.send({ type: 'broadcast', event: 'changed', payload: { from: this.userId, topic } });
  }

  /** A drawing event for my partner's open canvas. Best effort, like typing. */
  sendDraw(event: DrawEvent) {
    void this.live?.send({ type: 'broadcast', event: 'draw', payload: event });
  }

  /** Show a talk card (or put them away) on my partner's call screen too. */
  sendCards(table: CardEvent['table']) {
    void this.live?.send({ type: 'broadcast', event: 'cards', payload: { from: this.userId, table } satisfies CardEvent });
  }

  async sendSignal(event: SignalEvent) {
    if (!this.live) throw new Error('Realtime channel not joined');
    const payload: SignalEnvelope = { ...event, from: this.userId };
    const res = await this.live.send({ type: 'broadcast', event: 'signal', payload });
    if (res !== 'ok') console.warn('[us] signal not acknowledged', event.type, res);
  }

  private setStatus(s: ChannelStatus) {
    if (s === this._status) return;
    this._status = s;
    this.status.emit(s);
  }
}
