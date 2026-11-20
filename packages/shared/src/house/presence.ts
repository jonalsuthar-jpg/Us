/**
 * Our House, live: where each of us is standing and what we're doing.
 *
 * Nothing here is saved. Small events on the couple channel, like drawing:
 *   - pose   where I am, which way I face, whether I'm walking. Sent about
 *            8 times a second while I move, once when I stop, and every few
 *            seconds while I stand still (that's also the heartbeat)
 *   - hello  I just came in: tell me where you are
 *   - bye    I left the house
 *   - emote  a wave, a heart or a dance, for a moment
 *   - item   I changed something in the house (see store.ts); the same
 *            change is saved, this just shows it at once
 * A partner I haven't heard from in POSE_TTL_MS has left.
 *
 * A pose also says what I'm doing (sitting on the sofa, cooking, hugging)
 * and what I'm carrying. Two of us grabbing the same mug: whoever picked it
 * up first keeps it (earlier hs, then the lower id), and the other lets go.
 */

export type Emote = 'wave' | 'heart' | 'dance';

/** Things two of us do together, after one asks and the other says yes. */
export type Together = 'kiss' | 'hands' | 'slow';
export const TOGETHER: Together[] = ['kiss', 'hands', 'slow'];
export const TOGETHER_LABEL: Record<Together, string> = { kiss: 'Kiss', hands: 'Hold hands', slow: 'Slow dance' };
export const EMOTES: Emote[] = ['wave', 'heart', 'dance'];

export interface Pose {
  x: number;
  y: number;
  z: number;
  /** Heading in radians, 0 facing +z. */
  h: number;
  /** Walking (1) or standing (0). */
  m: 0 | 1;
  /** How fast, m/s, while moving: walk, jog or run. */
  s?: number;
  /** What I'm doing: sit:<item>:<seat>, lie:<item>:<seat>, cook, water, hug, swim. */
  a?: string;
  /** What I'm carrying, and since when (ms). */
  hk?: string;
  hs?: number;
}

export interface ItemOp {
  op: 'item';
  k: string;
  /** The new state, or null when it was taken away. */
  s: Record<string, unknown> | null;
  /** The version it will have once saved. */
  v: number;
}

export type HouseOp =
  | ({ op: 'pose' } & Pose)
  | { op: 'hello' }
  | { op: 'bye' }
  | { op: 'emote'; e: Emote }
  | { op: 'invite'; kind: Together }
  | { op: 'answer'; kind: Together; yes: boolean }
  | ItemOp;

export type HouseEvent = HouseOp & { from: string };

export const POSE_EVERY_MS = 125;
export const IDLE_POSE_EVERY_MS = 4_000;
export const POSE_TTL_MS = 12_000;

export interface HouseTransport {
  send(e: HouseEvent): void;
  on(fn: (e: HouseEvent) => void): () => void;
}

const finite = (...v: unknown[]) => v.every((n) => typeof n === 'number' && Number.isFinite(n));

/** A pose from the wire, or null when it isn't one. Positions stay near the house. */
export function readPose(e: unknown): Pose | null {
  const p = e as Partial<Pose> | null;
  if (!p || !finite(p.x, p.y, p.z, p.h)) return null;
  if (Math.abs(p.x!) > 40 || Math.abs(p.z!) > 40 || p.y! < -5 || p.y! > 12) return null;
  const out: Pose = { x: p.x!, y: p.y!, z: p.z!, h: p.h!, m: p.m ? 1 : 0 };
  if (typeof p.a === 'string' && ACT.test(p.a)) out.a = p.a;
  if (typeof p.s === 'number' && Number.isFinite(p.s) && p.s >= 0 && p.s <= 10) out.s = p.s;
  if (typeof p.hk === 'string' && KEY.test(p.hk) && finite(p.hs)) {
    out.hk = p.hk;
    out.hs = p.hs;
  }
  return out;
}

const ACT = /^[a-z0-9:_-]{1,48}$/;
export const KEY = /^[a-z0-9:_-]{1,64}$/;

/** An item change from the wire, or null when it isn't one. */
export function readItemOp(e: unknown): ItemOp | null {
  const o = e as Partial<ItemOp> | null;
  if (!o || typeof o.k !== 'string' || !KEY.test(o.k) || !Number.isInteger(o.v) || o.v! < 0) return null;
  if (o.s !== null && (typeof o.s !== 'object' || Array.isArray(o.s) || JSON.stringify(o.s).length > 2048)) return null;
  return { op: 'item', k: o.k, s: o.s ?? null, v: o.v! };
}

/** Whether my hold on a thing loses to my partner's: they picked it up first. */
export function holdLoses(mine: { since: number; me: string }, theirs: { since: number; them: string }): boolean {
  return theirs.since < mine.since || (theirs.since === mine.since && theirs.them < mine.me);
}

type Listener<T> = (value: T) => void;

/**
 * My side of the house while it's open: sends my pose at a steady pace and
 * keeps my partner's latest one. The scene reads partner() every frame, so
 * nothing here re-renders React.
 */
export class HousePresence {
  private latest: Pose | null = null;
  private heardAt = 0;
  private sentAt = 0;
  private lastSent: Pose | null = null;
  private emotes = new Set<Listener<Emote>>();
  private items = new Set<Listener<ItemOp>>();
  private invites = new Set<Listener<{ kind: Together; answer?: boolean }>>();
  private here = new Set<Listener<boolean>>();
  private wasHere = false;
  private off: () => void;
  private timer: ReturnType<typeof setInterval>;
  private mine: Pose | null = null;

  constructor(
    readonly me: string,
    private readonly transport: HouseTransport,
    private readonly now: () => number = Date.now,
  ) {
    this.off = transport.on((e) => this.receive(e));
    this.send({ op: 'hello' });
    // Heartbeat while standing still, and noticing when my partner left.
    this.timer = setInterval(() => {
      if (this.mine && this.now() - this.sentAt >= IDLE_POSE_EVERY_MS) this.sendPose(this.mine, true);
      this.noteHere();
    }, 1_000);
  }

  /** Where my partner is, or null when they aren't in the house. */
  partner(): Pose | null {
    return this.partnerHere() ? this.latest : null;
  }

  partnerHere(): boolean {
    return !!this.latest && this.now() - this.heardAt < POSE_TTL_MS;
  }

  /** Call every frame with where I am; sends only as often as it needs to. */
  update(p: Pose) {
    this.mine = p;
    const since = this.now() - this.sentAt;
    const l = this.lastSent;
    // Stopping, starting to sit or picking something up goes out at once.
    const changed = !!l && (l.m !== p.m || l.a !== p.a || l.hk !== p.hk);
    if (changed || (p.m === 1 && since >= POSE_EVERY_MS)) this.sendPose(p, false);
  }

  emote(e: Emote) {
    this.send({ op: 'emote', e });
  }

  /** Send a change to a thing in the house (the store calls this). */
  sendItem(op: Omit<ItemOp, 'op'>) {
    this.send({ op: 'item', ...op });
  }

  onItem(fn: Listener<ItemOp>) {
    this.items.add(fn);
    return () => void this.items.delete(fn);
  }

  /** Ask my partner to do something together. */
  invite(kind: Together) {
    this.send({ op: 'invite', kind });
  }

  answer(kind: Together, yes: boolean) {
    this.send({ op: 'answer', kind, yes });
  }

  /** An invitation from my partner (answer undefined), or their answer to mine. */
  onInvite(fn: Listener<{ kind: Together; answer?: boolean }>) {
    this.invites.add(fn);
    return () => void this.invites.delete(fn);
  }

  onEmote(fn: Listener<Emote>) {
    this.emotes.add(fn);
    return () => void this.emotes.delete(fn);
  }

  /** Fires when my partner comes in or leaves. */
  onPartnerHere(fn: Listener<boolean>) {
    this.here.add(fn);
    return () => void this.here.delete(fn);
  }

  dispose() {
    clearInterval(this.timer);
    this.send({ op: 'bye' });
    this.off();
    this.emotes.clear();
    this.items.clear();
    this.invites.clear();
    this.here.clear();
  }

  private sendPose(p: Pose, force: boolean) {
    const round = (n: number) => Math.round(n * 100) / 100;
    const out: Pose = { x: round(p.x), y: round(p.y), z: round(p.z), h: round(p.h), m: p.m };
    if (p.a) out.a = p.a;
    if (p.s !== undefined) out.s = p.s;
    if (p.hk) {
      out.hk = p.hk;
      out.hs = p.hs;
    }
    const l = this.lastSent;
    const same = l && out.x === l.x && out.y === l.y && out.z === l.z && out.h === l.h && out.m === l.m && out.a === l.a && out.hk === l.hk;
    if (same && !force) return;
    this.lastSent = out;
    this.sentAt = this.now();
    this.send({ op: 'pose', ...out });
  }

  private send(op: HouseOp) {
    this.transport.send({ ...op, from: this.me } as HouseEvent);
  }

  private receive(e: HouseEvent) {
    if (!e || e.from === this.me) return;
    switch (e.op) {
      case 'pose': {
        const p = readPose(e);
        if (!p) return;
        this.latest = p;
        this.heardAt = this.now();
        break;
      }
      case 'hello':
        if (this.mine) this.sendPose(this.mine, true);
        break;
      case 'bye':
        this.latest = null;
        break;
      case 'item': {
        const op = readItemOp(e);
        if (op) for (const fn of [...this.items]) fn(op);
        return;
      }
      case 'invite':
      case 'answer': {
        if (!TOGETHER.includes(e.kind)) return;
        const msg = e.op === 'answer' ? { kind: e.kind, answer: e.yes === true } : { kind: e.kind };
        for (const fn of [...this.invites]) fn(msg);
        return;
      }
      case 'emote':
        if (!EMOTES.includes(e.e)) return;
        // An emote also means they're here.
        if (this.latest) this.heardAt = this.now();
        for (const fn of [...this.emotes]) fn(e.e);
        break;
    }
    this.noteHere();
  }

  private noteHere() {
    const here = this.partnerHere();
    if (here === this.wasHere) return;
    this.wasHere = here;
    for (const fn of [...this.here]) fn(here);
  }
}
