'use client';

/**
 * What makes the table feel alive, all read from the game's log so it shows
 * what really happened: cards flying from the lands that paid out into the
 * players' hands, into and out of the bank, across a trade, to a monopoly's
 * winner; a played development card sweeping onto the board; a banner when
 * a new turn starts; and short notes (a trade done, an offer rejected or
 * countered, a card stolen) in the corner.
 */
import { freshEvents, notesFor, RESOURCES, TOPOLOGY, type Hand, type IsleNote, type IsleState, type Res } from '@us/shared/isle';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { devArt, resArt, WOOD } from './kit';

type Point = { x: number; y: number };
type Flight = { id: string; img: string | null; from: Point; to: Point; delay: number; big?: boolean };

/** The middle of a marked element (data-anchor) inside the table, in the table's pixels. */
function anchor(root: HTMLElement, name: string): Point | null {
  const el = root.querySelector(`[data-anchor="${name}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const o = root.getBoundingClientRect();
  return { x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2 };
}

const ROLL_LANDS = 1200;
const MAX_CARDS = 5;

export function FlyCards({ state, me, toScreen }: { state: IsleState; me: number; toScreen: (x: number, y: number) => Point | null }) {
  const root = useRef<HTMLDivElement>(null);
  const prev = useRef<IsleState | null>(state);
  const [flights, setFlights] = useState<Flight[]>([]);

  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    const el = root.current?.parentElement;
    if (!el || !before) return;
    const events = freshEvents(before, state);
    if (!events.length) return;
    const add: Flight[] = [];
    let n = 0;
    const seatAt = (p: number) => anchor(el, `seat-${p}`);
    const handAt = (p: number, r: Res) => (p === me ? anchor(el, `hand-${r}`) : seatAt(p));
    const bank = () => anchor(el, 'bank');
    const fly = (img: string | null, from: Point | null, to: Point | null, delay: number, big?: boolean) => {
      if (from && to) add.push({ id: `${state.n}-${n++}`, img, from, to, delay, big });
    };
    const rolled = events.find((e) => e.k === 'roll');
    events.forEach((e, i) => {
      const before1 = i > 0 ? events[i - 1] : before.log[before.log.length - 1];
      switch (e.k) {
        case 'gain': {
          let k = 0;
          for (const r of RESOURCES) {
            for (let j = 0; j < Math.min(MAX_CARDS, e.cards[r] ?? 0); j++) {
              let from: Point | null;
              let delay = k * 90;
              if (rolled && rolled.k === 'roll') {
                // From a land with that number that pays this seat.
                const total = rolled.d[0] + rolled.d[1];
                const h = TOPOLOGY.hexes.findIndex(
                  (hex, hi) => state.board.numbers[hi] === total && hi !== state.robber && state.board.terrain[hi] === r && hex.verts.some((v) => state.towns[v]?.p === e.p),
                );
                from = h >= 0 ? toScreen(TOPOLOGY.hexes[h]!.x, TOPOLOGY.hexes[h]!.y) : null;
                delay += ROLL_LANDS;
              } else if (before1?.k === 'settle') {
                const v = TOPOLOGY.verts[before1.v]!;
                from = toScreen(v.x, v.y);
              } else from = bank();
              fly(resArt(r), from, handAt(e.p, r), delay);
              k++;
            }
          }
          break;
        }
        case 'bank':
          for (let j = 0; j < Math.min(MAX_CARDS, e.n); j++) fly(resArt(e.give), handAt(e.p, e.give), bank(), j * 70);
          fly(resArt(e.get), bank(), handAt(e.p, e.get), 450);
          break;
        case 'trade': {
          const o = before.offer;
          if (!o) break;
          const c = o.replies[e.with] === true ? null : o.counters?.[e.with];
          const give: Partial<Hand> = c ? c.want : o.give;
          const get: Partial<Hand> = c ? c.give : o.want;
          let k = 0;
          for (const r of RESOURCES) for (let j = 0; j < Math.min(MAX_CARDS, give[r] ?? 0); j++) fly(resArt(r), handAt(e.p, r), handAt(e.with, r), k++ * 80);
          k = 0;
          for (const r of RESOURCES) for (let j = 0; j < Math.min(MAX_CARDS, get[r] ?? 0); j++) fly(resArt(r), handAt(e.with, r), handAt(e.p, r), 250 + k++ * 80);
          break;
        }
        case 'monopoly':
          before.players.forEach((pl, q) => {
            if (q === e.p) return;
            for (let j = 0; j < Math.min(MAX_CARDS, pl.hand[e.r]); j++) fly(resArt(e.r), seatAt(q), handAt(e.p, e.r), 300 + q * 120 + j * 80);
          });
          break;
        case 'steal': {
          // I know what was taken only when it was from me or by me.
          const mine = e.p === me ? state.players[me]! : e.from === me ? before.players[me]! : null;
          const other = e.p === me ? before.players[me]! : e.from === me ? state.players[me]! : null;
          const r = mine && other ? RESOURCES.find((x) => mine.hand[x] !== other.hand[x]) : undefined;
          fly(r ? resArt(r) : null, r ? handAt(e.from, r) : seatAt(e.from), r ? handAt(e.p, r) : seatAt(e.p), 600);
          break;
        }
        case 'discard':
          for (let j = 0; j < Math.min(MAX_CARDS, e.n); j++) fly(null, seatAt(e.p), bank(), j * 70);
          break;
        case 'buy':
          fly(null, anchor(el, 'deck'), e.p === me ? anchor(el, 'dev-hand') : seatAt(e.p), 0);
          break;
        case 'play': {
          if (e.card === 'vp') break;
          const o = el.getBoundingClientRect();
          fly(devArt(e.card), e.p === me ? anchor(el, 'dev-hand') : seatAt(e.p), { x: o.width / 2, y: o.height * 0.42 }, 0, true);
          break;
        }
      }
    });
    if (add.length) setFlights((f) => [...f, ...add]);
  }, [state, me, toScreen]);
  const landed = useCallback((id: string) => setFlights((f) => f.filter((x) => x.id !== id)), []);

  return (
    <div ref={root} data-fly-layer className="pointer-events-none absolute inset-0 z-[25]">
      {flights.map((f) => (
        <FlyingCard key={f.id} f={f} onDone={landed} />
      ))}
    </div>
  );
}

function FlyingCard({ f, onDone }: { f: Flight; onDone: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dx = f.to.x - f.from.x;
    const dy = f.to.y - f.from.y;
    // An arc: up and over, a little spin, settling small where it lands.
    const lift = Math.min(120, Math.hypot(dx, dy) * 0.25);
    const frames: Keyframe[] = f.big
      ? [
          { transform: 'translate(0,0) scale(0.6) rotate(-8deg)', opacity: 0 },
          { transform: `translate(${dx * 0.6}px, ${dy * 0.6 - 30}px) scale(2.4) rotate(0deg)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${dx}px, ${dy}px) scale(2.6)`, opacity: 1, offset: 0.75 },
          { transform: `translate(${dx}px, ${dy}px) scale(2.2)`, opacity: 0 },
        ]
      : [
          { transform: 'translate(0,0) scale(0.7) rotate(-6deg)', opacity: 0 },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(1.05) rotate(4deg)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.8) rotate(0deg)`, opacity: 1, offset: 0.9 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.6)`, opacity: 0 },
        ];
    const a = el.animate(frames, { duration: f.big ? 1300 : 850, delay: f.delay, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' });
    a.onfinish = () => onDone(f.id);
    return () => a.cancel();
  }, [f, onDone]);
  return (
    <div ref={ref} className="absolute" style={{ left: f.from.x - 20, top: f.from.y - 30, width: 40, height: 60, opacity: 0 }}>
      {f.img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={f.img} alt="" className="h-full w-full rounded-[5px] object-contain shadow-[0_8px_14px_-4px_rgba(0,0,0,0.6)]" />
      ) : (
        <div className="h-full w-full rounded-[5px] border-2 border-[#C99A42] bg-[radial-gradient(circle,#7A4C2A,#3A2312)] shadow-[0_8px_14px_-4px_rgba(0,0,0,0.6)]" />
      )}
    </div>
  );
}

// ---- Notes and the turn banner ---------------------------------------------------------

export function Notifications({ state, me, colors, right }: { state: IsleState; me: number; colors: string[]; right: number }) {
  const prev = useRef<IsleState>(state);
  const [notes, setNotes] = useState<IsleNote[]>([]);
  const [banner, setBanner] = useState<{ id: number; text: string; color: string; mine: boolean } | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (before === state) return;
    const fresh = notesFor(before, state, me);
    if (fresh.length) {
      setNotes((n) => [...n, ...fresh].slice(-4));
      setTimeout(() => setNotes((n) => n.filter((x) => !fresh.includes(x))), 3600);
    }
    // A new turn (after the opening): a banner across the board.
    const turned = (before.turn !== state.turn || before.turnNo !== state.turnNo) && state.phase === 'roll';
    if (turned || (before.phase === 'setup' && state.phase === 'roll')) {
      const mine = state.turn === me;
      setBanner({ id: state.n, text: mine ? 'Your turn' : `${state.players[state.turn]!.name}’s turn`, color: colors[state.turn]!, mine });
    }
  }, [state, me, colors]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 1900);
    return () => clearTimeout(t);
  }, [banner]);

  return (
    <>
      {banner ? (
        <div key={banner.id} className="pointer-events-none absolute left-1/2 top-[84px] z-[22] animate-[isle-banner_1.9s_ease-out_forwards]">
          <div className={cn('flex items-center gap-3 rounded-[14px] px-7 py-3 font-serif text-[26px] font-bold tracking-wide', banner.mine ? 'border-2 border-[#FFF3CF] bg-gradient-to-b from-[#FCE6A2] to-[#E3B24A] text-[#3B2A1E] shadow-[0_14px_30px_-8px_rgba(232,184,74,0.9)]' : cn(WOOD, 'text-[#FBEFD5]'))}>
            <span className="h-4 w-4 rounded-full border-2 border-white/80" style={{ background: banner.color }} />
            {banner.text}
          </div>
        </div>
      ) : null}
      <div className="pointer-events-none absolute top-[76px] z-[22] flex w-[300px] flex-col items-end gap-2" style={{ right }}>
        {notes.map((n) => (
          <div
            key={n.id}
            className={cn(
              'flex animate-[isle-toast_3.6s_ease-out_forwards] items-center gap-2 rounded-[12px] border px-3 py-2 text-[13px] font-semibold shadow-[0_10px_20px_-8px_rgba(0,0,0,0.6)]',
              n.tone === 'good' && 'border-[#BFE3A8] bg-[#E9F6DD] text-[#2F5A26]',
              n.tone === 'bad' && 'border-[#F0B8A8] bg-[#FBE6DF] text-[#8A2F1C]',
              n.tone === 'info' && 'border-[#E8D3A6] bg-[#FFF7E2] text-[#3B2A1E]',
            )}
          >
            {n.p != null ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[n.p] }} /> : null}
            {n.text}
          </div>
        ))}
      </div>
    </>
  );
}
