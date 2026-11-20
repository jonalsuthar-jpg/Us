/**
 * Our House, live: where each of us is standing and what we're doing.
 *
 * Nothing here is saved. Small events on the couple channel, like drawing:
 *   - pose   where I am, which way I face, whether I'm walking. Sent about
 *            8 times a second while I move, once when I stop, and every few
 *            seconds while I stand still (that's also the heartbeat)
 *   - hello  I just came in: tell me where you are
 *   - bye    I left the house
 *   - emote  a wave or a heart, for a moment
 * A partner I haven't heard from in POSE_TTL_MS has left.
 */

export type Emote = 'wave' | 'heart';
export const EMOTES: Emote[] = ['wave', 'heart'];

export interface Pose {
  x: number;
  y: number;
  z: number;
  /** Heading in radians, 0 facing +z. */
  h: number;
  /** Walking (1) or standing (0). */
  m: 0 | 1;
}

export type HouseOp =
  | ({ op: 'pose' } & Pose)
  | { op: 'hello' }
  | { op: 'bye' }
  | { op: 'emote'; e: Emote };

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
  return { x: p.x!, y: p.y!, z: p.z!, h: p.h!, m: p.m ? 1 : 0 };
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
    const stopped = this.lastSent?.m === 1 && p.m === 0;
    if (stopped || (p.m === 1 && since >= POSE_EVERY_MS)) this.sendPose(p, false);
  }

  emote(e: Emote) {
    this.send({ op: 'emote', e });
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
    this.here.clear();
  }

  private sendPose(p: Pose, force: boolean) {
    const round = (n: number) => Math.round(n * 100) / 100;
    const out: Pose = { x: round(p.x), y: round(p.y), z: round(p.z), h: round(p.h), m: p.m };
    const same = this.lastSent && out.x === this.lastSent.x && out.y === this.lastSent.y && out.z === this.lastSent.z && out.h === this.lastSent.h && out.m === this.lastSent.m;
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
