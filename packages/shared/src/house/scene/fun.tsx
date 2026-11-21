import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import * as THREE from 'three';
import {
  ballAt,
  ballLands,
  bedReady,
  chessBoard,
  chessMove,
  chessStatus,
  chessTargets,
  chessTurn,
  CROPS,
  dinnerDone,
  dinnerStep,
  dinnerWho,
  giftFresh,
  GIFT_LABEL,
  HIDE_S,
  LUDO_DONE,
  LUDO_LOOP,
  LUDO_STARS,
  ludoMovable,
  ludoMove,
  ludoRoll,
  ludoWinner,
  MOODS,
  moodOf,
  newChess,
  newLudo,
  newTicTacToe,
  nextUnlock,
  RECIPES,
  SEEK_S,
  seekPhase,
  throwTo,
  ticTacToeMove,
  ticTacToeWinner,
  unlocked as unlockedBy,
  warmth,
  waterBed,
  type ChessGame,
  type Crop,
  type Dinner,
  type Gift,
  type GiftKind,
  type Ludo,
  type Recipe,
  type Seek,
  type Throw,
  type TicTacToe,
} from '../fun';
import { DISH_KEY, isOn, MUSIC_KEY, placeItems, restingY, today, type PlacedItem } from '../items';
import { FLOOR_H, POOL, regionAt, type RegionId } from '../layout';
import { WORLD_DAY_MS, worldHours } from '../sky';
import { TEMPLE } from '../village';
import type { Emote, Pose } from '../presence';
import type { HouseSound } from '../sound';
import type { HouseStore } from '../store';
import { PRICES, walletLineText, walletRef, type Priced, type Reward } from '../../api/wallet';
import { VILLAGERS, villagerAt } from '../villagers';
import { DANCE_S, HEART_S } from './avatar';
import { colour, FunBall, FunFlames, funSphere } from './fun-models';
import type { HousePhoto } from './items';

/** A card the screens draw the same way on the phone and the web: some words, a picture, buttons, maybe a box to type in. */
export interface FunPanel {
  id: string;
  title: string;
  text?: string;
  image?: string;
  options: FunOption[];
  input?: { placeholder: string; max: number; send: string };
  /** Drawn at the side, not over the middle (playing at the table: the board stays in view). */
  side?: boolean;
}

export interface FunOption {
  id: string;
  label: string;
  emoji?: string;
}

export interface FunHud {
  panel: FunPanel | null;
  /** A line across the top: "Warm", "Your turn". */
  banner: string | null;
  /** The whole screen dark, with these words (counting while they hide). */
  cover: string | null;
  myMood: string | null;
  partnerMood: string | null;
}

/** How the screens reach the layer: open the menu, pick in a card, close it. */
export type FunCmd = { t: 'fun' } | { t: 'pick'; id: string; text?: string } | { t: 'closePanel' };

/** Letters for each other (sealed time capsules, delivered into the chat on their day). */
/** Our money (api/wallet.ts): the balance and history, and earning or spending through the server. */
export interface HouseWallet {
  balance: number;
  recent: { delta: number; reason: string; at: string; mine: boolean }[];
  /** Earn for something done (the server decides how much, once per ref). */
  earn: (reason: Reward, ref: string) => void;
  /** Buy something: true when it went through, false when we can't afford it. */
  spend: (item: Priced, ref: string) => Promise<boolean>;
}

export interface HouseLetters {
  /** Sealed for me, not yet opened, and when the next one opens. */
  waiting: number;
  nextAt: string | null;
  /** Seal one for my partner. Rejects when it can't (encrypted chat isn't on yet). */
  seal: (text: string, at: Date) => Promise<void>;
}

/** What the world shares with the layer: us two, the store, the clock and a few things it can do. */
export interface FunHost {
  me: {
    pos: THREE.Vector3;
    heading: number;
    at: RegionId;
    seat: { key: string; i: number; lie: boolean } | null;
    hold: { key: string; since: number } | null;
    doing: { act: 'cook' | 'water' | 'hug' | 'kiss' | 'slow'; until: number; key?: string } | null;
  };
  them: { pos: THREE.Vector3; shown: boolean; pose: Pose | null };
  meId: string;
  partnerId: string;
  partnerName: string;
  store: HouseStore | null;
  sound?: HouseSound | null;
  photos: HousePhoto[];
  night: boolean;
  pairedAt?: string;
  /** Today's birthday or anniversary, if there is one ("Ana’s birthday"). */
  celebrate?: string | null;
  letters?: HouseLetters | null;
  wallet?: HouseWallet | null;
  coupleId?: string;
  /** What the house has now (useUnlocked). */
  unlocked: ReadonlySet<string>;
  now: () => number;
  say: (text: string) => void;
  moment: (id: string, text: string, hearts?: boolean) => void;
  notify?: (event: 'gift' | 'turn' | 'in' | 'letter') => void;
  emote: (e: Emote) => void;
  walkTo: (x: number, y: number, z: number, use?: string) => void;
  sit: (key: string) => void;
  standUp: () => void;
}

const GAME_KEY = 'game';
const BELL_KEY = 'temple_bell';
const DIYAS_KEY = 'temple_diyas';
const SEEK_KEY = 'seek';
const TREASURE_KEY = 'treasure';
const THROW_KEY = 'throw';
const DINNER_KEY = 'dinner';
const DATE_KEY = 'date';
const BASKET_KEY = 'basket';
const moodKey = (id: string) => `mood:${id.toLowerCase()}`;
const NEAR = 1.3;
const DATE_H = 3;

type Game = { kind: 'chess'; s: ChessGame; at: string } | { kind: 'ludo'; s: Ludo; at: string } | { kind: 'ttt'; s: TicTacToe; at: string };
type DateOn = { kind: 'movie' | 'picnic'; at: string };
type Treasure = { by: string; x: number; y: number; z: number; text: string; at: string };
type Wish = { by: string; text: string; at: string };

const isStr = (v: unknown): v is string => typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const randomId = () => Math.random().toString(36).slice(2, 10);

function readGame(v: Record<string, unknown> | null): Game | null {
  if (!v || !isStr(v.at) || !v.s || typeof v.s !== 'object') return null;
  const s = v.s as Record<string, unknown>;
  if (v.kind === 'chess' && isStr(s.fen) && isStr(s.w) && isStr(s.b)) return v as unknown as Game;
  if (v.kind === 'ttt' && isStr(s.b) && /^[.xo]{9}$/.test(s.b) && isStr(s.x) && isStr(s.o)) return v as unknown as Game;
  if (v.kind === 'ludo' && Array.isArray(s.players) && Array.isArray(s.pos)) return v as unknown as Game;
  return null;
}

const GAME_LABEL = { chess: 'Chess', ludo: 'Ludo', ttt: 'Tic-tac-toe' } as const;

/** Where you buy things in the village, from whom, and what. */
const SHOPS: { keeper: string; x: number; z: number; item: Priced; label: string; done: string }[] = [
  { keeper: 'baker', x: -10.6, z: 43, item: 'bread', label: 'Buy fresh bread', done: 'Warm bread from Asha 🍞' },
  { keeper: 'barista', x: 20.6, z: 44, item: 'coffee', label: 'Order two coffees', done: 'Two coffees, just how you like them ☕' },
  { keeper: 'florist', x: -7.0, z: 53, item: 'bouquet', label: 'Buy flowers', done: 'Fresh flowers for the vase at home 💐' },
];

/** The two players of a game, first one first. */
function playersOf(g: Game): [string, string] {
  if (g.kind === 'chess') return [g.s.w, g.s.b];
  if (g.kind === 'ttt') return [g.s.x, g.s.o];
  return g.s.players;
}

function turnOf(g: Game): string | null {
  if (g.kind === 'chess') return chessStatus(g.s).over ? null : chessTurn(g.s);
  if (g.kind === 'ttt') return ticTacToeWinner(g.s.b) ? null : g.s[g.s.turn];
  return ludoWinner(g.s) ? null : g.s.players[g.s.turn];
}

function winnerOf(g: Game): string | null | 'draw' {
  if (g.kind === 'chess') {
    const s = chessStatus(g.s);
    return s.over ? (s.winner ?? 'draw') : null;
  }
  if (g.kind === 'ttt') {
    const w = ticTacToeWinner(g.s.b);
    return w === 'draw' ? 'draw' : w ? g.s[w] : null;
  }
  return ludoWinner(g.s);
}

/** Where the boards sit: the dining table. N cells a side, each S wide. */
const boardSize = (g: Game) => (g.kind === 'ttt' ? { n: 3, s: 0.15 } : { n: 8, s: 0.075 });

/** Ludo's loop round the edge of the 8×8, and each player's lane in to the middle. */
function ludoCell(player: number, p: number, token: number): [number, number] {
  if (p < 0) return player === 0 ? [-1.2, token * 1.1 - 0.2] : [8.2, 7.2 - token * 1.1];
  if (p >= LUDO_DONE) return player === 0 ? [3.2 + token * 0.6, 3.2] : [3.8 - token * 0.6, 3.8];
  if (p >= LUDO_LOOP) {
    const k = p - LUDO_LOOP + 1;
    return player === 0 ? [k * 0.85, k * 0.85] : [7 - k * 0.85, 7 - k * 0.85];
  }
  const sq = (p + player * (LUDO_LOOP / 2)) % LUDO_LOOP;
  return loopCell(sq);
}

function loopCell(sq: number): [number, number] {
  if (sq < 8) return [sq, 0];
  if (sq < 15) return [7, sq - 7];
  if (sq < 22) return [21 - sq, 7];
  return [0, 28 - sq];
}

const LUDO_COLOUR = ['#D94F70', '#4A8FE8'];

/**
 * Things to do together, on top of the house: the menus, board games at the
 * dining table, hide and seek, a treasure, the ball, gifts left for each
 * other, dates, the garden, moods and letters. The world asks it what the
 * action button does, gives it taps, lets it move the camera, and draws
 * what it returns.
 */
export function useFun(h: FunHost) {
  const { store, meId, partnerId, partnerName } = h;
  const raw = (k: string) => store?.get(k) ?? null;
  const set = (k: string, v: Record<string, unknown> | null) => store?.set(k, v);

  const ui = useRef<{ panel: string | null; photo: number; draft: string; sel: string | null; board: boolean; scope: boolean; rolledAt: number; told: Set<string>; moodAt: number; lastBall: string }>({
    panel: null,
    photo: 0,
    draft: '',
    sel: null,
    board: false,
    scope: false,
    rolledAt: 0,
    told: new Set(),
    moodAt: 0,
    lastBall: '',
  }).current;
  const boardGroup = useRef<THREE.Group>(null);
  const bellSwing = useRef(0);
  const boardPlane = useRef<THREE.Mesh>(null);

  // Read fresh wherever it's used every frame (focus, frame): what React last rendered can be a few frames behind
  // the store, and acting on it again would save the same change over and over.
  const readSeek = (): Seek | null => {
    const v = raw(SEEK_KEY);
    return v && isStr(v.hider) && isStr(v.seeker) && isStr(v.at) ? (v as unknown as Seek) : null;
  };
  const readTreasure = (): Treasure | null => {
    const v = raw(TREASURE_KEY);
    return v && isStr(v.by) && num(v.x) && num(v.y) && num(v.z) && isStr(v.at) ? ({ text: '', ...v } as unknown as Treasure) : null;
  };
  const game = readGame(raw(GAME_KEY));
  const seek = readSeek();
  const treasure = readTreasure();
  const readDinner = (): (Dinner & { at: string; done?: boolean }) | null => {
    const v = raw(DINNER_KEY);
    return v && isStr(v.recipe) && v.recipe in RECIPES && num(v.step) && isStr(v.first) && isStr(v.second) && isStr(v.at) ? (v as unknown as Dinner & { at: string }) : null;
  };
  const dinner = readDinner();
  const dateOn = ((): DateOn | null => {
    const v = raw(DATE_KEY);
    if (!v || (v.kind !== 'movie' && v.kind !== 'picnic') || !isStr(v.at)) return null;
    return Date.now() - Date.parse(v.at) < DATE_H * 3600_000 ? (v as unknown as DateOn) : null;
  })();
  const gifts = ((): { key: string; g: Gift }[] => {
    const out: { key: string; g: Gift }[] = [];
    for (const it of store ? listKeys(store, 'gift:') : []) {
      const v = raw(it);
      if (v && isStr(v.kind) && v.kind in GIFT_LABEL && isStr(v.by) && isStr(v.at)) out.push({ key: it, g: v as unknown as Gift });
    }
    return out;
  })();
  const wishes = ((): Wish[] => (store ? listKeys(store, 'wish:').map((k) => raw(k)).filter((v): v is Record<string, unknown> => !!v && isStr(v.text) && isStr(v.at)).map((v) => v as unknown as Wish) : []))();
  const moodFor = (id: string) => {
    const v = raw(moodKey(id));
    return v && isStr(v.k) && v.day === today() ? moodOf(v.k) : undefined;
  };
  const myMood = moodFor(meId);
  const theirMood = moodFor(partnerId);
  const unlockedSet = h.unlocked;

  // Everything in the house as the store has it this moment (a pick can follow another before React re-renders).
  const cache = useRef<{ src: unknown; set: unknown; out: PlacedItem[] }>({ src: null, set: null, out: [] }).current;
  const fresh = (): PlacedItem[] => {
    const src = store?.items();
    if (!src) return [];
    if (cache.src !== src || cache.set !== unlockedSet) {
      cache.src = src;
      cache.set = unlockedSet;
      cache.out = placeItems(src, unlockedSet);
    }
    return cache.out;
  };

  const waitingGifts = gifts.filter(({ g }) => g.by !== meId && !g.opened && giftFresh(g, new Date()));

  // On the way in: what's waiting, what's on, what's new.
  useEffect(() => {
    if (!store?.loaded) return;
    const once = (id: string, text: string) => {
      if (ui.told.has(id)) return;
      ui.told.add(id);
      h.say(text);
    };
    if (waitingGifts.length) once('gifts', waitingGifts.length === 1 ? `${partnerName} left you something` : `${waitingGifts.length} things waiting for you`);
    else if (h.celebrate) {
      once('party', `${h.celebrate} 🎉`);
      h.sound?.play('pop', 0.6);
    } else if (game && turnOf(game) === meId) once('turn', `Your turn in ${GAME_LABEL[game.kind].toLowerCase()}, at the table`);
    else if (treasure && treasure.by !== meId) once('treasure', `${partnerName} hid a treasure for you. Look in the menu`);
  }, [store?.loaded, waitingGifts.length, h.celebrate, game?.at, treasure?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  const partnerHere = () => !!h.them.pose && h.them.shown;
  const dist2 = (x: number, z: number) => Math.hypot(x - h.me.pos.x, z - h.me.pos.z);
  const close = (x: number, y: number, z: number, r = NEAR) => dist2(x, z) < r && Math.abs(y - h.me.pos.y) < 1.6;
  const item = (key: string) => fresh().find((i) => i.key === key);
  const table = () => item('dining_table');

  // ------------------------------------------------------------------ games

  function startGame(kind: Game['kind']) {
    const at = new Date().toISOString();
    const s = kind === 'chess' ? newChess(meId, partnerId) : kind === 'ttt' ? newTicTacToe(meId, partnerId) : newLudo(meId, partnerId);
    set(GAME_KEY, { kind, s, at } as unknown as Record<string, unknown>);
    ui.sel = null;
    h.moment(`game:${at}`, `${GAME_LABEL[kind]}: you go first`, false);
    goToTable();
  }

  /** Sit at the table on my side and look at the board. */
  function goToTable() {
    const t = table();
    if (!t) return;
    ui.panel = null;
    const g = readGame(raw(GAME_KEY));
    const first = !g || playersOf(g)[0] === meId;
    const chair = first ? 'chair_1' : 'chair_3';
    const c = item(chair);
    if (c && dist2(c.x, c.z) < 1.4) {
      h.sit(chair);
      ui.board = true;
    } else if (c) h.walkTo(c.x + (first ? -0.5 : 0.5), c.y, c.z, chair);
    else ui.board = true;
  }

  function leaveBoard() {
    if (!ui.board) return;
    ui.board = false;
    ui.sel = null;
  }

  function after(g: Game, before: Game) {
    set(GAME_KEY, g as unknown as Record<string, unknown>);
    h.sound?.play('click', 0.6);
    const w = winnerOf(g);
    if (w) {
      h.moment(`won:${g.at}`, w === 'draw' ? 'A draw' : w === meId ? 'You won! 🏆' : `${partnerName} won`, true);
      h.wallet?.earn(w === 'draw' ? 'game' : 'game_win', walletRef('game', g.kind, g.at));
      return;
    }
    if (turnOf(before) === meId && turnOf(g) === partnerId && !partnerHere()) h.notify?.('turn');
  }

  /** A tap on the board: pick a piece, play it, or move a token. */
  function tapCell(f: number, r: number) {
    const g = readGame(raw(GAME_KEY));
    if (!g || turnOf(g) !== meId) return;
    if (g.kind === 'ttt') {
      const next = ticTacToeMove(g.s, meId, r * 3 + f);
      if (next) after({ ...g, s: next }, g);
      return;
    }
    if (g.kind === 'chess') {
      const sq = `${'abcdefgh'[f]}${r + 1}`;
      if (ui.sel && ui.sel !== sq) {
        const next = chessMove(g.s, meId, ui.sel, sq);
        if (next) {
          ui.sel = null;
          return after({ ...g, s: next }, g);
        }
      }
      const piece = chessBoard(g.s)[7 - r]?.[f];
      const mine = piece && (piece[0] === 'w') === (g.s.w === meId);
      ui.sel = mine && ui.sel !== sq ? sq : null;
      return;
    }
    // Ludo: the token on that square, or the only one that can go.
    const me = g.s.players[0] === meId ? 0 : 1;
    const movable = ludoMovable(g.s);
    const at = movable.find((t) => {
      const [cf, cr] = ludoCell(me, g.s.pos[me][t]!, t);
      return Math.abs(cf - f) < 0.7 && Math.abs(cr - r) < 0.7;
    });
    const pick = at ?? (movable.length === 1 ? movable[0] : undefined);
    if (pick === undefined) return;
    const next = ludoMove(g.s, meId, pick);
    if (next) after({ ...g, s: next }, g);
  }

  function roll() {
    const g = readGame(raw(GAME_KEY));
    if (!g || g.kind !== 'ludo') return;
    const next = ludoRoll(g.s, meId, 1 + Math.floor(Math.random() * 6));
    if (!next) return;
    h.sound?.play('dice', 0.7);
    ui.rolledAt = h.now();
    after({ ...g, s: next }, g);
  }

  // ------------------------------------------------------------- the panel

  const opt = (id: string, label: string, emoji?: string): FunOption => ({ id, label, emoji });

  function panel(): FunPanel | null {
    const p = ui.panel;
    if (ui.board && game) return boardPanel(game);
    if (ui.scope) {
      return {
        id: 'scope',
        title: 'The telescope',
        text: h.night ? STAR_FACTS[Math.floor(Date.now() / 86_400_000) % STAR_FACTS.length] : 'The stars come out after dark. Come back tonight.',
        options: [...(h.night ? [opt('wish', 'Make a wish', '🌠')] : []), opt('scope-off', 'Step back')],
        side: true,
      };
    }
    if (!p) return null;
    const next = h.pairedAt ? nextUnlock(h.pairedAt, new Date()) : null;
    switch (p) {
      case 'menu':
        return {
          id: p,
          title: 'Things to do together',
          text: next ? `Coming to the house: ${next.label.toLowerCase()} in ${next.inDays} ${next.inDays === 1 ? 'day' : 'days'}` : undefined,
          options: [
            opt('games', 'Play a game', '🎲'),
            opt('dates', 'A date', '🕯️'),
            opt('leave', `Leave something for ${partnerName}`, '🎁'),
            opt('mood', myMood ? `Feeling ${myMood.label.toLowerCase()}` : 'How I feel', myMood?.emoji ?? '😊'),
            opt('photos', 'Our photos', '🖼️'),
            ...(h.letters ? [opt('letter', 'Write a letter', '💌')] : []),
            ...(wishes.length ? [opt('wishes', 'Our wishes', '🌠')] : []),
          ],
        };
      case 'games':
        return {
          id: p,
          title: 'Play a game',
          text: game && !winnerOf(game) ? `${GAME_LABEL[game.kind]} is on. ${turnOf(game) === meId ? 'Your turn.' : `${partnerName}’s turn.`}` : undefined,
          options: [
            ...(game && !winnerOf(game) ? [opt('board', `Back to ${GAME_LABEL[game.kind].toLowerCase()}`, '↩️'), opt('end-game', 'End the game', '✖️')] : []),
            opt('chess', 'Chess', '♟️'),
            opt('ludo', 'Ludo', '🎲'),
            opt('ttt', 'Tic-tac-toe', '⭕'),
            opt('seek', `Hide and seek (you hide)`, '🙈'),
            opt('treasure', treasure?.by === meId ? 'Move your treasure here' : 'Hide a treasure here', '🗺️'),
            opt('ball', 'Throw the ball', '⚽'),
          ],
        };
      case 'dates': {
        const u = unlockedSet;
        const lock = (key: string, label: string) => {
          const n = h.pairedAt ? nextUnlockOf(h.pairedAt, key) : null;
          return n ? `${label} (in ${n} days)` : label;
        };
        return {
          id: p,
          title: 'A date',
          text: dateOn ? `${dateOn.kind === 'movie' ? 'Movie night' : 'A picnic'} is on.` : dinner && !dinner.done ? `Cooking ${RECIPES[dinner.recipe].label.toLowerCase()}: ${RECIPES[dinner.recipe].steps[dinner.step]}` : undefined,
          options: [
            opt('dinner', 'Cook a candle-lit dinner', '🍝'),
            opt('movie', 'Movie night', '🍿'),
            opt('picnic', 'A picnic here', '🧺'),
            opt('stars', u.has('telescope') ? 'Stargazing at the telescope' : 'Stargazing on the loungers', '🌌'),
            opt(u.has('fire_pit') ? 'fire' : 'locked', lock('fire_pit', 'A bonfire'), '🔥'),
            opt(u.has('hot_tub') ? 'tub' : 'locked', lock('hot_tub', 'The hot tub'), '♨️'),
            ...(dateOn ? [opt('end-date', 'End the date', '✖️')] : []),
          ],
        };
      }
      case 'recipes':
        return {
          id: p,
          title: 'What shall we cook?',
          text: `Take turns at the stove: one step each.${basket() ? ` You have ${basket()} from the garden.` : ''}`,
          options: (Object.keys(RECIPES) as Recipe[]).map((r) => opt(`cook:${r}`, RECIPES[r].label, r === 'pasta' ? '🍝' : r === 'curry' ? '🍛' : '🥗')),
        };
      case 'leave':
        return {
          id: p,
          title: `Leave something for ${partnerName}`,
          text: `${partnerName} finds it next time, with a little push.`,
          options: [opt('leave:flowers', `Flowers on the table (${PRICES['gift:flowers']} 🪙)`, '💐'), opt('leave:box', `A gift with a message (${PRICES['gift:box']} 🪙)`, '🎁'), opt('leave:lamp', 'Leave the lamp on', '💡'), opt('leave:heart', 'A heart on the door', '❤️')],
        };
      case 'gift-text':
      case 'lamp-text':
      case 'treasure-text':
        return {
          id: p,
          title: p === 'treasure-text' ? 'A treasure: what’s inside?' : p === 'lamp-text' ? 'A note by the lamp' : 'A gift: your message',
          options: [opt('back', 'Back')],
          input: { placeholder: p === 'treasure-text' ? 'The prize…' : 'Say something…', max: 280, send: p === 'treasure-text' ? 'Hide it' : 'Leave it' },
        };
      case 'mood':
        return { id: p, title: 'How do you feel?', text: `${partnerName} sees it over you today.`, options: [...MOODS.map((m) => opt(`mood:${m.key}`, m.label, m.emoji)), ...(myMood ? [opt('mood:', 'Clear it')] : [])] };
      case 'photos': {
        if (!h.photos.length) return { id: p, title: 'Our photos', text: 'Add photos to Memories and they show up here, on the TV and on the walls.', options: [opt('close', 'OK')] };
        const i = ((ui.photo % h.photos.length) + h.photos.length) % h.photos.length;
        return { id: p, title: 'Our photos', text: `${i + 1} of ${h.photos.length}`, image: h.photos[i]!.url, options: [opt('photo-prev', 'Back', '◀️'), opt('photo-next', 'Next', '▶️'), opt('close', 'Close')] };
      }
      case 'letter':
        return {
          id: p,
          title: `A letter for ${partnerName}`,
          text: 'Sealed until the day you pick, then it arrives in your chat.',
          options: [opt('back', 'Back')],
          input: { placeholder: `Dear ${partnerName}…`, max: 1000, send: 'Next' },
        };
      case 'letter-when':
        return { id: p, title: 'When should it arrive?', options: letterDates(h.pairedAt).map((d) => opt(`seal:${d.at.toISOString()}`, d.label, '📅')) };
      case 'mailbox':
        return {
          id: p,
          title: 'The mailbox',
          text: h.letters?.waiting
            ? `${h.letters.waiting === 1 ? 'A letter is' : `${h.letters.waiting} letters are`} sealed for you.${h.letters.nextAt ? ` The next opens ${new Date(h.letters.nextAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}.` : ''}`
            : `Nothing sealed for you yet. Write ${partnerName} one?`,
          options: [opt('letter', 'Write a letter', '💌'), opt('close', 'Close')],
        };
      case 'wish':
        return { id: p, title: 'Make a wish', text: 'It stays sealed for a year. Then you both see it.', options: [opt('back', 'Back')], input: { placeholder: 'I wish…', max: 280, send: 'Wish' } };
      case 'wishes': {
        const old = wishes.filter((w) => Date.now() - Date.parse(w.at) > 365 * 86_400_000);
        const first = wishes.map((w) => Date.parse(w.at)).sort((a, b) => a - b)[0];
        return {
          id: p,
          title: 'Our wishes',
          text: old.length
            ? old.map((w) => `“${w.text}” (${w.by === meId ? 'you' : partnerName}, ${new Date(w.at).getFullYear()})`).join('\n')
            : `${wishes.length} ${wishes.length === 1 ? 'wish' : 'wishes'}, sealed. The first opens ${first ? new Date(first + 365 * 86_400_000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'in a year'}.`,
          options: [opt('close', 'Close')],
        };
      }
      case 'wallet':
        return {
          id: p,
          title: `Our money: ${h.wallet?.balance ?? 0} 🪙`,
          text: h.wallet?.recent.length
            ? h.wallet.recent.slice(0, 12).map((l) => `${walletLineText(l)}${l.mine ? '' : ` (${partnerName})`}`).join('\n')
            : 'Earn coins by playing games, cooking together, the garden and coming home each day. Spend them in the village and on the house.',
          options: [opt('close', 'Close')],
        };
      case 'plant':
        return { id: p, title: 'What shall we plant?', text: 'Water it once a day and it grows. Vegetables go in the kitchen basket.', options: (Object.keys(CROPS) as Crop[]).map((c) => opt(`plant:${c}`, CROPS[c].label, CROPS[c].veg ? '🥕' : '🌷')) };
      default:
        if (p.startsWith('gift:')) {
          const g = gifts.find((x) => x.key === p)?.g;
          if (!g) return null;
          const from = g.by === meId ? 'You' : partnerName;
          return { id: p, title: `${GIFT_LABEL[g.kind]} from ${from}`, text: g.text || (g.kind === 'flowers' ? 'Just because 💐' : g.kind === 'heart' ? '❤️' : g.kind === 'lamp' ? 'Left on for you' : ''), options: [opt('thanks', 'Send a heart back', '❤️'), opt('close', 'Close')] };
        }
        if (p === 'treasure-open' && treasure) return { id: p, title: `You found ${partnerName}’s treasure!`, text: treasure.text || '✨', options: [opt('close', 'Yay')] };
        return null;
    }
  }

  function boardPanel(g: Game): FunPanel {
    const w = winnerOf(g);
    const turn = turnOf(g);
    let text = w ? (w === 'draw' ? 'A draw.' : w === meId ? 'You won!' : `${partnerName} won.`) : turn === meId ? 'Your turn.' : `${partnerName}’s turn.`;
    if (!w && g.kind === 'chess' && chessStatus(g.s).check) text = `Check! ${text}`;
    if (!w && g.kind === 'chess' && turn === meId) text += ui.sel ? ' Tap where it goes.' : ' Tap a piece.';
    if (!w && g.kind === 'ludo' && turn === meId) text += g.s.dice === null ? ' Roll the dice.' : ` You rolled ${g.s.dice}. Tap a token.`;
    if (!w && g.kind === 'ludo' && turn !== meId && g.s.dice !== null) text += ` They rolled ${g.s.dice}.`;
    if (!w && g.kind === 'ttt' && turn === meId) text += ' Tap a square.';
    const mine = playersOf(g)[0] === meId ? 0 : 1;
    if (g.kind === 'chess') text += ` You’re ${mine === 0 ? 'white' : 'black'}.`;
    if (g.kind === 'ludo') text += ` You’re ${mine === 0 ? 'red' : 'blue'}.`;
    return {
      id: 'board',
      title: GAME_LABEL[g.kind],
      text,
      side: true,
      options: [
        ...(g.kind === 'ludo' && turn === meId && g.s.dice === null && !w ? [opt('roll', 'Roll', '🎲')] : []),
        ...(w ? [opt(g.kind, 'Play again', '🔁')] : []),
        opt('leave-board', 'Leave the table', '🚪'),
        ...(!w ? [opt('end-game', 'End the game', '✖️')] : []),
      ],
    };
  }

  function basket() {
    const n = raw(BASKET_KEY)?.n;
    return num(n) ? n : 0;
  }

  // ------------------------------------------------------------ the picks

  function pick(id: string, text?: string) {
    const t = text?.trim() ?? '';
    const shut = () => void (ui.panel = null);
    if (id === 'close') return shut();
    if (id === 'back') return void (ui.panel = ui.panel === 'wish' && ui.scope ? null : 'menu');
    if (['games', 'dates', 'leave', 'mood', 'photos', 'letter', 'wishes', 'wallet'].includes(id)) {
      if (id === 'photos') ui.photo = 0;
      return void (ui.panel = id);
    }
    if (id === 'photo-next' || id === 'photo-prev') return void (ui.photo += id === 'photo-next' ? 1 : -1);
    if (id === 'chess' || id === 'ludo' || id === 'ttt') return startGame(id);
    if (id === 'board') return goToTable();
    if (id === 'leave-board') return leaveBoard();
    if (id === 'end-game') {
      set(GAME_KEY, null);
      leaveBoard();
      return shut();
    }
    if (id === 'roll') return roll();
    if (id === 'seek') {
      shut();
      if (!partnerHere()) return h.say(`Hide and seek needs ${partnerName} here`);
      set(SEEK_KEY, { hider: meId, seeker: partnerId, at: new Date().toISOString() });
      return h.say(`Hide! ${partnerName} counts to ${HIDE_S}`);
    }
    if (id === 'treasure') return void (ui.panel = 'treasure-text');
    if (id === 'ball') {
      shut();
      const b = item('ball');
      if (b) h.walkTo(b.x, b.y, b.z, 'ball');
      return h.say(`Pick up the ball, then throw it to ${partnerName}`);
    }
    if (id === 'dinner') return void (ui.panel = 'recipes');
    if (id.startsWith('cook:')) {
      const recipe = id.slice(5) as Recipe;
      set(DINNER_KEY, { recipe, step: 0, first: meId, second: partnerHere() ? partnerId : meId, at: new Date().toISOString() });
      shut();
      const stove = item('counter');
      if (stove) h.walkTo(stove.x - 0.8, stove.y, stove.z);
      return h.say(`${RECIPES[recipe].label}: first, ${RECIPES[recipe].steps[0]!.toLowerCase()}`);
    }
    if (id === 'movie') {
      set(DATE_KEY, { kind: 'movie', at: new Date().toISOString() });
      const tv = item('tv');
      if (tv && !isOn(tv)) set('tv', { ...(raw('tv') ?? {}), on: true });
      for (const k of ['pendant', 'floor_lamp']) set(k, { ...(raw(k) ?? {}), on: false });
      shut();
      h.walkTo(-1.55, 0, 0.5, 'sofa');
      return h.moment(`movie-on:${Date.now()}`, 'Movie night: popcorn’s on the table', false);
    }
    if (id === 'picnic') {
      shut();
      if (!h.me.at.startsWith('garden') && !h.me.at.startsWith('park')) return h.say('Go out into the garden or the park for a picnic');
      set('picnic', { x: h.me.pos.x, z: h.me.pos.z, ry: h.me.heading });
      set(DATE_KEY, { kind: 'picnic', at: new Date().toISOString() });
      return h.moment(`picnic:${Date.now()}`, 'A picnic for two 🧺', false);
    }
    if (id === 'end-date') {
      set(DATE_KEY, null);
      return shut();
    }
    if (id === 'stars') {
      shut();
      const scope = item('telescope');
      if (scope) return h.walkTo(scope.x + 0.6, scope.y, scope.z - 0.3, 'telescope');
      const l = item('lounger_1');
      if (l) h.walkTo(l.x, l.y, l.z - 1.2, 'lounger_1');
      return h.say(h.night ? 'Lie back and look up' : 'The stars come out after dark');
    }
    if (id === 'fire') {
      shut();
      const f = item('fire_pit');
      if (f) h.walkTo(f.x, f.y, f.z + 1.0, 'fire_pit');
      return;
    }
    if (id === 'tub') {
      shut();
      const tub = item('hot_tub');
      if (tub) h.walkTo(tub.x - 1.3, tub.y, tub.z, 'hot_tub');
      return;
    }
    if (id === 'locked') return h.say('Not yet: it comes as your days together add up');
    if (id.startsWith('leave:')) {
      const kind = id.slice(6) as GiftKind;
      if (kind === 'box') return void (ui.panel = 'gift-text');
      if (kind === 'lamp') return void (ui.panel = 'lamp-text');
      leaveGift(kind, '');
      return shut();
    }
    if (ui.panel === 'gift-text' && id === 'send') {
      leaveGift('box', t);
      return shut();
    }
    if (ui.panel === 'lamp-text' && id === 'send') {
      leaveGift('lamp', t);
      return shut();
    }
    if (ui.panel === 'treasure-text' && id === 'send') {
      set(TREASURE_KEY, { by: meId, x: h.me.pos.x, y: h.me.pos.y, z: h.me.pos.z, text: t.slice(0, 280), at: new Date().toISOString() });
      if (!partnerHere()) h.notify?.('gift');
      h.say(`Hidden. ${partnerName} gets “warmer” and “colder” to find it`);
      return shut();
    }
    if (id.startsWith('mood:')) {
      const k = id.slice(5);
      set(moodKey(meId), k ? { k, day: today() } : null);
      return shut();
    }
    if (ui.panel === 'letter' && id === 'send') {
      if (!t) return;
      ui.draft = t;
      return void (ui.panel = 'letter-when');
    }
    if (id.startsWith('seal:')) {
      const at = new Date(id.slice(5));
      const letters = h.letters;
      shut();
      if (!letters || !ui.draft) return;
      const text0 = ui.draft;
      ui.draft = '';
      void letters
        .seal(text0, at)
        .then(() => {
          h.say(`Sealed. It arrives ${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`);
          h.notify?.('letter');
        })
        .catch((e: Error) => h.say(e.message || 'Couldn’t seal the letter'));
      return;
    }
    if (id === 'wish') return void (ui.panel = 'wish');
    if (ui.panel === 'wish' && id === 'send') {
      if (t) set(`wish:${randomId()}`, { by: meId, text: t.slice(0, 280), at: new Date().toISOString() });
      h.moment(`wish:${Date.now()}`, 'Wished on a star 🌠', false);
      return shut();
    }
    if (id === 'scope-off') return void (ui.scope = false);
    if (id.startsWith('plant:')) {
      const bed = ui.draft;
      shut();
      if (bed) set(bed, { ...(raw(bed) ?? {}), crop: id.slice(6), days: [], watered: undefined });
      return h.say(`Planted ${CROPS[id.slice(6) as Crop].label.toLowerCase()}. Water them once a day`);
    }
    if (id === 'thanks') {
      h.emote('heart');
      return shut();
    }
  }

  function leaveGift(kind: GiftKind, text: string) {
    // Keep it tidy: opened or wilted ones of mine go.
    for (const { key, g } of gifts) if (g.by === meId && (g.opened || !giftFresh(g, new Date()))) set(key, null);
    if (gifts.filter(({ g }) => g.by === meId && !g.opened).length >= 6) return h.say('That’s a lot of gifts already');
    const id = randomId();
    const price = kind === 'flowers' ? 'gift:flowers' : kind === 'box' ? 'gift:box' : null;
    if (price && h.wallet) {
      void h.wallet.spend(price, walletRef('gift', id)).then((ok) => (ok ? leaveGiftNow(kind, text, id) : h.say(`Not enough coins (${PRICES[price]} 🪙)`)));
      return;
    }
    leaveGiftNow(kind, text, id);
  }

  function leaveGiftNow(kind: GiftKind, text: string, id: string) {
    set(`gift:${id}`, { kind, by: meId, at: new Date().toISOString(), ...(text ? { text: text.slice(0, 280) } : {}) });
    if (kind === 'lamp') set('floor_lamp', { ...(raw('floor_lamp') ?? {}), on: true });
    h.sound?.play('chime', 0.4);
    h.say(`Left for ${partnerName}`);
    if (!partnerHere()) h.notify?.('gift');
  }

  // --------------------------------------------------------- gift places

  /** Where a gift shows: flowers on the table, the box by the door inside, the heart on the door outside, the note by the lamp. */
  function giftSpot(kind: GiftKind, i: number): [number, number, number] {
    const t = table();
    if (kind === 'flowers' && t) return [t.x + 0.35 - i * 0.15, t.y + (t.top ?? 0.78), t.z + 0.45];
    if (kind === 'heart') return [-3.6 + i * 0.25, 1.75, 4.1];
    if (kind === 'lamp') {
      const l = item('floor_lamp');
      return l ? [l.x + 0.3, l.y, l.z + 0.2 + i * 0.15] : [-0.3, 0, -3];
    }
    return [-3.2 + i * 0.35, 0, 3.2];
  }

  const giftPlaces = gifts
    .filter(({ g }) => giftFresh(g, new Date()) && (!g.opened || Date.now() - Date.parse(g.at) < 6 * 3600_000))
    .map(({ key, g }, _, all) => ({ key, g, at: giftSpot(g.kind, all.filter((x) => x.g.kind === g.kind).findIndex((x) => x.key === key)) }));

  // ------------------------------------------------------------ the action

  /** What the action button does here, if it's one of ours. */
  function focus(): { label: string; run: () => void } | null {
    if (ui.board || ui.scope) return null;
    const game = readGame(raw(GAME_KEY));
    const treasure = readTreasure();
    const dinner = readDinner();
    const me = h.me;
    const now = Date.now();
    const p = h.them.pose;

    // The ball coming my way: catch it.
    const th = readThrow(raw(THROW_KEY));
    if (th && th.by !== meId && !th.caught) {
      const t = (now - th.at) / 1000;
      const land = ballLands(th);
      const [lx, , lz] = ballAt(th, land);
      if (t > land - 0.9 && t < land + 0.25 && dist2(lx, lz) < 2.2) return { label: 'Catch!', run: () => catchBall(th) };
    }
    if (me.hold?.key === 'ball' && p && h.them.shown) {
      const d = Math.hypot(p.x - me.pos.x, p.z - me.pos.z);
      if (d > 1.5 && d < 14 && Math.abs(p.y - me.pos.y) < 1) return { label: `Throw to ${partnerName}`, run: () => throwBall(p) };
    }
    if (me.hold && me.hold.key !== 'watering_can') return null;

    // Playing at the table.
    if (game && me.seat?.key.startsWith('chair_')) return { label: `Play ${GAME_LABEL[game.kind].toLowerCase()}`, run: () => void (ui.board = true) };
    if (me.seat) return null;
    const t = table();
    if (game && t && close(t.x, t.y, t.z, 1.9)) return { label: `Play ${GAME_LABEL[game.kind].toLowerCase()}`, run: goToTable };

    for (const { key, g, at } of giftPlaces) {
      if (g.by === meId || g.opened || !close(at[0], at[1] > 1 ? me.pos.y : at[1], at[2], g.kind === 'heart' ? 1.6 : NEAR)) continue;
      const label = g.kind === 'flowers' ? `Flowers from ${partnerName}` : g.kind === 'heart' ? 'A heart on the door' : g.kind === 'lamp' ? 'A note by the lamp' : `Open ${partnerName}’s gift`;
      return {
        label,
        run: () => {
          set(key, { ...(raw(key) ?? {}), opened: true });
          h.sound?.play('pop', 0.5);
          ui.panel = key;
        },
      };
    }
    if (treasure && treasure.by !== meId && close(treasure.x, treasure.y, treasure.z, 1.1))
      return {
        label: 'Open the treasure',
        run: () => {
          ui.panel = 'treasure-open';
          h.sound?.play('pop', 0.6);
          h.moment(`found:${treasure.at}`, 'Treasure found!');
          h.wallet?.earn('treasure', walletRef('treasure', treasure.at));
          setTimeout(() => set(TREASURE_KEY, null), 30_000);
        },
      };

    // Dinner at the stove, a step at a time.
    if (dinner && !dinner.done) {
      const stove = item('counter');
      if (stove && dist2(stove.x, stove.z) < 1.8 && Math.abs(stove.y - me.pos.y) < 1) {
        const who = dinnerWho(dinner);
        const mine = who === meId || !partnerHere();
        if (mine && !me.doing) {
          const step = RECIPES[dinner.recipe].steps[dinner.step]!;
          return {
            label: step,
            run: () => {
              me.heading = stove.ry + Math.PI;
              me.doing = { act: 'cook', until: h.now() + 3, key: 'dinner' };
            },
          };
        }
      }
    }

    // The temple: ring the bell at the hall's door; light a diya (one each, each world day).
    if (me.at === 'templeHall' || me.at === 'templeCourt') {
      if (close(TEMPLE.bell.x, 0, TEMPLE.bell.z, 1.3)) return { label: 'Ring the bell', run: ringBell };
      if (close(TEMPLE.diyas.x, 0, TEMPLE.diyas.z, 1.4) && !litBy(meId)) {
        return {
          label: 'Light a diya',
          run: () => {
            const d = diyas();
            set(DIYAS_KEY, { day: worldDay(), by: [...d.by, meId] } as unknown as Record<string, unknown>);
            h.sound?.play('chime', 0.3);
            h.moment(`diya:${worldDay()}:${meId}`, partnerHere() && litBy(partnerId) ? 'Two diyas, side by side 🪔' : 'A diya, lit 🪔', false);
          },
        };
      }
    }

    for (const shop of SHOPS) {
      const keeper = VILLAGERS.find((v) => v.id === shop.keeper);
      if (!keeper || !close(shop.x, 0, shop.z, 1.8) || !villagerAt(keeper, Date.now(), h.coupleId)) continue;
      return {
        label: `${shop.label} (${PRICES[shop.item]} 🪙)`,
        run: () => {
          if (!h.wallet) return;
          void h.wallet.spend(shop.item, walletRef(shop.item, meId, Date.now())).then((ok) => {
            if (!ok) return h.say(`Not enough coins (${PRICES[shop.item]} 🪙)`);
            h.sound?.play('chime', 0.4);
            h.moment(`buy:${shop.item}:${Date.now()}`, shop.done, partnerHere());
          });
        },
      };
    }

    for (const it of fresh()) {
      if (it.kind !== 'fun' || !close(it.x, it.y, it.z, Math.max(it.hw, it.hd) + 1.0)) continue;
      const f = actOn(it);
      if (f) return f;
    }
    return null;
  }

  /** The thing-to-do things: the beds, the mailbox, the telescope. */
  function actOn(it: PlacedItem): { label: string; run: () => void } | null {
    if (it.model === 'mailbox') return { label: 'Open the mailbox', run: () => void (ui.panel = 'mailbox') };
    if (it.model === 'telescope') return { label: 'Look through the telescope', run: () => void (ui.scope = true) };
    if (it.model === 'gardenBed') {
      const crop = it.state.crop as Crop | undefined;
      if (!crop || !CROPS[crop]) {
        if (h.me.hold) return null;
        return { label: 'Plant something', run: () => ((ui.draft = it.key), (ui.panel = 'plant')) };
      }
      const bed = { crop, days: it.state.days ?? [] };
      if (bedReady(bed)) {
        if (h.me.hold) return null;
        return {
          label: `Pick the ${CROPS[crop].label.toLowerCase()}`,
          run: () => {
            set(it.key, null);
            if (CROPS[crop].veg) set(BASKET_KEY, { n: basket() + 1 });
            h.wallet?.earn('harvest', walletRef('harvest', it.key, today()));
            h.moment(`pick:${it.key}:${Date.now()}`, CROPS[crop].veg ? `${CROPS[crop].label} for the kitchen` : `${CROPS[crop].label} for the vase`);
          },
        };
      }
      if (h.me.hold?.key === 'watering_can' && it.state.watered !== today())
        return {
          label: `Water the ${CROPS[crop].label.toLowerCase()}`,
          run: () => {
            h.me.doing = { act: 'water', until: h.now() + 2.5 };
            const next = waterBed(bed, today());
            set(it.key, { ...(raw(it.key) ?? {}), days: next.days, watered: today() });
            if (bedReady(next)) h.say(`The ${CROPS[crop].label.toLowerCase()} are ready to pick`);
          },
        };
    }
    return null;
  }

  /** The world's use(item) for kind 'fun', after a tapped walk. */
  function use(it: PlacedItem) {
    actOn(it)?.run();
  }

  // ------------------------------------------------------------- the ball

  function readThrow(v: Record<string, unknown> | null): (Throw & { n: number; caught?: string }) | null {
    if (!v || !isStr(v.by) || ![v.x, v.y, v.z, v.vx, v.vy, v.vz, v.at].every(num)) return null;
    return { ...(v as unknown as Throw & { caught?: string }), n: num(v.n) ? v.n : 0 };
  }

  function throwBall(p: Pose) {
    const prev = readThrow(raw(THROW_KEY));
    const from: [number, number, number] = [h.me.pos.x + Math.sin(h.me.heading) * 0.3, h.me.pos.y + 1.4, h.me.pos.z + Math.cos(h.me.heading) * 0.3];
    // Lead them a little if they're walking.
    const lead = p.m === 1 ? 0.6 : 0;
    const t = throwTo(meId, from, [p.x + Math.sin(p.h) * lead, p.z + Math.cos(p.h) * lead], Date.now());
    h.me.heading = Math.atan2(p.x - h.me.pos.x, p.z - h.me.pos.z);
    h.me.hold = null;
    const n = prev && prev.caught === meId ? prev.n : 0;
    set(THROW_KEY, { ...t, n } as unknown as Record<string, unknown>);
    h.sound?.play('swish', 0.6);
  }

  function catchBall(th: Throw & { n: number }) {
    h.me.hold = { key: 'ball', since: Date.now() };
    const n = th.n + 1;
    set(THROW_KEY, { ...th, caught: meId, n } as unknown as Record<string, unknown>);
    h.sound?.play('catch', 0.8);
    if (n >= 3) {
      h.moment(`catch:${n}`, `${n} catches in a row!`, n % 5 === 0);
      h.wallet?.earn('catch', walletRef('catch', th.at));
    }
    else h.say('Caught it!');
  }

  /** Where the ball is while it flies; the thrower puts it down where it lands if nobody caught it. */
  function place(key: string, o: THREE.Object3D): boolean {
    // A game on the table: the flowers step aside to the corner.
    if (key === 'vase') {
      const t = game && table();
      const v = t && item('vase');
      if (!t || !v || Math.hypot(v.x - t.x, v.z - t.z) > 0.45 || Math.abs(v.y - t.y - (t.top ?? 0.78)) > 0.1) return false;
      o.position.set(t.x + 0.48, v.y, t.z + 0.62);
      return true;
    }
    if (key !== 'ball') return false;
    const th = readThrow(raw(THROW_KEY));
    if (!th || th.caught) return false;
    const t = (Date.now() - th.at) / 1000;
    const land = ballLands(th);
    if (t > land + 1.5) {
      if (th.by === meId && ui.lastBall !== String(th.at)) {
        ui.lastBall = String(th.at);
        let [x, , z] = ballAt(th, land);
        const r = regionAt(x, 0.1, z);
        if (r?.id === 'pool') {
          h.sound?.play('splash', 0.5);
          z = POOL.z0 - 0.3;
          x = Math.min(Math.max(x, POOL.x0), POOL.x1);
        }
        const inside = regionAt(x, 0.1, z) ?? regionAt(x, FLOOR_H + 0.1, z);
        if (!inside) [x, z] = [h.me.pos.x, h.me.pos.z];
        const y = restingY(fresh(), x, inside?.floor === 1 ? FLOOR_H : 0, z, 'ball');
        set('ball', { ...(raw('ball') ?? {}), x, y, z });
        set(THROW_KEY, null);
      }
      return false;
    }
    const [x, y, z] = ballAt(th, Math.max(0, t));
    o.position.set(x, y - 0.15, z);
    o.rotation.x += 0.2;
    return true;
  }

  // ---------------------------------------------------------- the temple

  const worldDay = () => Math.floor((Date.now() + (worldHours(0, h.coupleId) / 24) * WORLD_DAY_MS) / WORLD_DAY_MS);
  /** Who has lit a diya today (the world's day). */
  const diyas = (): { day: number; by: string[] } => {
    const v = raw(DIYAS_KEY);
    return v && v.day === worldDay() && Array.isArray(v.by) ? { day: v.day as number, by: (v.by as unknown[]).filter(isStr).slice(0, 4) } : { day: worldDay(), by: [] };
  };
  const litBy = (id: string) => diyas().by.includes(id);

  function ringBell() {
    h.sound?.play('bell', 0.8);
    bellSwing.current = 1;
    // My partner hears it too (softer the further they are): the ring goes through the store.
    set(BELL_KEY, { at: new Date().toISOString(), by: meId });
  }
  // Their ring: play it, from where the bell is.
  const theirRing = raw(BELL_KEY);
  useEffect(() => {
    if (!theirRing || theirRing.by === meId || !isStr(theirRing.at) || Date.now() - Date.parse(theirRing.at) > 5000) return;
    const d = Math.hypot(TEMPLE.bell.x - h.me.pos.x, TEMPLE.bell.z - h.me.pos.z);
    h.sound?.play('bell', 0.8 / (1 + d / 4));
    bellSwing.current = 1;
  }, [theirRing?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The evening aarti: at world dusk, for a world hour. */
  const aartiNow = () => {
    const hr = worldHours(Date.now(), h.coupleId);
    return hr >= 18.4 && hr < 19.4;
  };

  /** The ball's in the air: nobody can pick it up from where it lay. */
  function flying(key: string): boolean {
    if (key !== 'ball') return false;
    const th = readThrow(raw(THROW_KEY));
    return !!th && !th.caught && Date.now() - th.at < (ballLands(th) + 1.5) * 1000;
  }

  // ------------------------------------------------------------- each frame

  const hud = useRef<{ banner: string | null; cover: string | null }>({ banner: null, cover: null }).current;

  function frame(dt: number) {
    const now = new Date();
    const game = readGame(raw(GAME_KEY));
    const seek = readSeek();
    const treasure = readTreasure();
    const dinner = readDinner();
    hud.banner = null;
    hud.cover = null;
    const p = h.them.pose;

    // Hide and seek.
    if (seek) {
      const phase = seekPhase(seek, now);
      const left = Math.max(0, Math.ceil((Date.parse(seek.at) + (phase === 'hide' ? HIDE_S : HIDE_S + SEEK_S) * 1000 - now.getTime()) / 1000));
      if (phase === 'done') {
        if (Date.now() - Date.parse(seek.at) < (HIDE_S + SEEK_S + 8) * 1000 || seek.found) {
          hud.banner = seek.found ? (seek.seeker === meId ? 'Found them! 🎉' : `${partnerName} found you!`) : seek.hider === meId ? 'You win: never found! 🏆' : `${partnerName} wins this time`;
        }
        if (seek.seeker === meId && Date.now() - Date.parse(seek.at) > (HIDE_S + SEEK_S + 10) * 1000) set(SEEK_KEY, null);
      } else if (seek.seeker === meId) {
        if (phase === 'hide') hud.cover = `Counting… ${left}\n${partnerName} is hiding`;
        else if (p) {
          const d = Math.hypot(p.x - h.me.pos.x, p.z - h.me.pos.z) + Math.abs(p.y - h.me.pos.y) * 2;
          hud.banner = `${warmth(d)} · ${left}s`;
          if (d < 1.3 && !ui.told.has(`found:${seek.at}`)) {
            ui.told.add(`found:${seek.at}`);
            set(SEEK_KEY, { ...seek, found: true } as unknown as Record<string, unknown>);
            h.moment(`seek:${seek.at}`, 'Found you!');
            setTimeout(() => set(SEEK_KEY, null), 6000);
          }
        } else hud.banner = `${partnerName} left the house`;
      } else hud.banner = phase === 'hide' ? `Hide! ${left}s` : `${partnerName} is looking… ${left}s`;
    }

    // The treasure: warmer, colder.
    if (!hud.banner && treasure && treasure.by !== meId && !ui.panel) {
      const d = Math.hypot(treasure.x - h.me.pos.x, treasure.z - h.me.pos.z) + Math.abs(treasure.y - h.me.pos.y) * 2;
      if (d < 25) hud.banner = `Treasure: ${warmth(d)}`;
    }

    // Dinner: whose step.
    if (!hud.banner && dinner && !dinner.done) {
      const who = dinnerWho(dinner);
      const step = RECIPES[dinner.recipe].steps[dinner.step];
      if (step) hud.banner = who === meId || !partnerHere() ? `Your turn at the stove: ${step.toLowerCase()}` : `${partnerName}’s turn: ${step.toLowerCase()}`;
    }

    // A ball in the air.
    const th = readThrow(raw(THROW_KEY));
    if (!hud.banner && th && th.caught && th.n >= 2 && Date.now() - th.at < 6000) hud.banner = `${th.n} catches in a row`;

    // Ludo: when only one token can move, it goes by itself.
    if (game?.kind === 'ludo' && turnOf(game) === meId && game.s.dice !== null && h.now() - ui.rolledAt > 0.9) {
      const movable = ludoMovable(game.s);
      if (movable.length === 1) {
        const next = ludoMove(game.s, meId, movable[0]!);
        if (next) after({ ...game, s: next }, game);
      }
    }

    // A mood shows a little: every half minute or so.
    if (myMood && h.now() - ui.moodAt > 28) {
      ui.moodAt = h.now();
      if (myMood.key === 'excited' || myMood.key === 'happy') h.emote('dance');
      else if (myMood.key === 'missing' || myMood.key === 'cosy') h.emote('heart');
    }

    // Close together somewhere cosy: hearts.
    const a = p?.a;
    const mine = h.me.seat;
    if (mine && a && a.split(':')[1] === mine.key && ['sofa', 'swing', 'hot_tub', 'picnic', 'log_bench', 'bed'].includes(mine.key)) {
      const names: Record<string, string> = { sofa: 'Cosy on the sofa', swing: 'On the swing together', hot_tub: 'Hot tub together', picnic: 'A picnic together', log_bench: 'By the fire together', bed: 'Lying together' };
      h.moment(`cosy:${mine.key}:${Math.floor(h.now() / 120)}`, names[mine.key]!);
    }

    // The aarti: the tune, a conch to begin, a line across the top, while we're at the temple.
    const atTemple = h.me.at === 'templeHall' || h.me.at === 'templeCourt' || h.me.at === 'templePath';
    const aarti = atTemple && aartiNow();
    if (aarti && !ui.told.has(`aarti:${worldDay()}`)) {
      ui.told.add(`aarti:${worldDay()}`);
      h.sound?.play('conch', 0.7);
      h.say('The evening aarti 🪔');
    }
    if (aarti && !hud.banner) hud.banner = 'Evening aarti 🪔';
    h.sound?.loop('aarti', aarti ? 0.45 : 0);

    // Sounds: the fire crackling and the hot tub bubbling, close by.
    if (h.sound) {
      const fire = item('fire_pit');
      h.sound.loop('fire', fire && isOn(fire) ? 0.5 / (1 + dist2(fire.x, fire.z) / 2) : 0);
      const tub = item('hot_tub');
      h.sound.loop('bubbles', tub ? 0.35 / (1 + dist2(tub.x, tub.z) / 1.5) : 0);
    }
    void dt;
  }

  /** Dinner: the step I just cooked (my step, or any while I cook alone). */
  function cooked() {
    const d = readDinner();
    if (!d || d.done) return;
    const who = dinnerWho(d);
    if (who !== meId && partnerHere()) return;
    const next = dinnerStep(d, who);
    if (!next) return;
    if (dinnerDone(next)) {
      set(DINNER_KEY, { ...next, done: true, at: new Date().toISOString() } as unknown as Record<string, unknown>);
      set(DISH_KEY, { on: true });
      if (!raw(MUSIC_KEY)?.on) set(MUSIC_KEY, { on: true, at: new Date().toISOString() });
      set('pendant', { ...(raw('pendant') ?? {}), on: false });
      if (basket()) set(BASKET_KEY, { n: basket() - 1 });
      h.moment(`dinner:${d.at}`, `${RECIPES[d.recipe].label} by candlelight 🕯️`);
      h.wallet?.earn('dinner', walletRef('dinner', d.at));
    } else {
      set(DINNER_KEY, { ...next } as unknown as Record<string, unknown>);
      h.say(partnerHere() ? `${partnerName}’s turn: ${RECIPES[d.recipe].steps[next.step]!.toLowerCase()}` : `Next: ${RECIPES[d.recipe].steps[next.step]!.toLowerCase()}`);
    }
  }

  // ------------------------------------------------------------ taps, camera

  const tmpV = useMemo(() => new THREE.Vector3(), []);

  /** A tap while at the board: which cell. True when it was ours. */
  function tap(ray: THREE.Raycaster): boolean {
    if (!ui.board || !game || !boardPlane.current || !boardGroup.current) return false;
    const hit = ray.intersectObject(boardPlane.current, false)[0];
    if (!hit) return true;
    const local = boardGroup.current.worldToLocal(tmpV.copy(hit.point));
    const { n, s } = boardSize(game);
    const r = Math.round(local.x / s + (n - 1) / 2);
    const f = Math.round(local.z / s + (n - 1) / 2);
    if (game.kind === 'ludo') tapCell(local.z / s + (n - 1) / 2, local.x / s + (n - 1) / 2);
    else if (r >= 0 && r < n && f >= 0 && f < n) tapCell(f, r);
    return true;
  }

  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const camPos = useMemo(() => new THREE.Vector3(), []);

  /** Playing at the table or at the telescope, the camera's ours: true when it is. */
  function camera(cam: THREE.Camera, dt: number): boolean {
    if (ui.board && game && boardGroup.current) {
      const first = playersOf(game)[0] === meId;
      const g = boardGroup.current;
      g.updateWorldMatrix(true, false);
      g.localToWorld(camPos.set(first ? -0.42 : 0.42, 0.72, 0));
      g.localToWorld(camTarget.set(first ? -0.04 : 0.04, 0, 0));
      cam.position.lerp(camPos, Math.min(1, dt * 6));
      cam.lookAt(camTarget);
      return true;
    }
    if (ui.scope) {
      const s = item('telescope');
      if (!s) return (ui.scope = false);
      camPos.set(s.x, s.y + 1.25, s.z);
      cam.position.lerp(camPos, Math.min(1, dt * 4));
      cam.lookAt(camTarget.set(s.x + DIPPER_DIR.x * 40, s.y + 1.25 + DIPPER_DIR.y * 40, s.z + DIPPER_DIR.z * 40));
      return true;
    }
    return false;
  }

  /** The joystick moved: back on my feet. */
  function moved() {
    leaveBoard();
    ui.scope = false;
  }

  function cmd(c: FunCmd) {
    if (c.t === 'fun') ui.panel = ui.panel ? null : 'menu';
    else if (c.t === 'closePanel') {
      ui.panel = null;
      ui.scope = false;
      leaveBoard();
    } else pick(c.id, c.text);
  }

  function hudState(): FunHud {
    return { panel: panel(), banner: hud.banner, cover: hud.cover, myMood: myMood ? `${myMood.emoji} ${myMood.label}` : null, partnerMood: theirMood ? `${theirMood.emoji} ${theirMood.label}` : null };
  }

  // -------------------------------------------------------------- drawing

  const t = table();
  const scene: ReactNode = (
    <>
      {game && t ? (
        <group ref={boardGroup} position={[t.x, t.y + (t.top ?? 0.78) + BOARD_LIFT, t.z]} rotation={[0, t.ry, 0]}>
          <BoardView game={game} meId={meId} sel={ui.sel} planeRef={boardPlane} />
        </group>
      ) : null}
      {giftPlaces.map(({ key, g, at }) => (
        <group key={key} position={at} rotation={[0, g.kind === 'heart' ? 0 : 0.4, 0]}>
          <GiftView kind={g.kind} />
          {g.by !== meId && !g.opened ? <Sparkle y={g.kind === 'heart' ? 0.3 : 0.55} /> : null}
        </group>
      ))}
      {treasure && !(treasure.by !== meId && ui.panel === 'treasure-open') ? (
        <group position={[treasure.x, treasure.y, treasure.z]}>
          <Chest />
          {treasure.by !== meId ? <Sparkle y={0.6} /> : null}
        </group>
      ) : null}
      <MoodOrb who={h.me.pos} colourOf={myMood?.ring} hidden={false} />
      <MoodOrb who={h.them.pos} colourOf={theirMood?.ring} hidden={!h.them.shown} />
      {h.night ? <NightSky /> : null}
      <TempleThings lit={diyas().by.length} swing={bellSwing} aarti={aartiNow} barefoot={[h.me.at === 'templeHall', h.them.pose?.b === 1]} />
    </>
  );

  return { focus, flying, frame, tap, camera, moved, cmd, hud: hudState, place, use, cooked, fresh, scene, playing: () => ui.board || ui.scope };
}

export type Fun = ReturnType<typeof useFun>;

/**
 * What the house has now: what our days together have unlocked, and what
 * today's dates put out (the picnic blanket, the candles, the party).
 */
export function useUnlocked(store: HouseStore | null, pairedAt: string | undefined, celebrate: string | null | undefined, minute: number): ReadonlySet<string> {
  const date = store?.get(DATE_KEY);
  const dinner = store?.get(DINNER_KEY);
  const recent = (at: unknown) => isStr(at) && minute - Date.parse(at) < DATE_H * 3600_000;
  const dateKind = date && recent(date.at) && (date.kind === 'movie' || date.kind === 'picnic') ? date.kind : null;
  const candles = !!dinner?.done && recent(dinner.at);
  const days = pairedAt ? Math.floor((minute - Date.parse(pairedAt)) / 86_400_000) : -1;
  return useMemo(() => {
    const s = new Set<string>(pairedAt ? unlockedBy(pairedAt, new Date(minute)) : []);
    if (dateKind) s.add(dateKind);
    if (candles) s.add('candles');
    if (celebrate) s.add('party');
    return s;
  }, [pairedAt, days, dateKind, candles, celebrate]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The mailbox's flag is up while a letter's waiting for me. */
export function withMailbox(items: PlacedItem[], up: boolean): PlacedItem[] {
  return items.map((i) => (i.key === 'mailbox' && !!i.state.on !== up ? { ...i, state: { ...i.state, on: up } } : i));
}

/** The store's keys that start so. */
function listKeys(store: HouseStore, prefix: string): string[] {
  return store.keys().filter((k) => k.startsWith(prefix));
}

function nextUnlockOf(pairedAt: string, key: string): number | null {
  const days = { fire_pit: 7, garden_beds: 14, hot_tub: 30, telescope: 100, fairy_lights: 182, swing: 365 }[key];
  if (days === undefined) return null;
  const d = Math.floor((Date.now() - Date.parse(pairedAt)) / 86_400_000);
  return d >= days ? null : days - d;
}

/** When a letter could arrive: tomorrow morning, in a week, a month, on our anniversary, in a year. */
function letterDates(pairedAt?: string): { label: string; at: Date }[] {
  const at = (days: number, hour = 9) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const out = [
    { label: 'Tomorrow morning', at: at(1) },
    { label: 'In a week', at: at(7) },
    { label: 'In a month', at: at(30) },
  ];
  if (pairedAt) {
    const p = new Date(pairedAt);
    const now = new Date();
    const next = new Date(now.getFullYear(), p.getMonth(), p.getDate(), 9);
    if (next.getTime() <= now.getTime() + 86_400_000) next.setFullYear(next.getFullYear() + 1);
    out.push({ label: `On our anniversary (${next.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })})`, at: next });
  }
  out.push({ label: 'In a year', at: at(365) });
  return out;
}

const STAR_FACTS = [
  'That’s the Big Dipper: seven stars, and the two at the end point to the North Star.',
  'Some of the light you’re seeing left its star before either of you was born.',
  'The brightest “star” low in the west after sunset is often Venus, a planet.',
  'The North Star barely moves all night: everything else turns round it.',
  'On a dark night you can see about 2,500 stars. Tonight they’re all yours.',
];

// ---------------------------------------------------------------- the boards

/** The board stands on a thin wooden base, clear of a tablecloth. */
const BOARD_LIFT = 0.045;

const CHESS_LIGHT = '#EFE3CC';
const CHESS_DARK = '#8B5E3C';

/** The board's squares in one mesh, coloured per square. */
function boardGeometry(game: Game): THREE.BufferGeometry {
  const { n, s } = boardSize(game);
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const quad = (cx: number, cz: number, w: number, hex: string, y = 0) => {
    c.set(hex);
    const h = w / 2;
    // Wound to face up.
    const v = [
      [cx - h, y, cz - h],
      [cx + h, y, cz + h],
      [cx + h, y, cz - h],
      [cx - h, y, cz - h],
      [cx - h, y, cz + h],
      [cx + h, y, cz + h],
    ];
    for (const p of v) {
      pos.push(p[0]!, p[1]!, p[2]!);
      col.push(c.r, c.g, c.b);
    }
  };
  const at = (f: number, r: number): [number, number] => [(r - (n - 1) / 2) * s, (f - (n - 1) / 2) * s];
  // A frame round it, on a base down to the table.
  quad(0, 0, n * s + 0.05, '#4A3020', -0.002);
  const half = (n * s + 0.05) / 2;
  const side = (x0: number, z0: number, x1: number, z1: number) => {
    c.set('#3A2618');
    for (const p of [[x0, 0, z0], [x1, 0, z1], [x1, -BOARD_LIFT, z1], [x0, 0, z0], [x1, -BOARD_LIFT, z1], [x0, -BOARD_LIFT, z0]]) {
      pos.push(p[0]!, p[1]! - 0.002, p[2]!);
      col.push(c.r, c.g, c.b);
    }
  };
  side(-half, half, half, half);
  side(half, -half, -half, -half);
  side(half, half, half, -half);
  side(-half, -half, -half, half);
  for (let f = 0; f < n; f++)
    for (let r = 0; r < n; r++) {
      const [x, z] = at(f, r);
      let hex: string;
      if (game.kind === 'chess') hex = (f + r) % 2 ? CHESS_LIGHT : CHESS_DARK;
      else if (game.kind === 'ttt') hex = (f + r) % 2 ? '#F4F1EA' : '#E3DCCF';
      else {
        const edge = f === 0 || r === 0 || f === 7 || r === 7;
        if (edge) {
          const sq = loopIndex(f, r);
          hex = sq === 0 ? LUDO_COLOUR[0]! : sq === 14 ? LUDO_COLOUR[1]! : LUDO_STARS.has(sq) ? '#FFD54A' : sq % 2 ? '#F4F1EA' : '#E9E4DA';
        } else if (f === r) hex = f < 4 ? '#F2A7B8' : '#A9C8F2';
        else hex = '#6FAE6A';
      }
      quad(x, z, s * 0.96, hex);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function loopIndex(f: number, r: number): number {
  for (let i = 0; i < LUDO_LOOP; i++) {
    const [cf, cr] = loopCell(i);
    if (cf === f && cr === r) return i;
  }
  return -1;
}

const boardMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

function BoardView({ game, meId, sel, planeRef }: { game: Game; meId: string; sel: string | null; planeRef: RefObject<THREE.Mesh | null> }) {
  const geo = useMemo(() => boardGeometry(game), [game.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geo.dispose(), [geo]);
  const { n, s } = boardSize(game);
  const at = (f: number, r: number): [number, number, number] => [(r - (n - 1) / 2) * s, 0, (f - (n - 1) / 2) * s];
  const pieces: ReactNode[] = [];
  if (game.kind === 'chess') {
    const b = chessBoard(game.s);
    b.forEach((row, i) =>
      row.forEach((p, f) => {
        if (!p) return;
        const r = 7 - i;
        pieces.push(<ChessPiece key={`${f}${r}`} type={p[1]!} white={p[0] === 'w'} at={at(f, r)} s={s} />);
      }),
    );
    const marks: [number, number, string][] = [];
    if (game.s.last) for (const q of game.s.last) marks.push([q.charCodeAt(0) - 97, Number(q[1]) - 1, '#F2D16B']);
    if (sel) {
      marks.push([sel.charCodeAt(0) - 97, Number(sel[1]) - 1, '#FFE45C']);
      for (const q of chessTargets(game.s, sel)) marks.push([q.charCodeAt(0) - 97, Number(q[1]) - 1, '#5CCB7F']);
    }
    marks.forEach(([f, r, c], i) => {
      const p = at(f, r);
      pieces.push(<mesh key={`m${i}`} geometry={funSphere} material={colour(c, true)} position={[p[0], 0.002, p[2]]} scale={[s * 0.3, 0.002, s * 0.3]} />);
    });
  } else if (game.kind === 'ttt') {
    for (let i = 0; i < 9; i++) {
      const v = game.s.b[i];
      if (v === '.') continue;
      const p = at(i % 3, Math.floor(i / 3));
      pieces.push(
        v === 'x' ? (
          <group key={i} position={p}>
            <mesh geometry={unitBox} material={colour('#D94F70')} position={[0, 0.012, 0]} rotation={[0, Math.PI / 4, 0]} scale={[s * 0.75, 0.02, s * 0.14]} />
            <mesh geometry={unitBox} material={colour('#D94F70')} position={[0, 0.012, 0]} rotation={[0, -Math.PI / 4, 0]} scale={[s * 0.75, 0.02, s * 0.14]} />
          </group>
        ) : (
          <mesh key={i} geometry={ring} material={colour('#4A8FE8')} position={[p[0], 0.012, p[2]]} rotation={[Math.PI / 2, 0, 0]} scale={s * 0.32} />
        ),
      );
    }
  } else {
    game.s.pos.forEach((tokens, player) =>
      tokens.forEach((pp, t) => {
        const [f, r] = ludoCell(player, pp, t);
        const p = at(f, r);
        pieces.push(
          <group key={`${player}${t}`} position={p}>
            <mesh geometry={cylinderGeo} material={colour(LUDO_COLOUR[player]!)} position={[0, 0.012, 0]} scale={[s * 0.32, 0.024, s * 0.32]} />
            <mesh geometry={funSphere} material={colour(LUDO_COLOUR[player]!)} position={[0, 0.034, 0]} scale={s * 0.2} />
          </group>,
        );
      }),
    );
    // The dice beside the board, showing the last roll.
    pieces.push(<Dice key="dice" value={game.s.dice} at={[0, 0, (n / 2 + 0.9) * s * (game.s.players[0] === meId ? -1 : 1)]} />);
  }
  return (
    <>
      <mesh ref={planeRef} geometry={geo} material={boardMat} userData={{ noHit: true }} />
      {pieces}
    </>
  );
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const ring = new THREE.TorusGeometry(1, 0.22, 8, 24);
const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 16);

/** Each chess piece turned on a lathe from a profile (r, y), in square sizes. */
const PROFILES: Record<string, [number, number][]> = {
  p: [[0, 0], [0.34, 0], [0.34, 0.08], [0.22, 0.16], [0.14, 0.42], [0.22, 0.48], [0.2, 0.56], [0.24, 0.66], [0.2, 0.78], [0, 0.82]],
  r: [[0, 0], [0.38, 0], [0.38, 0.1], [0.26, 0.2], [0.24, 0.68], [0.32, 0.74], [0.32, 0.92], [0.22, 0.92], [0.22, 0.86], [0, 0.86]],
  n: [[0, 0], [0.38, 0], [0.38, 0.1], [0.26, 0.2], [0.24, 0.5], [0, 0.5]],
  b: [[0, 0], [0.36, 0], [0.36, 0.1], [0.24, 0.2], [0.16, 0.66], [0.26, 0.72], [0.2, 0.8], [0.24, 0.92], [0.16, 1.04], [0.05, 1.1], [0, 1.14]],
  q: [[0, 0], [0.4, 0], [0.4, 0.1], [0.27, 0.2], [0.17, 0.8], [0.3, 0.86], [0.24, 0.94], [0.32, 1.12], [0.12, 1.16], [0.08, 1.24], [0, 1.26]],
  k: [[0, 0], [0.4, 0], [0.4, 0.1], [0.27, 0.2], [0.18, 0.84], [0.3, 0.9], [0.24, 0.98], [0.28, 1.12], [0.06, 1.14], [0.06, 1.3], [0, 1.3]],
};
const LATHES = Object.fromEntries(Object.entries(PROFILES).map(([k, pts]) => [k, new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 16)]));

function ChessPiece({ type, white, at, s }: { type: string; white: boolean; at: [number, number, number]; s: number }) {
  const m = colour(white ? '#F2EDE4' : '#2B2B33');
  return (
    <group position={at} scale={s} rotation={[0, white ? Math.PI / 2 : -Math.PI / 2, 0]}>
      <mesh geometry={LATHES[type] ?? LATHES.p!} material={m} />
      {type === 'n' ? (
        <>
          <mesh geometry={unitBox} material={m} position={[0, 0.66, 0.05]} rotation={[-0.35, 0, 0]} scale={[0.28, 0.4, 0.5]} />
          <mesh geometry={unitBox} material={m} position={[0, 0.86, -0.08]} scale={[0.24, 0.16, 0.2]} />
        </>
      ) : null}
      {type === 'k' ? <mesh geometry={unitBox} material={m} position={[0, 1.36, 0]} scale={[0.22, 0.06, 0.06]} /> : null}
    </group>
  );
}

/** The dice: its pips are spheres on the top face, so the last roll shows. */
function Dice({ value, at }: { value: number | null; at: [number, number, number] }) {
  const g = useRef<THREE.Group>(null);
  const last = useRef(value);
  const spin = useRef(0);
  useFrame((_, dt) => {
    if (last.current !== value) {
      last.current = value;
      if (value !== null) spin.current = 0.6;
    }
    if (!g.current) return;
    spin.current = Math.max(0, spin.current - dt);
    g.current.rotation.set(spin.current * 14, spin.current * 9, 0);
    g.current.position.y = 0.02 + Math.sin(spin.current * 5) * 0.03 * (spin.current > 0 ? 1 : 0);
  });
  const PIPS: Record<number, [number, number][]> = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
  return (
    <group ref={g} position={at}>
      <mesh geometry={unitBox} material={colour('#FFFFFF')} scale={0.04} />
      {(PIPS[value ?? 1] ?? []).map(([x, z], i) => <mesh key={i} geometry={funSphere} material={colour('#222228')} position={[x * 0.011, 0.02, z * 0.011]} scale={0.0045} />)}
    </group>
  );
}

// ----------------------------------------------------------- gifts, others

function GiftView({ kind }: { kind: GiftKind }) {
  if (kind === 'flowers')
    return (
      <>
        <mesh geometry={cylinderGeo} material={colour('#F4F1EA')} position={[0, 0.09, 0]} scale={[0.05, 0.18, 0.05]} />
        {['#E84A6F', '#FFC93C', '#F2A7B8', '#E84A6F', '#9B5DE5', '#FFFFFF', '#F2A7B8'].map((c, i) => {
          const a = (i / 7) * Math.PI * 2;
          return <FunBall key={i} at={[Math.cos(a) * 0.06 * (i % 2 ? 1 : 0.5), 0.24 + (i % 3) * 0.03, Math.sin(a) * 0.06 * (i % 2 ? 1 : 0.5)]} r={0.035} c={c} />;
        })}
      </>
    );
  if (kind === 'heart') return <mesh geometry={heartGeo} material={colour('#E8365C', true)} scale={0.16} />;
  if (kind === 'lamp')
    return (
      <>
        <mesh geometry={unitBox} material={colour('#FFF6DD')} position={[0, 0.06, 0]} rotation={[-0.4, 0, 0]} scale={[0.14, 0.1, 0.005]} />
        <FunBall at={[0, 0.13, 0]} r={0.02} c="#E8365C" />
      </>
    );
  return (
    <>
      <mesh geometry={unitBox} material={colour('#4A8FE8')} position={[0, 0.16, 0]} scale={[0.32, 0.32, 0.32]} />
      <mesh geometry={unitBox} material={colour('#FFC93C')} position={[0, 0.16, 0]} scale={[0.33, 0.33, 0.06]} />
      <mesh geometry={unitBox} material={colour('#FFC93C')} position={[0, 0.16, 0]} scale={[0.06, 0.33, 0.33]} />
      <FunBall at={[0, 0.35, 0]} r={0.05} c="#FFC93C" />
    </>
  );
}

const heartGeo = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, -0.9);
  s.bezierCurveTo(-0.2, -0.6, -1, -0.2, -1, 0.3);
  s.bezierCurveTo(-1, 0.8, -0.4, 1.0, 0, 0.55);
  s.bezierCurveTo(0.4, 1.0, 1, 0.8, 1, 0.3);
  s.bezierCurveTo(1, -0.2, 0.2, -0.6, 0, -0.9);
  return new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: false });
})();

function Chest() {
  return (
    <>
      <mesh geometry={unitBox} material={colour('#7A4B2A')} position={[0, 0.1, 0]} scale={[0.34, 0.2, 0.24]} />
      <mesh geometry={unitBox} material={colour('#8E5A33')} position={[0, 0.23, 0]} scale={[0.35, 0.07, 0.25]} />
      <mesh geometry={unitBox} material={colour('#F2C21B', true)} position={[0, 0.17, 0.125]} scale={[0.05, 0.07, 0.01]} />
    </>
  );
}

/** A twinkle over something left for me. */
function Sparkle({ y }: { y: number }) {
  const g = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = g.current;
    if (!m) return;
    const t = clock.elapsedTime;
    m.position.y = y + Math.sin(t * 2) * 0.05;
    m.rotation.y = t * 1.5;
    m.scale.setScalar(0.05 + Math.sin(t * 5) * 0.012);
  });
  return <mesh ref={g} geometry={octa} material={colour('#FFE45C', true)} />;
}
const octa = new THREE.OctahedronGeometry(1, 0);

/** A soft glow over a head, the colour of the mood. */
function MoodOrb({ who, colourOf, hidden }: { who: THREE.Vector3; colourOf?: string; hidden: boolean }) {
  const g = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = g.current;
    if (!m) return;
    m.visible = !!colourOf && !hidden;
    m.position.set(who.x, who.y + 2.05 + Math.sin(clock.elapsedTime * 2) * 0.04, who.z);
  });
  return <mesh ref={g} geometry={funSphere} material={colour(colourOf ?? '#FFFFFF', true)} scale={0.07} visible={false} />;
}

/** The Big Dipper, high over the garden (the balcony's telescope looks at it); and now and then a shooting star. */
const DIPPER_DIR = new THREE.Vector3(-0.3, 0.78, 0.55).normalize();
const DIPPER: [number, number][] = [[0, 0], [1.1, -0.2], [2.1, -0.15], [3, 0.1], [3.2, 1.0], [4.3, 1.1], [4.5, 0.2]];

function NightSky() {
  const geo = useMemo(() => {
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(DIPPER_DIR, up).normalize();
    const upish = new THREE.Vector3().crossVectors(right, DIPPER_DIR).normalize();
    const pts = DIPPER.map(([x, y]) => DIPPER_DIR.clone().multiplyScalar(48).addScaledVector(right, (x - 2.2) * 2.4).addScaledVector(upish, y * 2.4));
    const line: number[] = [];
    for (let i = 0; i < pts.length - 1; i++) line.push(...pts[i]!.toArray(), ...pts[i + 1]!.toArray());
    line.push(...pts[3]!.toArray(), ...pts[6]!.toArray());
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
    const stars = new THREE.BufferGeometry();
    stars.setAttribute('position', new THREE.Float32BufferAttribute(pts.flatMap((p) => p.toArray()), 3));
    return { lines, stars };
  }, []);
  useEffect(() => () => {
    geo.lines.dispose();
    geo.stars.dispose();
  }, [geo]);
  const shoot = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const m = shoot.current;
    if (!m) return;
    const t = clock.elapsedTime % 17;
    m.visible = t < 0.9;
    if (!m.visible) return;
    const k = t / 0.9;
    const seed = Math.floor(clock.elapsedTime / 17);
    const a = (seed * 2.39) % (Math.PI * 2);
    m.position.set(Math.cos(a) * 30 + k * 14, 34 - k * 7, Math.sin(a) * 30 - 10);
    m.rotation.set(0, 0, -0.45);
    (m.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI);
  });
  return (
    <>
      <lineSegments geometry={geo.lines}>
        <lineBasicMaterial color="#9FB6FF" transparent opacity={0.35} fog={false} />
      </lineSegments>
      <points geometry={geo.stars}>
        <pointsMaterial color="#FFFFFF" size={0.9} sizeAttenuation fog={false} />
      </points>
      <mesh ref={shoot} geometry={unitBox} scale={[3.2, 0.06, 0.06]} visible={false}>
        <meshBasicMaterial color="#FFFFFF" transparent opacity={0} fog={false} depthWrite={false} />
      </mesh>
    </>
  );
}

// ------------------------------------------------------------- the temple

const brass = () => colour('#C9A23A');
const bellShape = new THREE.LatheGeometry(
  [[0, 0.32], [0.05, 0.31], [0.08, 0.26], [0.1, 0.12], [0.14, 0.02], [0.16, 0], [0.13, 0.01], [0.09, 0.11], [0.07, 0.25], [0.03, 0.3], [0, 0.3]].map(([r, y]) => new THREE.Vector2(r, y)),
  16,
);

/** The bell over the hall's steps, the diya stand, the shoe rack, and the aarti lamp circling before the lingam. */
function TempleThings({ lit, swing, aarti, barefoot }: { lit: number; swing: { current: number }; aarti: () => boolean; barefoot: [boolean, boolean] }) {
  const bell = useRef<THREE.Group>(null);
  const lamp = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => {
    if (bell.current) {
      swing.current = Math.max(0, swing.current - dt * 0.4);
      bell.current.rotation.x = Math.sin(clock.elapsedTime * 6) * 0.35 * swing.current;
    }
    if (lamp.current) {
      const on = aarti();
      lamp.current.visible = on;
      if (on) {
        const a = clock.elapsedTime * 1.4;
        lamp.current.position.set(TEMPLE.lingam.x + Math.cos(a) * 0.45, 1.0 + Math.sin(a) * 0.45, TEMPLE.lingam.z - 0.9);
      }
    }
  });
  const slots = 8;
  return (
    <>
      <group position={[TEMPLE.bell.x, TEMPLE.bell.y, TEMPLE.bell.z]}>
        <mesh geometry={unitBox} material={brass()} position={[0, 0.25, 0]} scale={[0.02, 0.5, 0.02]} />
        <group ref={bell}>
          <mesh geometry={bellShape} material={brass()} position={[0, -0.32, 0]} />
        </group>
      </group>
      <group position={[TEMPLE.diyas.x, 0, TEMPLE.diyas.z]}>
        <mesh geometry={cylinderGeo} material={brass()} position={[0, 0.45, 0]} scale={[0.04, 0.9, 0.04]} />
        <mesh geometry={cylinderGeo} material={brass()} position={[0, 0.02, 0]} scale={[0.22, 0.04, 0.22]} />
        <mesh geometry={cylinderGeo} material={brass()} position={[0, 0.9, 0]} scale={[0.3, 0.03, 0.3]} />
        {Array.from({ length: slots }, (_, i) => {
          const a = (i / slots) * Math.PI * 2;
          const x = Math.cos(a) * 0.24;
          const z = Math.sin(a) * 0.24;
          return (
            <group key={i} position={[x, 0.93, z]}>
              <mesh geometry={funSphere} material={colour('#A0522D')} scale={[0.045, 0.02, 0.045]} />
              {i < lit * 2 ? <FunFlames n={1} spread={0} size={0.03} y={0.01} /> : null}
            </group>
          );
        })}
      </group>
      <group position={[TEMPLE.rack.x, 0, TEMPLE.rack.z]} rotation={[0, Math.PI / 2, 0]}>
        <mesh geometry={unitBox} material={colour('#6B4A2E')} position={[0, 0.35, 0]} scale={[1.0, 0.04, 0.3]} />
        <mesh geometry={unitBox} material={colour('#6B4A2E')} position={[0, 0.05, 0]} scale={[1.0, 0.04, 0.3]} />
        {[-0.48, 0.48].map((x) => (
          <mesh key={x} geometry={unitBox} material={colour('#5A3A24')} position={[x, 0.2, 0]} scale={[0.04, 0.4, 0.3]} />
        ))}
        {barefoot.map((off, i) =>
          off ? (
            <group key={i} position={[i ? 0.25 : -0.25, 0.39, 0]}>
              {[-0.05, 0.05].map((x) => (
                <mesh key={x} geometry={unitBox} material={colour(i ? '#2E2E38' : '#F2F0EA')} position={[x, 0.025, 0]} scale={[0.08, 0.05, 0.24]} />
              ))}
            </group>
          ) : null,
        )}
      </group>
      <group ref={lamp} visible={false}>
        <mesh geometry={cylinderGeo} material={brass()} scale={[0.07, 0.02, 0.07]} />
        <FunFlames n={3} spread={0.03} size={0.035} y={0.01} />
      </group>
    </>
  );
}
