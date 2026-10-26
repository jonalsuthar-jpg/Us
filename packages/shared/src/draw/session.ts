/**
 * A live drawing session: what both of us see on one canvas.
 *
 * Every change travels as a small event on the couple channel. applyDraw() is
 * a pure reducer and is deterministic, so the same events in any order
 * between the two of us end in the same picture:
 *   - strokes sort by (n, by, id), where n is one more than any stroke seen
 *     when it started, so both sides stack them the same way
 *   - clear lists the strokes it removes, so a stroke my partner starts
 *     while I clear survives on both screens
 *   - removed ids are remembered, so a late message can't bring one back
 */
import { BOARD_H, BOARD_W, clampX, clampY, pressureWidth, shouldAdd, type DrawBackground, type DrawTool, type Stroke } from './strokes';

export type DrawOp =
  | { op: 'start'; s: Omit<Stroke, 'live' | 'd'> }
  | { op: 'pts'; id: string; p: number[]; ws?: number[] }
  | { op: 'end'; id: string; d: number }
  | { op: 'undo'; id: string }
  | { op: 'clear'; ids: string[] }
  | { op: 'bg'; bg: DrawBackground | null }
  /** Where my pen is; x < 0 when it's lifted off the board. */
  | { op: 'cur'; x: number; y: number }
  /** I just opened this canvas: send me what you have. */
  | { op: 'hello' }
  | { op: 'snap'; part: number; of: number; strokes: Stroke[]; gone: string[]; bg: DrawBackground | null }
  /** I have this canvas open (heartbeat), or just closed it. */
  | { op: 'here'; on: boolean }
  /** Draw & Guess game messages (see guess.ts). */
  | { op: 'game'; g: unknown };

/** On the wire: which canvas, and who sent it. */
export type DrawEvent = DrawOp & { sid: string; from: string };

export interface DrawState {
  strokes: Stroke[];
  /** Ids removed by undo or clear. */
  gone: Record<string, true>;
  bg: DrawBackground | null;
  /** Highest stroke number seen. */
  top: number;
}

export const emptyDraw = (): DrawState => ({ strokes: [], gone: {}, bg: null, top: 0 });

export function strokeOrder(a: Pick<Stroke, 'n' | 'by' | 'id'>, b: Pick<Stroke, 'n' | 'by' | 'id'>): number {
  return a.n - b.n || (a.by < b.by ? -1 : a.by > b.by ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function insert(strokes: Stroke[], s: Stroke): Stroke[] {
  let i = strokes.length;
  while (i > 0 && strokeOrder(strokes[i - 1]!, s) > 0) i--;
  return [...strokes.slice(0, i), s, ...strokes.slice(i)];
}

function update(state: DrawState, id: string, fn: (s: Stroke) => Stroke): DrawState {
  for (let i = state.strokes.length - 1; i >= 0; i--) {
    if (state.strokes[i]!.id === id) {
      const strokes = state.strokes.slice();
      strokes[i] = fn(strokes[i]!);
      return { ...state, strokes };
    }
  }
  return state;
}

function validPoints(p: unknown): p is number[] {
  return Array.isArray(p) && p.length % 2 === 0 && p.length <= 4000 && p.every((v) => Number.isFinite(v));
}

export function applyDraw(state: DrawState, e: DrawOp): DrawState {
  switch (e.op) {
    case 'start': {
      const s = e.s;
      if (!s || typeof s.id !== 'string' || state.gone[s.id] || !validPoints(s.p)) return state;
      if (state.strokes.some((x) => x.id === s.id)) return state;
      const stroke: Stroke = { ...s, d: 0, live: true };
      return { ...state, strokes: insert(state.strokes, stroke), top: Math.max(state.top, s.n) };
    }
    case 'pts':
      if (state.gone[e.id] || !validPoints(e.p)) return state;
      return update(state, e.id, (s) => ({
        ...s,
        p: s.p.concat(e.p),
        ...(s.ws || e.ws ? { ws: (s.ws ?? []).concat(e.ws ?? []) } : {}),
      }));
    case 'end':
      return update(state, e.id, (s) => {
        const { live: _live, ...done } = s;
        return { ...done, d: Math.max(0, e.d || 0) };
      });
    case 'undo': {
      if (state.gone[e.id]) return state;
      return { ...state, strokes: state.strokes.filter((s) => s.id !== e.id), gone: { ...state.gone, [e.id]: true } };
    }
    case 'clear': {
      if (!Array.isArray(e.ids) || !e.ids.length) return state;
      const ids = new Set(e.ids);
      const gone = { ...state.gone };
      for (const id of e.ids) gone[id] = true;
      return { ...state, strokes: state.strokes.filter((s) => !ids.has(s.id)), gone };
    }
    case 'bg':
      return { ...state, bg: e.bg ?? null };
    case 'snap': {
      let next = state;
      for (const id of e.gone ?? []) {
        if (!next.gone[id]) next = applyDraw(next, { op: 'undo', id });
      }
      for (const s of e.strokes ?? []) {
        if (next.gone[s.id] || !validPoints(s.p)) continue;
        const have = next.strokes.find((x) => x.id === s.id);
        if (!have) next = { ...next, strokes: insert(next.strokes, s), top: Math.max(next.top, s.n) };
        else if (have.p.length < s.p.length) next = update(next, s.id, () => s);
      }
      if (!next.bg && e.bg) next = { ...next, bg: e.bg };
      return next;
    }
    default:
      return state;
  }
}

/** Snapshot parts small enough for one broadcast message each. */
export function snapshotParts(state: DrawState, budget = 60_000): DrawOp[] {
  const parts: Stroke[][] = [[]];
  let size = 0;
  for (const s of state.strokes) {
    const bytes = 80 + s.p.length * 5 + (s.ws?.length ?? 0) * 4;
    if (size + bytes > budget && parts[parts.length - 1]!.length) {
      parts.push([]);
      size = 0;
    }
    parts[parts.length - 1]!.push(s);
    size += bytes;
  }
  const gone = Object.keys(state.gone);
  return parts.map((strokes, i) => ({ op: 'snap', part: i, of: parts.length, strokes, gone: i === 0 ? gone : [], bg: state.bg }));
}

// ------------------------------------------------------------ session ---

type Listener<T> = (v: T) => void;

export interface DrawTransport {
  send(e: DrawEvent): void;
  on(fn: (e: DrawEvent) => void): () => void;
}

export interface PartnerCursor {
  x: number;
  y: number;
  at: number;
}

/** How often to send collected points while a stroke is being drawn. */
export const BATCH_MS = 40;
/** "I'm here" heartbeat while a canvas is open; partner counts as gone after HERE_TTL. */
export const HERE_EVERY_MS = 10_000;
export const HERE_TTL_MS = 25_000;

let counter = 0;
const newId = (me: string) => `${me.slice(0, 8)}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/**
 * One canvas. Holds the picture, my stroke in progress (sent in ~40 ms
 * batches), my partner's pen position and whether they have it open.
 */
export class DrawSession {
  private state: DrawState = emptyDraw();
  private listeners = new Set<Listener<DrawState>>();
  private cursorListeners = new Set<Listener<PartnerCursor | null>>();
  private current: { id: string; start: number; sentP: number; sentW: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastCur = 0;
  partnerCursor: PartnerCursor | null = null;
  partnerHereAt = 0;
  partnerActiveAt = 0;
  /** My own strokes, newest last, for undo. */
  private mine: string[] = [];

  constructor(
    readonly sid: string,
    readonly me: string,
    private readonly send: (op: DrawOp) => void,
    private readonly now: () => number = Date.now,
  ) {}

  get snapshot(): DrawState {
    return this.state;
  }

  subscribe(fn: Listener<DrawState>) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  onCursor(fn: Listener<PartnerCursor | null>) {
    this.cursorListeners.add(fn);
    return () => void this.cursorListeners.delete(fn);
  }

  private set(next: DrawState) {
    if (next === this.state) return;
    this.state = next;
    for (const fn of [...this.listeners]) fn(next);
  }

  /** A message from my partner for this canvas. */
  receive(e: DrawEvent) {
    if (e.from === this.me) return;
    if (e.op === 'cur') {
      this.partnerCursor = e.x < 0 ? null : { x: clampX(e.x), y: clampY(e.y), at: this.now() };
      for (const fn of [...this.cursorListeners]) fn(this.partnerCursor);
      return;
    }
    if (e.op === 'here') {
      this.partnerHereAt = e.on ? this.now() : 0;
      if (!e.on && this.partnerCursor) {
        this.partnerCursor = null;
        for (const fn of [...this.cursorListeners]) fn(null);
      }
      for (const fn of [...this.listeners]) fn(this.state);
      return;
    }
    if (e.op === 'hello') {
      if (this.state.strokes.length || this.state.bg || Object.keys(this.state.gone).length) {
        for (const part of snapshotParts(this.state)) this.send(part);
      }
      return;
    }
    if (e.op === 'start' || e.op === 'pts' || e.op === 'end') {
      this.partnerActiveAt = this.now();
      this.partnerHereAt = Math.max(this.partnerHereAt, this.now());
    }
    this.set(applyDraw(this.state, e));
  }

  get partnerHere() {
    return this.now() - this.partnerHereAt < HERE_TTL_MS;
  }

  // ---- my pen ----

  begin(x: number, y: number, tool: DrawTool, c: number, w: number, pressure?: number) {
    if (this.current) this.finish();
    const id = newId(this.me);
    const s: Omit<Stroke, 'live' | 'd'> = {
      id,
      by: this.me,
      tool,
      c,
      w,
      p: [clampX(x), clampY(y)],
      ...(pressure !== undefined ? { ws: [pressureWidth(w, pressure)] } : {}),
      n: this.state.top + 1,
      t0: this.now(),
    };
    this.current = { id, start: this.now(), sentP: 2, sentW: s.ws ? 1 : 0 };
    this.mine.push(id);
    this.set(applyDraw(this.state, { op: 'start', s }));
    this.send({ op: 'start', s });
    this.cursor(x, y);
  }

  move(x: number, y: number, pressure?: number) {
    const cur = this.current;
    if (!cur) return;
    const s = this.state.strokes.find((v) => v.id === cur.id);
    if (!s) return;
    const bx = clampX(x);
    const by = clampY(y);
    if (!shouldAdd(s.p, bx, by)) return;
    this.set(
      applyDraw(this.state, {
        op: 'pts',
        id: cur.id,
        p: [bx, by],
        ...(s.ws && pressure !== undefined ? { ws: [pressureWidth(s.w, pressure)] } : s.ws ? { ws: [s.ws[s.ws.length - 1]!] } : {}),
      }),
    );
    if (!this.timer) this.timer = setTimeout(() => this.flush(), BATCH_MS);
  }

  /** Send the points collected since the last batch. */
  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const cur = this.current;
    if (!cur) return;
    const s = this.state.strokes.find((v) => v.id === cur.id);
    if (!s || s.p.length <= cur.sentP) return;
    const p = s.p.slice(cur.sentP);
    const ws = s.ws ? s.ws.slice(cur.sentW) : undefined;
    cur.sentP = s.p.length;
    cur.sentW = s.ws?.length ?? 0;
    this.send({ op: 'pts', id: cur.id, p, ...(ws ? { ws } : {}) });
    const n = s.p.length;
    this.cursor(s.p[n - 2]!, s.p[n - 1]!);
  }

  finish() {
    const cur = this.current;
    if (!cur) return;
    this.flush();
    this.current = null;
    const d = this.now() - cur.start;
    this.set(applyDraw(this.state, { op: 'end', id: cur.id, d }));
    this.send({ op: 'end', id: cur.id, d });
  }

  /** Pointer position for my partner's cursor dot, at most ~12 times a second. */
  cursor(x: number, y: number) {
    const t = this.now();
    if (x >= 0 && t - this.lastCur < 80) return;
    this.lastCur = t;
    this.send({ op: 'cur', x: x < 0 ? -1 : clampX(x), y: y < 0 ? -1 : clampY(y) });
  }

  /** Take back my own last stroke that's still on the board. */
  undo(): boolean {
    this.finish();
    while (this.mine.length) {
      const id = this.mine.pop()!;
      if (this.state.strokes.some((s) => s.id === id)) {
        this.set(applyDraw(this.state, { op: 'undo', id }));
        this.send({ op: 'undo', id });
        return true;
      }
    }
    return false;
  }

  get canUndo() {
    return this.mine.some((id) => this.state.strokes.some((s) => s.id === id));
  }

  clear() {
    this.finish();
    const ids = this.state.strokes.map((s) => s.id);
    if (!ids.length) return;
    this.set(applyDraw(this.state, { op: 'clear', ids }));
    this.send({ op: 'clear', ids });
  }

  setBackground(bg: DrawBackground | null) {
    this.set(applyDraw(this.state, { op: 'bg', bg }));
    this.send({ op: 'bg', bg });
  }

  /** Start over locally (a fresh doodle or game round). Nothing is sent. */
  reset(state: DrawState = emptyDraw()) {
    this.finish();
    this.mine = [];
    this.set(state);
  }

  /**
   * Put a saved drawing on this canvas for both of us ("Keep drawing"): what's
   * there now is cleared, then the saved strokes go out as a snapshot.
   */
  load(strokes: Stroke[], bg: DrawBackground | null) {
    this.clear();
    const top = this.state.top;
    const fresh = strokes.map(({ live: _live, ...s }, i) => ({ ...s, id: `${s.id}~${top + i + 1}`, n: top + i + 1 }));
    let next: DrawState = { ...this.state, bg };
    next = applyDraw(next, { op: 'snap', part: 0, of: 1, strokes: fresh, gone: [], bg });
    this.set({ ...next, bg });
    for (const part of snapshotParts({ ...next, gone: {} })) this.send(part);
    this.send({ op: 'bg', bg });
  }

  hello() {
    this.send({ op: 'hello' });
  }

  here(on: boolean) {
    this.send({ op: 'here', on });
  }
}

/**
 * All canvases on one couple channel. Keeps listening while no canvas is on
 * screen, so the picture is still there when either of us opens it, and so
 * the app can say "{name} is drawing".
 */
export class DrawHub {
  private sessions = new Map<string, DrawSession>();
  private gameListeners = new Set<Listener<{ g: unknown; from: string; sid: string }>>();
  private activity = new Set<Listener<string>>();
  private off: () => void;

  constructor(
    readonly me: string,
    private readonly transport: DrawTransport,
    private readonly now: () => number = Date.now,
  ) {
    this.off = transport.on((e) => this.receive(e));
  }

  session(sid: string): DrawSession {
    let s = this.sessions.get(sid);
    if (!s) {
      s = new DrawSession(sid, this.me, (op) => this.transport.send({ ...op, sid, from: this.me } as DrawEvent), this.now);
      this.sessions.set(sid, s);
    }
    return s;
  }

  has(sid: string) {
    return this.sessions.has(sid);
  }

  sendGame(sid: string, g: unknown) {
    this.transport.send({ op: 'game', g, sid, from: this.me });
  }

  onGame(fn: Listener<{ g: unknown; from: string; sid: string }>) {
    this.gameListeners.add(fn);
    return () => void this.gameListeners.delete(fn);
  }

  /** Fires with the canvas id whenever my partner draws or opens/closes one. */
  onActivity(fn: Listener<string>) {
    this.activity.add(fn);
    return () => void this.activity.delete(fn);
  }

  private receive(e: DrawEvent) {
    if (!e || typeof e.sid !== 'string' || e.from === this.me) return;
    if (e.op === 'game') {
      for (const fn of [...this.gameListeners]) fn({ g: e.g, from: e.from, sid: e.sid });
      return;
    }
    // Answer a hello only for canvases we know; anything else opens a session.
    if (e.op === 'hello' && !this.sessions.has(e.sid)) return;
    this.session(e.sid).receive(e);
    if (e.op !== 'cur' && e.op !== 'snap') for (const fn of [...this.activity]) fn(e.sid);
  }

  dispose() {
    this.off();
  }
}

export const LIVE_CANVAS = 'live';

/** Board size within a box: the largest 3:4 rectangle that fits, centred. */
export function fitBoard(width: number, height: number): { width: number; height: number; x: number; y: number } {
  const w = Math.min(width, (height * BOARD_W) / BOARD_H);
  const h = (w * BOARD_H) / BOARD_W;
  return { width: Math.floor(w), height: Math.floor(h), x: Math.floor((width - w) / 2), y: Math.floor((height - h) / 2) };
}
