import type { Database, DrawGame, DrawWord, Drawing } from '../database.types';
import { encodeDrawing, decodeDrawing, EXPORT_H, EXPORT_W, type DrawBackground, type DrawingFile, type Stroke } from '../draw/strokes';
import { clampSettings, hintOrder, hintTimes, secretFor, TURN_MS, type GameSettings, type WordSecret } from '../draw/guess';
import type { Difficulty, PackId } from '../draw/words';
import type { UsClient } from '../supabase';
import { uuid } from '../uuid';
import { createMemory, uploadMemoryPhoto } from './memory';

export const DRAW_BUCKET = 'drawings';
/** "Something changed in our drawings" ping on the couple channel. */
export const DRAW_TOPIC = 'draw';

type Insert = Database['public']['Tables']['drawings']['Insert'];

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

export type DrawingKind = Drawing['kind'];

export interface SaveDrawing {
  coupleId: string;
  me: string;
  kind: DrawingKind;
  strokes: Stroke[];
  bg?: DrawBackground | null;
  /** The PNG (EXPORT_W × EXPORT_H). */
  png: Blob | ArrayBuffer | Uint8Array;
  title?: string | null;
  note?: string | null;
  forUser?: string | null;
  day?: string | null;
  prompt?: string | null;
  gameId?: string | null;
  round?: number | null;
  meta?: Record<string, unknown>;
}

/** Upload the strokes and the picture, then record the drawing. */
export async function saveDrawing(sb: UsClient, d: SaveDrawing): Promise<Drawing> {
  const id = uuid();
  const file = encodeDrawing(d.strokes, d.bg ?? null);
  const base = `${d.coupleId}/${id}`;
  const store = sb.storage.from(DRAW_BUCKET);
  const json = new TextEncoder().encode(JSON.stringify(file));
  const up1 = await store.upload(`${base}.json`, json, { contentType: 'application/json', upsert: false });
  if (up1.error) throw up1.error;
  const up2 = await store.upload(`${base}.png`, d.png, { contentType: 'image/png', upsert: false });
  if (up2.error) {
    await store.remove([`${base}.json`]).catch(() => {});
    throw up2.error;
  }
  const row: Insert = {
    id,
    couple_id: d.coupleId,
    created_by: d.me,
    kind: d.kind,
    title: d.title?.trim() || null,
    note: d.note?.trim() || null,
    strokes_path: `${base}.json`,
    png_path: `${base}.png`,
    width: EXPORT_W,
    height: EXPORT_H,
    stroke_count: file.strokes.length,
    artists: [...new Set(file.strokes.map((s) => s.by).filter(Boolean))],
    for_user: d.forUser ?? null,
    day: d.day ?? null,
    prompt: d.prompt ?? null,
    game_id: d.gameId ?? null,
    round: d.round ?? null,
    meta: (d.meta ?? {}) as Insert['meta'],
  };
  try {
    return unwrap(await sb.from('drawings').insert(row).select('*').single());
  } catch (e) {
    await store.remove([row.strokes_path, row.png_path]).catch(() => {});
    throw e;
  }
}

export async function listDrawings(sb: UsClient, coupleId: string, limit = 200): Promise<Drawing[]> {
  return unwrap(
    await sb.from('drawings').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(limit),
  );
}

export async function getDrawing(sb: UsClient, id: string): Promise<Drawing | null> {
  return unwrap(await sb.from('drawings').select('*').eq('id', id).maybeSingle());
}

export async function loadStrokes(sb: UsClient, path: string): Promise<DrawingFile> {
  const { data, error } = await sb.storage.from(DRAW_BUCKET).download(path);
  if (error || !data) throw error ?? new Error('Drawing not found');
  return decodeDrawing(JSON.parse(await data.text()));
}

/** Short-lived links to drawing pictures, keyed by path. */
export async function drawingUrls(sb: UsClient, paths: string[], expiresIn = 3600): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const { data, error } = await sb.storage.from(DRAW_BUCKET).createSignedUrls(unique, expiresIn);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

export async function drawingPng(sb: UsClient, d: Pick<Drawing, 'png_path'>): Promise<Blob> {
  const { data, error } = await sb.storage.from(DRAW_BUCKET).download(d.png_path);
  if (error || !data) throw error ?? new Error('Picture not found');
  return data;
}

export async function renameDrawing(sb: UsClient, id: string, title: string | null): Promise<void> {
  unwrap(await sb.from('drawings').update({ title: title?.trim() || null }).eq('id', id));
}

export async function deleteDrawing(sb: UsClient, d: Pick<Drawing, 'id' | 'strokes_path' | 'png_path'>): Promise<void> {
  unwrap(await sb.from('drawings').delete().eq('id', d.id));
  await sb.storage.from(DRAW_BUCKET).remove([d.strokes_path, d.png_path]).catch(() => {});
}

/** Keep a drawing in Memories: its picture becomes the memory's photo. */
export async function drawingToMemory(
  sb: UsClient,
  d: Pick<Drawing, 'id' | 'couple_id' | 'png_path' | 'title' | 'created_by' | 'created_at'>,
  me: string,
  title?: string,
): Promise<string> {
  const png = await drawingPng(sb, d);
  const photo = await uploadMemoryPhoto(sb, d.couple_id, png, 'image/png');
  const memory = await createMemory(sb, {
    couple_id: d.couple_id,
    created_by: me,
    title: (title || d.title || 'A drawing of ours').slice(0, 200),
    happened_on: d.created_at.slice(0, 10),
    photo_path: photo,
    kind: 'moment',
  });
  if (d.created_by === me) await sb.from('drawings').update({ memory_id: memory.id }).eq('id', d.id);
  return memory.id;
}

// --------------------------------------------------------------- doodles ---

/** Doodles my partner left me that I haven't opened, newest first. */
export async function unseenDoodles(sb: UsClient, me: string): Promise<Drawing[]> {
  return unwrap(
    await sb
      .from('drawings')
      .select('*')
      .eq('kind', 'doodle')
      .eq('for_user', me)
      .is('seen_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
  );
}

export async function markDoodleSeen(sb: UsClient, id: string): Promise<void> {
  unwrap(await sb.rpc('mark_doodle_seen', { p_id: id }));
}

// ----------------------------------------------------------- daily doodle ---

export const DAILY_DOODLE_PROMPTS = [
  'Our first trip',
  'Your favourite thing about me',
  'Where we’d live if we could live anywhere',
  'Our perfect Sunday',
  'The first time we met',
  'Something that made you smile today',
  'Your dream holiday',
  'Us, as animals',
  'Our future home',
  'What I look like when I wake up',
  'Our favourite food',
  'A place we’ve been together',
  'Your happy place',
  'Something you’re grateful for',
  'Our song, as a picture',
  'What we’ll be doing in 10 years',
  'The best date we’ve had',
  'A memory from childhood',
  'Your superpower',
  'Our inside joke',
  'Monsoon evening',
  'Chai for two',
  'What you’re looking forward to',
  'Your morning, in one picture',
];

/** Today's prompt: the same on both phones for the same day. */
export function dailyDoodlePrompt(day: string): string {
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return DAILY_DOODLE_PROMPTS[h % DAILY_DOODLE_PROMPTS.length]!;
}

export async function dailyDoodleStatus(sb: UsClient, day: string): Promise<{ mine: boolean; partner: boolean }> {
  const rows = unwrap(await sb.rpc('daily_doodle_status', { p_day: day }));
  const row = Array.isArray(rows) ? rows[0] : rows;
  return { mine: !!row?.mine, partner: !!row?.partner };
}

/** Both daily doodles for a day (mine always; my partner's only once I've drawn). */
export async function dailyDoodles(sb: UsClient, coupleId: string, day: string): Promise<Drawing[]> {
  return unwrap(await sb.from('drawings').select('*').eq('couple_id', coupleId).eq('kind', 'daily').eq('day', day));
}

// ----------------------------------------------------------------- words ---

export async function listDrawWords(sb: UsClient, coupleId: string): Promise<DrawWord[]> {
  return unwrap(await sb.from('draw_words').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }));
}

export async function addDrawWord(sb: UsClient, coupleId: string, me: string, word: string): Promise<DrawWord> {
  return unwrap(await sb.from('draw_words').insert({ couple_id: coupleId, added_by: me, word: word.trim() }).select('*').single());
}

export async function removeDrawWord(sb: UsClient, id: string): Promise<void> {
  unwrap(await sb.from('draw_words').delete().eq('id', id));
}

/** Our own words plus our memory titles, for the "Ours" pack. */
export async function ourWordTexts(sb: UsClient, coupleId: string): Promise<string[]> {
  const [words, memories] = await Promise.all([
    listDrawWords(sb, coupleId),
    sb.from('memories').select('title').eq('couple_id', coupleId).order('happened_on', { ascending: false }).limit(60),
  ]);
  return [...words.map((w) => w.word), ...((memories.data ?? []) as { title: string }[]).map((m) => m.title)];
}

// ----------------------------------------------------------------- games ---

const settingsColumns = (s: GameSettings) => ({ rounds: s.rounds, draw_ms: s.drawMs, hints: s.hints, choices: s.choices });

/** A saved game's settings (games from before settings existed get the old rules). */
export function gameSettings(g: Pick<DrawGame, 'rounds' | 'draw_ms' | 'hints' | 'choices'>): GameSettings {
  return clampSettings({ rounds: g.rounds, drawMs: g.draw_ms, hints: g.hints, choices: g.choices });
}

export async function startDrawGame(
  sb: UsClient,
  g: { coupleId: string; me: string; mode: 'live' | 'turns'; packs: PackId[]; settings: Partial<GameSettings> },
): Promise<DrawGame> {
  return unwrap(
    await sb
      .from('draw_games')
      .insert({ couple_id: g.coupleId, started_by: g.me, mode: g.mode, packs: g.packs, ...settingsColumns(clampSettings(g.settings)) })
      .select('*')
      .single(),
  );
}

export async function finishDrawGame(
  sb: UsClient,
  id: string,
  r: { played: number; score: number; solved: number; bestWord: string | null; bestMs: number | null },
): Promise<void> {
  unwrap(
    await sb.rpc('finish_draw_game', {
      p_id: id,
      p_played: r.played,
      p_score: r.score,
      p_solved: r.solved,
      p_best_word: r.bestWord,
      p_best_ms: r.bestMs,
    }),
  );
}

export async function listDrawGames(sb: UsClient, coupleId: string, limit = 50): Promise<DrawGame[]> {
  return unwrap(await sb.from('draw_games').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }).limit(limit));
}

export interface DrawGameStats {
  played: number;
  best: number;
  fastestMs: number | null;
  fastestWord: string | null;
}

export function drawGameStats(games: DrawGame[]): DrawGameStats {
  const done = games.filter((g) => g.finished_at);
  let fastest: DrawGame | null = null;
  for (const g of done) if (g.best_ms != null && (!fastest || g.best_ms < fastest.best_ms!)) fastest = g;
  return {
    played: done.length,
    best: done.reduce((m, g) => Math.max(m, g.score), 0),
    fastestMs: fastest?.best_ms ?? null,
    fastestWord: fastest?.best_word ?? null,
  };
}

/** A game played in turns that's waiting on someone, if any. */
export function openTurnGame(games: DrawGame[]): DrawGame | null {
  return games.find((g) => g.mode === 'turns' && !g.finished_at) ?? null;
}

export interface TurnMeta {
  secret: WordSecret;
  salt: string;
  level: Difficulty;
  pack: PackId;
  /** Letters revealed during the replay, each at its time (`at`, ms; older turns: every 20 s). */
  hints: { i: number; ch: string; at?: number }[];
  /** How long the drawer took. */
  ms: number;
  /** The guessing time for this turn (older turns: 80 s). */
  drawMs?: number;
}

/** How long the guesser has, and which hints have shown `elapsed` ms in. */
export function turnClock(meta: TurnMeta, elapsed: number): { drawMs: number; revealed: Record<number, string> } {
  const drawMs = meta.drawMs ?? TURN_MS;
  const revealed: Record<number, string> = {};
  meta.hints.forEach((h, n) => {
    if (elapsed >= (h.at ?? 20_000 * (n + 1))) revealed[h.i] = h.ch;
  });
  return { drawMs, revealed };
}

/** Save my turn: the drawing, the hashed word for my partner's app, the word itself kept apart. */
export async function saveGuessTurn(
  sb: UsClient,
  t: {
    coupleId: string;
    me: string;
    gameId: string;
    round: number;
    word: string;
    level: Difficulty;
    pack: PackId;
    strokes: Stroke[];
    png: Blob | ArrayBuffer | Uint8Array;
    ms: number;
    settings: GameSettings;
  },
): Promise<Drawing> {
  const salt = `${t.gameId}:${t.round}`;
  const order = hintOrder(t.word, t.round + t.word.length * 7, t.settings.hints);
  const times = hintTimes(t.settings.drawMs, t.settings.hints);
  const chars = [...t.word.trim()];
  const meta: TurnMeta = {
    secret: secretFor(t.word, salt),
    salt,
    level: t.level,
    pack: t.pack,
    hints: order.map((i, n) => ({ i, ch: chars[i]!, at: times[n]! })),
    ms: t.ms,
    drawMs: t.settings.drawMs,
  };
  const d = await saveDrawing(sb, {
    coupleId: t.coupleId,
    me: t.me,
    kind: 'guess',
    strokes: t.strokes,
    png: t.png,
    gameId: t.gameId,
    round: t.round,
    meta: meta as unknown as Record<string, unknown>,
  });
  unwrap(await sb.from('draw_secrets').insert({ drawing_id: d.id, couple_id: t.coupleId, word: t.word.trim() }));
  return d;
}

export function turnMeta(d: Pick<Drawing, 'meta'>): TurnMeta | null {
  const m = d.meta as unknown as Partial<TurnMeta> | null;
  return m && m.secret && m.salt ? (m as TurnMeta) : null;
}

/** Turns of a game, oldest first. */
export async function gameTurns(sb: UsClient, gameId: string): Promise<Drawing[]> {
  return unwrap(await sb.from('drawings').select('*').eq('game_id', gameId).eq('kind', 'guess').order('round', { ascending: true }));
}

export async function answerGuess(sb: UsClient, drawingId: string, solved: boolean, ms: number, points: number): Promise<DrawGame> {
  const rows = unwrap(await sb.rpc('answer_guess', { p_drawing: drawingId, p_solved: solved, p_ms: ms, p_points: points }));
  return (Array.isArray(rows) ? rows[0] : rows) as DrawGame;
}

/** The word of a turn: for its drawer, or once it's been answered. */
export async function turnWord(sb: UsClient, drawingId: string): Promise<string | null> {
  const row = unwrap(await sb.from('draw_secrets').select('word').eq('drawing_id', drawingId).maybeSingle());
  return (row as { word: string } | null)?.word ?? null;
}
