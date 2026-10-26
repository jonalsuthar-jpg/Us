import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  dailyDoodlePrompt,
  dailyDoodles,
  dailyDoodleStatus,
  DRAW_TOPIC,
  drawGameStats,
  drawingUrls,
  gameTurns,
  listDrawGames,
  listDrawings,
  openTurnGame,
  unseenDoodles,
  type DrawGameStats,
} from '../api/draw';
import { toDateKey } from '../api/plan';
import type { DrawGame, Drawing } from '../database.types';
import { gameStoreFor, GameStore } from '../draw/game-store';
import { DrawHub, HERE_EVERY_MS, HERE_TTL_MS, LIVE_CANVAS, type DrawSession, type DrawState, type PartnerCursor } from '../draw/session';
import type { CoupleChannel } from '../realtime/couple-channel';
import { useCouple } from './couple-provider';

const hubs = new WeakMap<CoupleChannel, DrawHub>();

/** The couple's drawing hub. One per channel, alive as long as the app is. */
export function drawHubFor(channel: CoupleChannel): DrawHub {
  let hub = hubs.get(channel);
  if (!hub) {
    hub = new DrawHub(channel.userId, { send: (e) => channel.sendDraw(e), on: (fn) => channel.draw.on(fn) });
    hubs.set(channel, hub);
  }
  return hub;
}

export function useDrawHub(): DrawHub {
  const { channel } = useCouple();
  return useMemo(() => drawHubFor(channel), [channel]);
}

export interface DrawSessionView {
  session: DrawSession;
  state: DrawState;
  cursor: PartnerCursor | null;
  partnerHere: boolean;
}

/**
 * A canvas on screen: the picture, my partner's pen and whether they have it
 * open too. While mounted it tells my partner I'm here and asks for anything
 * already drawn.
 */
export function useDrawSession(sid: string = LIVE_CANVAS, opts: { announce?: boolean } = {}): DrawSessionView {
  const hub = useDrawHub();
  const { connection } = useCouple();
  const session = useMemo(() => hub.session(sid), [hub, sid]);
  const announce = opts.announce !== false;
  const state = useSyncExternalStore(
    useCallback((fn) => session.subscribe(fn), [session]),
    () => session.snapshot,
    () => session.snapshot,
  );
  const [cursor, setCursor] = useState<PartnerCursor | null>(session.partnerCursor);
  useEffect(() => session.onCursor(setCursor), [session]);

  // Say hello (late join) and keep saying "I'm here" while open.
  useEffect(() => {
    if (!announce || connection !== 'live') return;
    session.hello();
    session.here(true);
    const t = setInterval(() => session.here(true), HERE_EVERY_MS);
    return () => {
      clearInterval(t);
      session.finish();
      session.here(false);
      session.cursor(-1, -1);
    };
  }, [session, announce, connection]);

  // Partner presence goes stale on its own; re-check now and then.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5_000);
    return () => clearInterval(t);
  }, []);

  return { session, state, cursor, partnerHere: session.partnerHere };
}

/** True while my partner has the live canvas open (for the "is drawing — join" banner). */
export function usePartnerDrawing(): boolean {
  const hub = useDrawHub();
  const [on, setOn] = useState(() => hub.has(LIVE_CANVAS) && hub.session(LIVE_CANVAS).partnerHere);
  useEffect(() => {
    const check = () => setOn(hub.has(LIVE_CANVAS) && hub.session(LIVE_CANVAS).partnerHere);
    const off = hub.onActivity((sid) => sid === LIVE_CANVAS && check());
    const t = setInterval(check, HERE_TTL_MS / 5);
    return () => {
      off();
      clearInterval(t);
    };
  }, [hub]);
  return on;
}

/** Doodles my partner left me that I haven't opened yet. Refreshes when they leave another. */
export function useUnseenDoodles(enabled = true): { doodles: Drawing[]; reload: () => void } {
  const { sb, me, channel } = useCouple();
  const [doodles, setDoodles] = useState<Drawing[]>([]);
  const reload = useCallback(() => {
    if (!enabled) return;
    void unseenDoodles(sb, me.id)
      .then(setDoodles)
      .catch(() => {});
  }, [sb, me.id, enabled]);
  useEffect(() => {
    reload();
    const off = channel.changes.on((e) => e.topic === DRAW_TOPIC && reload());
    const offStatus = channel.status.on((s) => s === 'live' && reload());
    return () => {
      off();
      offStatus();
    };
  }, [channel, reload]);
  return { doodles, reload };
}

/** The live Draw & Guess game, if one is going (or I've been invited to one). */
export function useDrawGame(): GameStore {
  const hub = useDrawHub();
  const { sb, couple, me, partner } = useCouple();
  const store = useMemo(() => gameStoreFor(hub, () => new GameStore(hub, sb, couple.id, me.id, partner.id)), [hub, sb, couple.id, me.id, partner.id]);
  useSyncExternalStore(
    useCallback((fn) => store.subscribe(fn), [store]),
    () => store.state,
    () => store.state,
  );
  return store;
}

/** Our saved drawings, newest first, with links to their pictures. Refreshes when either of us saves one. */
export function useDrawings(enabled = true): { drawings: Drawing[]; urls: Record<string, string>; loading: boolean; reload: () => void } {
  const { sb, couple, channel } = useCouple();
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    if (!enabled) return;
    void (async () => {
      const list = await listDrawings(sb, couple.id);
      const links = await drawingUrls(sb, list.map((d) => d.png_path));
      setDrawings(list);
      setUrls(links);
    })()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sb, couple.id, enabled]);
  useEffect(() => {
    reload();
    const off = channel.changes.on((e) => e.topic === DRAW_TOPIC && reload());
    return off;
  }, [channel, reload]);
  return { drawings, urls, loading, reload };
}

export interface DailyDoodleView {
  day: string;
  prompt: string;
  mine: boolean;
  partner: boolean;
  /** Both drawings, once I've drawn mine. */
  drawings: Drawing[];
  urls: Record<string, string>;
  reload: () => void;
}

/** Today's doodle prompt: hidden from each other until we've both drawn it. */
export function useDailyDoodle(enabled = true): DailyDoodleView {
  const { sb, couple, channel } = useCouple();
  const day = toDateKey(new Date());
  const [view, setView] = useState<Omit<DailyDoodleView, 'reload' | 'day' | 'prompt'>>({ mine: false, partner: false, drawings: [], urls: {} });
  const reload = useCallback(() => {
    if (!enabled) return;
    void (async () => {
      const status = await dailyDoodleStatus(sb, day);
      const drawings = status.mine ? await dailyDoodles(sb, couple.id, day) : [];
      const urls = await drawingUrls(sb, drawings.map((d) => d.png_path));
      setView({ ...status, drawings, urls });
    })().catch(() => {});
  }, [sb, couple.id, day, enabled]);
  useEffect(() => {
    reload();
    return channel.changes.on((e) => e.topic === DRAW_TOPIC && reload());
  }, [channel, reload]);
  return { ...view, day, prompt: dailyDoodlePrompt(day), reload };
}

export interface TurnGameView {
  games: DrawGame[];
  stats: DrawGameStats;
  /** A game played in turns that isn't finished. */
  open: DrawGame | null;
  turns: Drawing[];
  /** My partner drew; I haven't guessed yet. */
  toGuess: Drawing | null;
  /** It's my go to draw the next round. */
  myTurnToDraw: boolean;
  loading: boolean;
  reload: () => void;
}

/** Draw & Guess games: stats, and whose go it is in a game played in turns. */
export function useDrawGames(enabled = true): TurnGameView {
  const { sb, couple, me, channel } = useCouple();
  const [games, setGames] = useState<DrawGame[]>([]);
  const [turns, setTurns] = useState<Drawing[]>([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    if (!enabled) return;
    void (async () => {
      const list = await listDrawGames(sb, couple.id);
      const open = openTurnGame(list);
      setGames(list);
      setTurns(open ? await gameTurns(sb, open.id) : []);
    })()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sb, couple.id, enabled]);
  useEffect(() => {
    reload();
    return channel.changes.on((e) => e.topic === DRAW_TOPIC && reload());
  }, [channel, reload]);
  const open = openTurnGame(games);
  const last = turns[turns.length - 1] ?? null;
  const toGuess = last && !last.answered_at && last.created_by !== me.id ? last : null;
  const waiting = last && !last.answered_at;
  const nextRound = open ? open.played : 0;
  const starter = open?.started_by;
  const myTurnToDraw = !!open && !waiting && (nextRound % 2 === 0 ? starter === me.id : starter !== me.id);
  return { games, stats: drawGameStats(games), open, turns, toGuess, myTurnToDraw, loading, reload };
}
