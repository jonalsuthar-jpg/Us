import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Call, MessageRow } from '../database.types';
import type { UsClient } from '../supabase';
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

export interface TypingEvent {
  from: string;
  typing: boolean;
}

/** Every signal on the wire carries its sender so other devices of the same person can ignore or react. */
export type SignalEnvelope = SignalEvent & { from: string };

export type RowChange<T> = { type: 'INSERT' | 'UPDATE' | 'DELETE'; row: T };

/**
 * The couple's realtime link. Two Supabase channels:
 *
 *  - `couple:<id>` (private broadcast + presence) — typing, online presence
 *    and WebRTC signaling. Ephemeral; nothing touches the database. Access is
 *    restricted to the two members by Realtime Authorization policies.
 *  - `db:<id>` (Postgres Changes) — message inserts / receipt updates and
 *    call status changes, filtered server-side by RLS.
 */
export class CoupleChannel {
  readonly messages = new Emitter<RowChange<MessageRow>>();
  readonly calls = new Emitter<RowChange<Call>>();
  readonly typing = new Emitter<TypingEvent>();
  readonly signals = new Emitter<SignalEnvelope>();
  readonly presence = new Emitter<Set<string>>();
  readonly status = new Emitter<ChannelStatus>();

  private live?: RealtimeChannel;
  private db?: RealtimeChannel;
  private online = new Set<string>();
  private _status: ChannelStatus = 'connecting';

  constructor(
    private readonly sb: UsClient,
    readonly coupleId: string,
    readonly userId: string,
    private readonly platform: string,
  ) {}

  get currentStatus() {
    return this._status;
  }

  get onlineUsers(): ReadonlySet<string> {
    return this.online;
  }

  async join() {
    // Private channels authorise with the user's JWT.
    await this.sb.realtime.setAuth();

    this.live = this.sb
      .channel(`couple:${this.coupleId}`, {
        config: { private: true, broadcast: { self: false, ack: false }, presence: { key: this.userId } },
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => this.typing.emit(payload as TypingEvent))
      .on('broadcast', { event: 'signal' }, ({ payload }) => this.signals.emit(payload as SignalEnvelope))
      .on('presence', { event: 'sync' }, () => {
        const state = this.live?.presenceState() ?? {};
        this.online = new Set(Object.keys(state));
        this.presence.emit(this.online);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.live?.track({ platform: this.platform, at: new Date().toISOString() });
          this.setStatus('live');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          this.setStatus('offline');
        }
      });

    const filter = `couple_id=eq.${this.coupleId}`;
    this.db = this.sb
      .channel(`db:${this.coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter }, (p) =>
        this.messages.emit({ type: p.eventType, row: (p.eventType === 'DELETE' ? p.old : p.new) as MessageRow }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter }, (p) =>
        this.calls.emit({ type: p.eventType, row: (p.eventType === 'DELETE' ? p.old : p.new) as Call }),
      )
      .subscribe();
  }

  async leave() {
    const channels = [this.live, this.db].filter(Boolean) as RealtimeChannel[];
    this.live = this.db = undefined;
    await Promise.all(channels.map((c) => this.sb.removeChannel(c)));
    this.setStatus('offline');
  }

  sendTyping(typing: boolean) {
    void this.live?.send({ type: 'broadcast', event: 'typing', payload: { from: this.userId, typing } });
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
