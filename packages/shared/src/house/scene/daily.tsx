import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import { walletRef } from '../../api/wallet';
import { nextStreak, requestsFor, stampOfMoment, stampOfRegion, STAMPS, taskOfMoment, TODAY_LABEL, todayFor, type RequestNeed, type StampId, type TodayTask } from '../daily';
import { BOUQUET, BREAD_BAG, KULFI, PURI_PLATE, today } from '../items';
import { regionAt } from '../layout';
import { worldHours } from '../sky';
import { VILLAGERS, villagerAt } from '../villagers';
import { colour, Near } from './fun-models';
import type { FunHost, FunPanel } from './fun';
import { Slideshow } from './items';

/**
 * Daily life in the village (the rules are in daily.ts): villagers who need
 * a small favour (a "!" over them), "today together" with its streak, our
 * stamp book of places and firsts, and movie night on a screen in the square.
 */

const REQ_KEY = 'requests';
const TODAY_KEY = 'today_together';
const STAMPS_KEY = 'stamps';
const BASKET_KEY = 'basket';

/** What each need is, held (its item) and said. */
const NEED: Record<RequestNeed, { key: string | null; word: string }> = {
  bouquet: { key: BOUQUET, word: 'flowers' },
  bread: { key: BREAD_BAG, word: 'bread' },
  kulfi: { key: KULFI, word: 'kulfi' },
  puri: { key: PURI_PLATE, word: 'pani puri' },
  veg: { key: null, word: 'vegetables' },
};

/** The open-air screen in the square: over the lake path, facing the fountain. */
const SCREEN = { x: 0, z: 57.8, w: 4.4, h: 2.5, y: 3.6 };
const movieTime = (hour: number) => hour >= 18.5 && hour < 23.5;

interface Ctx {
  h: FunHost;
  raw: (k: string) => Record<string, unknown> | null;
  set: (k: string, v: Record<string, unknown> | null) => void;
  partnerHere: () => boolean;
}

export function useDaily({ h, raw, set }: Ctx) {
  const { meId } = h;
  const st = useRef({ checked: 0, asked: new Set<string>() }).current;
  const coupleId = h.coupleId ?? '';
  const list = <T,>(k: string, field: string): T[] => {
    const v = raw(k);
    return Array.isArray(v?.[field]) ? (v![field] as T[]) : [];
  };
  const day = () => today();
  const doneRequests = () => (raw(REQ_KEY)?.day === day() ? list<string>(REQ_KEY, 'done') : []);
  const doneToday = () => (raw(TODAY_KEY)?.day === day() ? list<TodayTask>(TODAY_KEY, 'done') : []);
  const stamps = () => list<StampId>(STAMPS_KEY, 'list');
  const basket = () => Number(raw(BASKET_KEY)?.n ?? 0) || 0;

  /** Open requests now, each with its villager where they are. */
  function open() {
    const done = doneRequests();
    return requestsFor(day(), coupleId)
      .filter((r) => !done.includes(r.id))
      .map((r) => {
        const v = VILLAGERS.find((x) => x.id === r.who);
        const at = v ? villagerAt(v, Date.now(), coupleId) : null;
        return v && at ? { r, v, at } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }

  function stamp(id: StampId) {
    const have = stamps();
    if (have.includes(id)) return;
    set(STAMPS_KEY, { list: [...have, id] });
    const s = STAMPS.find((x) => x.id === id)!;
    h.say(`New in our stamp book: ${s.label} ${s.emoji}`);
  }

  /** A moment happened: does it count for today, or earn a stamp? */
  function track(id: string, text: string) {
    const first = stampOfMoment(id, text);
    if (first) stamp(first);
    const task = taskOfMoment(id, text);
    const d = day();
    if (!task || !todayFor(d, coupleId).includes(task)) return;
    const done = doneToday();
    if (done.includes(task)) return;
    const now = [...done, task];
    const prev = raw(TODAY_KEY);
    if (now.length < 3) {
      set(TODAY_KEY, { ...(prev ?? {}), day: d, done: now });
      h.say(`✓ ${TODAY_LABEL[task]} (${now.length} of 3 today)`);
      return;
    }
    const streak = nextStreak(prev as { last?: string; streak?: number } | null, d);
    set(TODAY_KEY, { day: d, done: now, streak, last: d });
    setTimeout(() => {
      h.moment(`today:${d}`, streak > 1 ? `All three today! ${streak} days in a row 🔥` : 'All three today! 🔥', true, false);
      h.wallet?.earn('today', walletRef('today', d));
    }, 2500);
  }

  function focus(): { label: string; run: () => void } | null {
    const me = h.me;
    if (me.seat) return null;
    for (const { r, v, at } of open()) {
      if (Math.hypot(at.x - me.pos.x, at.z - me.pos.z) > 2.2) continue;
      const need = NEED[r.need];
      const have = need.key ? me.hold?.key === need.key : basket() > 0;
      // (Without it, they just ask as we come up: see frame. The shop's own button stays.)
      if (!have) continue;
      return {
        label: `Give ${v.name} the ${need.word}`,
        run: () => {
          if (need.key) {
            me.hold = null;
            set(need.key, null);
          } else set(BASKET_KEY, { n: basket() - 1 });
          const d = day();
          set(REQ_KEY, { day: d, done: [...doneRequests(), r.id] });
          h.wallet?.earn('request', walletRef('request', d, r.id));
          h.moment(`request:${d}:${r.id}`, `${v.name}: ${r.thanks}`, true, false);
        },
      };
    }
    return null;
  }

  function frame() {
    // Places we're at together: a stamp each (checked once a second).
    const now = Date.now();
    if (now - st.checked < 1000) return;
    st.checked = now;
    // Coming up to someone with a favour to ask: they ask (once a day each).
    for (const { r, v, at } of open()) {
      const k = `${day()}:${r.id}`;
      if (!st.asked.has(k) && Math.hypot(at.x - h.me.pos.x, at.z - h.me.pos.z) < 3) {
        st.asked.add(k);
        h.say(`${v.name}: ${r.ask}`);
      }
    }
    const p = h.them.pose;
    if (!p || !h.them.shown) return;
    const mine = stampOfRegion(h.me.at);
    if (mine && mine === stampOfRegion(regionAt(p.x, p.y + 0.1, p.z)?.id)) stamp(mine);
    // Movie night: both on the square's benches while the film's on.
    const hour = worldHours(now, coupleId);
    if (movieTime(hour) && h.photos.length && h.me.seat?.key.startsWith('bench_') && p.a?.startsWith('sit:bench_')) {
      const b = Number(h.me.seat.key.split('_')[1]);
      if (b <= 3) h.moment(`movie-square:${Math.floor(now / 3_600_000)}`, 'Movie night under the stars 🎬');
    }
  }

  const opt = (id: string, label: string, emoji?: string) => ({ id, label, emoji });

  function panel(id: string): FunPanel | null {
    if (id === 'today') {
      const d = day();
      const done = doneToday();
      const v = raw(TODAY_KEY);
      const streak = v?.last === d || nextStreak(v as { last?: string; streak?: number } | null, d) > 1 ? Number(v?.streak ?? 0) : 0;
      const asks = open().map(({ r, v: who }) => `${who.name} would like ${NEED[r.need].word}`);
      return {
        id,
        title: 'Today together',
        text: [streak > 1 ? `${streak} days in a row 🔥` : 'Do all three together today.', asks.length ? `In the village: ${asks.join('; ')}.` : ''].filter(Boolean).join(' '),
        options: [...todayFor(d, coupleId).map((t) => opt(`today-${t}`, TODAY_LABEL[t], done.includes(t) ? '✅' : '⬜')), opt('back', 'Back')],
      };
    }
    if (id === 'stamps') {
      const have = stamps();
      return {
        id,
        title: 'Our places',
        text: `${have.length} of ${STAMPS.length} stamps. Go places together to fill the book.`,
        options: [...STAMPS.map((s) => opt(`stamp-${s.id}`, have.includes(s.id) ? s.label : '?', have.includes(s.id) ? s.emoji : '·')), opt('back', 'Back')],
      };
    }
    return null;
  }

  /** The menu's lines for these (with how today's going). */
  function menu() {
    const d = day();
    const done = doneToday().filter((t) => todayFor(d, coupleId).includes(t)).length;
    return [opt('today', `Today together (${done}/3)`, '🔥'), opt('stamps', 'Our places', '📖')];
  }

  const scene = (
    <>
      <Marks open={open} />
      <Near near={h.me.pos} x={SCREEN.x} z={SCREEN.z} r={45}>
        <Screen photos={h.photos} on={() => movieTime(worldHours(Date.now(), coupleId)) && h.photos.length > 0} />
      </Near>
    </>
  );

  void meId;
  return { track, focus, frame, panel, menu, scene, picks: (id: string) => id === 'today' || id === 'stamps' };
}

const box = new THREE.BoxGeometry(1, 1, 1);

/** A gold "!" over each villager with a favour to ask, bobbing. */
function Marks({ open }: { open: () => { v: { id: string }; at: { x: number; z: number } }[] }) {
  const g = useRef<THREE.Group[]>([]);
  const tick = useRef(0);
  const cache = useRef<{ x: number; z: number }[]>([]);
  useFrame(({ clock }) => {
    if (tick.current++ % 10 === 0) cache.current = open().map((o) => o.at);
    g.current.forEach((m, i) => {
      if (!m) return;
      const at = cache.current[i];
      m.visible = !!at;
      if (at) m.position.set(at.x, 2.35 + Math.sin(clock.elapsedTime * 3 + i) * 0.06, at.z);
    });
  });
  const gold = colour('#FFC93C', true);
  return (
    <>
      {[0, 1].map((i) => (
        <group key={i} ref={(m) => void (g.current[i] = m!)} visible={false}>
          <mesh geometry={box} material={gold} position={[0, 0.16, 0]} scale={[0.07, 0.24, 0.07]} />
          <mesh geometry={box} material={gold} position={[0, -0.04, 0]} scale={0.07} />
        </group>
      ))}
    </>
  );
}

/** The square's open-air screen on two posts: our photos after dark (world evening), blank by day. */
function Screen({ photos, on }: { photos: FunHost['photos']; on: () => boolean }) {
  const show = useRef<THREE.Group>(null);
  useFrame(() => {
    if (show.current) show.current.visible = on();
  });
  const post = colour('#2E2E38');
  return (
    <group position={[SCREEN.x, 0, SCREEN.z]} rotation={[0, Math.PI, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={box} material={post} position={[s * (SCREEN.w / 2 + 0.1), (SCREEN.y + SCREEN.h / 2) / 2, 0]} scale={[0.12, SCREEN.y + SCREEN.h / 2, 0.12]} />
      ))}
      <mesh geometry={box} material={colour('#F4F1EA')} position={[0, SCREEN.y, -0.04]} scale={[SCREEN.w + 0.1, SCREEN.h + 0.1, 0.05]} />
      <group ref={show}>{photos.length ? <Slideshow photos={photos} w={SCREEN.w} h={SCREEN.h} z={0.0} y={SCREEN.y} /> : null}</group>
    </group>
  );
}
