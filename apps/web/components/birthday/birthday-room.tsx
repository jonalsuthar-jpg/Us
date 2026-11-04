'use client';

import { BIRTHDAY_STEPS, birthdayUrls, daysTogether, type BirthdayRoom, type BirthdaySection, type BirthdayStep } from '@us/shared';
import { bringCakeOnAnswer, useBirthday, useCallManager, useCouple, useFeatures, useUsSoFar, type BirthdayView } from '@us/shared/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Pencil, Phone, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Confetti } from '@/components/games/confetti';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { SongPlayer, useBlow } from './audio';
import { BirthdayEditor } from './birthday-editor';
import { Cake } from './cake';

/** Which part of the story each step edits. */
const SECTION: Record<BirthdayStep, BirthdaySection> = {
  wish: 'wish',
  song: 'song',
  notes: 'notes',
  us: 'moments',
  quiz: 'quiz',
  gift: 'gift',
  cake: 'cake',
  card: 'card',
  ending: 'ending',
};

/**
 * The birthday room: a story she taps through at her own pace. The maker sees
 * the same thing as a preview, with a pencil on every page.
 */
export function BirthdayRoomPage() {
  const b = useBirthday();
  const router = useRouter();
  if (!b.room) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-plum-900 px-8 text-center">
        {b.loading ? (
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : (
          <>
            <p className="text-body text-plum-100">Nothing here yet 🙂</p>
            <Button variant="night" onClick={() => router.push('/home')}>
              Back
            </Button>
          </>
        )}
      </div>
    );
  }
  return <Story b={b} room={b.room} />;
}

function Story({ b, room }: { b: BirthdayView; room: BirthdayRoom }) {
  const router = useRouter();
  const { sb, me, partner } = useCouple();
  const has = useFeatures();
  const { maker } = b;
  const from = maker ? me.display_name : partner.display_name;
  const c = room.content;
  const close = () => router.push('/home');

  // Parts with nothing in them are skipped for her; the maker sees every page to fill it in.
  const steps = useMemo(
    () =>
      BIRTHDAY_STEPS.filter((s) => {
        if (maker) return true;
        if (s === 'song') return !!c.song.audio_path;
        if (s === 'notes') return c.notes.length > 0;
        if (s === 'quiz') return c.quiz.length > 0;
        if (s === 'gift') return !!c.gift.title;
        if (s === 'cake') return has('calls');
        if (s === 'card') return has('draw');
        return true;
      }),
    [maker, c, has],
  );
  const [index, setIndex] = useState(0);
  const step = steps[Math.min(index, steps.length - 1)]!;
  const [note, setNote] = useState(0);
  const [blown, setBlown] = useState(false);
  const [burst, setBurst] = useState(0);
  const [editing, setEditing] = useState<BirthdaySection | null>(null);
  const celebrate = () => setBurst((n) => n + 1);

  const { open } = b;
  useEffect(() => {
    if (!maker && !room.opened_at) void open().catch(() => {});
  }, [maker, room.opened_at, open]);

  useEffect(() => {
    const before = document.title;
    document.title = maker ? `Preview · ${room.name}’s birthday` : `Happy birthday, ${room.name} ✨`;
    return () => {
      document.title = before;
    };
  }, [maker, room.name]);

  const paths = useMemo(() => [c.song.audio_path, ...c.moments.map((m) => m.photo_path)].filter((p): p is string => !!p), [c]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!paths.length) return;
    let live = true;
    birthdayUrls(sb, paths)
      .then((u) => live && setUrls(u))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [sb, paths]);

  const notesLeft = step === 'notes' && note < c.notes.length - 1;
  const next = () => {
    if (notesLeft) return setNote((n) => n + 1);
    if (index < steps.length - 1) setIndex(index + 1);
  };
  const back = () => {
    if (step === 'notes' && note > 0) return setNote((n) => n - 1);
    if (index > 0) setIndex(index - 1);
  };

  // Arrow keys and Escape, for the browser.
  const keys = useRef({ next, back, close, editing });
  keys.current = { next, back, close, editing };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (keys.current.editing || (e.target as HTMLElement)?.closest('input, textarea, [role="dialog"]')) return;
      if (e.key === 'ArrowRight') keys.current.next();
      if (e.key === 'ArrowLeft') keys.current.back();
      if (e.key === 'Escape') keys.current.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tapToAdvance = step === 'song' || step === 'notes' || step === 'us' || (step === 'wish' && blown);
  const section = SECTION[step];
  const draft = c.drafts.includes(section);

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-plum-900 text-paper">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-16 h-72 w-72 rounded-full bg-rose-500 opacity-25 blur-2xl" />
        <div className="absolute -right-28 top-1/3 h-80 w-80 rounded-full bg-teal-500 opacity-20 blur-2xl" />
        <div className="absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-gold-400 opacity-15 blur-2xl" />
      </div>

      <div className="relative mx-auto w-full max-w-xl space-y-3 px-4 pt-4">
        <div className="flex gap-1">
          {steps.map((s, i) => (
            <div key={s} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
              <div className={cn('h-full rounded-full bg-white transition-[width] duration-500', i < index ? 'w-full' : i === index ? 'w-1/2' : 'w-0')} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {maker ? (
            <span className="rounded-full bg-gold-300 px-2.5 py-1 text-micro font-semibold text-plum-900">{`Preview · ${room.name} sees this on her birthday`}</span>
          ) : (
            <span className="text-small font-medium text-plum-100">{`From ${from} 💌`}</span>
          )}
          <span className="flex-1" />
          {maker ? (
            <button
              type="button"
              onClick={() => setEditing(section)}
              className={cn('flex h-9 items-center gap-1.5 rounded-full px-3 text-micro font-semibold text-white', draft ? 'bg-rose-500 hover:bg-rose-600' : 'bg-white/15 hover:bg-white/25')}
            >
              <Pencil className="h-3.5 w-3.5" />
              {draft ? 'Draft · Edit' : 'Edit'}
            </button>
          ) : null}
          <button type="button" aria-label="Close" onClick={close} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className={cn('relative flex-1 overflow-y-auto', tapToAdvance && 'cursor-pointer')} onClick={tapToAdvance && !editing ? next : undefined}>
        <div className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-6 py-6">
          <AnimatePresence mode="wait">
            <motion.div key={`${step}-${step === 'notes' ? note : ''}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }}>
              {step === 'wish' ? (
                <Wish
                  line={c.wish.line}
                  name={room.name}
                  blown={blown}
                  onBlow={() => {
                    setBlown(true);
                    celebrate();
                    setTimeout(() => setIndex((i) => (i === 0 ? 1 : i)), 2600);
                  }}
                />
              ) : step === 'song' ? (
                <Song caption={c.song.caption} url={c.song.audio_path ? urls[c.song.audio_path] : undefined} from={from} maker={maker} />
              ) : step === 'notes' ? (
                <Notes notes={c.notes} index={note} />
              ) : step === 'us' ? (
                <UsSoFar room={room} urls={urls} from={from} />
              ) : step === 'quiz' ? (
                <Quiz room={room} maker={maker} from={from} onMark={b.mark} onDone={celebrate} />
              ) : step === 'gift' ? (
                <Gift title={c.gift.title} body={c.gift.body} onOpen={celebrate} />
              ) : step === 'cake' ? (
                <CakeStep line={c.cake.line} from={from} maker={maker} canCall={has('calls')} onCut={celebrate} />
              ) : step === 'card' ? (
                <CardStep line={c.card.line} from={from} />
              ) : (
                <Ending room={room} maker={maker} from={from} b={b} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="relative mx-auto flex w-full max-w-xl items-center justify-between px-5 pb-6">
        <button
          type="button"
          aria-label="Back"
          disabled={index === 0 && note === 0}
          onClick={back}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        {step === 'notes' && c.notes.length > 1 ? <span className="text-small text-plum-200">{`${note + 1} / ${c.notes.length}`}</span> : null}
        {index < steps.length - 1 ? (
          <button type="button" onClick={next} className="flex h-12 items-center gap-1 rounded-full bg-white px-5 font-semibold text-plum-900 hover:bg-plum-100">
            {step === 'wish' && !blown ? 'Skip' : 'Next'}
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <span className="h-12 w-12" />
        )}
      </div>

      {burst ? <Confetti key={burst} pieces={90} /> : null}
      {maker ? <BirthdayEditor room={room} section={editing} urls={urls} onSave={b.save} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function Kicker({ children }: { children: string }) {
  return <p className="text-center text-micro font-semibold uppercase tracking-[0.2em] text-gold-300">{children}</p>;
}

function Wish({ line, name, blown, onBlow }: { line: string; name: string; blown: boolean; onBlow: () => void }) {
  const mic = useBlow(!blown, () => !blown && onBlow());
  return (
    <div className="flex flex-col items-center gap-5">
      <Kicker>Make a wish</Kicker>
      <h1 className="text-center font-display text-[28px] leading-[1.25]">{blown ? `Happy birthday, ${name}! 🎉` : line}</h1>
      <button type="button" aria-label="Blow out the candles" disabled={blown} onClick={onBlow} className="rounded-[28px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
        <Cake size={280} lit={!blown} />
      </button>
      <p className="text-center text-small text-plum-200">
        {blown ? 'I hope it comes true ✨' : mic === 'on' ? 'Blow into your mic… or click the candles' : 'Click the candles to blow them out'}
      </p>
    </div>
  );
}

function Song({ caption, url, from, maker }: { caption: string; url?: string; from: string; maker: boolean }) {
  return (
    <div className="flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()}>
      <Kicker>{`A song from ${from}`}</Kicker>
      <p className="text-[56px] leading-none">🎶</p>
      {url ? <SongPlayer url={url} autoPlay /> : <p className="text-center text-body text-plum-200">{maker ? 'No voice note yet. Click Edit to record yourself singing.' : 'Loading…'}</p>}
      {caption ? <p className="text-center font-serif text-lead italic">{caption}</p> : null}
    </div>
  );
}

function Notes({ notes, index }: { notes: string[]; index: number }) {
  return (
    <div className="space-y-6">
      <Kicker>Things I’ve noticed about you</Kicker>
      <div className={cn('relative flex min-h-[220px] items-center justify-center rounded-[30px] bg-paper px-8 py-10', index % 2 ? 'rotate-[1.5deg]' : '-rotate-[1.5deg]')}>
        <span className="absolute left-5 top-2 font-serif text-[48px] text-rose-300">“</span>
        <p className="text-center font-display text-[24px] leading-[1.35] text-plum-900">{notes[index] ?? 'Add a few notes from Edit.'}</p>
      </div>
      <p className="text-center text-small text-plum-200">{index < notes.length - 1 ? 'Click for the next one' : '💛'}</p>
    </div>
  );
}

function UsSoFar({ room, urls, from }: { room: BirthdayRoom; urls: Record<string, string>; from: string }) {
  const stats = useUsSoFar(true);
  const { couple } = useCouple();
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const lines: string[] = [];
  if (stats?.firstMessage) {
    lines.push(stats.firstMessage.text ? `Our first message: “${stats.firstMessage.text.slice(0, 80)}” on ${fmt(stats.firstMessage.at)}` : `Our first message: ${fmt(stats.firstMessage.at)}`);
  }
  lines.push(`Days on Us together: ${daysTogether(couple.paired_at)}`);
  if (stats) {
    lines.push(`Messages sent: ${stats.messages.toLocaleString()}`);
    if (stats.calls) lines.push(`Hours we’ve spent on calls: ${stats.callHours}`);
    if (stats.topEmoji) lines.push(`Most used emoji: ${stats.topEmoji.emoji}`);
  }
  return (
    <div className="space-y-5">
      <Kicker>Us, so far</Kicker>
      <div className="space-y-2.5">
        {lines.map((l, i) => (
          <motion.p key={l} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.22 }} className="rounded-[20px] bg-white/10 px-4 py-3 text-body">
            {l}
          </motion.p>
        ))}
        {!stats ? <span className="mx-auto block h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
      </div>
      {room.content.moments.length ? (
        <div className="space-y-3">
          <p className="text-small font-semibold text-gold-300">{`A few moments ${from} picked`}</p>
          {room.content.moments.map((m, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 + i * 0.25 }} className="overflow-hidden rounded-[22px] bg-paper">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {m.photo_path && urls[m.photo_path] ? <img src={urls[m.photo_path]} alt="" className="aspect-[4/3] w-full object-cover" /> : null}
              <div className="space-y-1 px-4 py-3">
                {m.date ? <p className="text-micro text-rose-600">{fmt(`${m.date}T12:00:00`)}</p> : null}
                <p className="text-body text-plum-900">{m.text}</p>
              </div>
            </motion.div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Quiz({ room, maker, from, onMark, onDone }: { room: BirthdayRoom; maker: boolean; from: string; onMark: (i: number, right: boolean) => Promise<void>; onDone: () => void }) {
  const qs = room.content.quiz;
  const [marks, setMarks] = useState<Record<string, boolean>>(() => (maker ? {} : room.marks));
  const firstOpen = qs.findIndex((_, i) => marks[i] === undefined);
  const [i, setI] = useState(firstOpen === -1 ? qs.length : firstOpen);
  const [shown, setShown] = useState(false);
  const score = Object.values(marks).filter(Boolean).length;

  const mark = (right: boolean) => {
    setMarks((m) => ({ ...m, [i]: right }));
    if (!maker) void onMark(i, right).catch(() => {});
    setShown(false);
    if (i + 1 >= qs.length) onDone();
    setI(i + 1);
  };

  if (!qs.length) return <p className="text-center text-plum-200">Add questions from Edit.</p>;
  if (i >= qs.length) {
    return (
      <div className="flex flex-col items-center gap-4">
        <Kicker>How well do I know you?</Kicker>
        <p className="font-display text-[60px] leading-none">{`${score}/${qs.length}`}</p>
        <p className="text-center text-lead text-plum-100">{score >= qs.length - 1 ? `Not bad for ${from}, right? 😎` : 'Okay, I’m still learning 😅'}</p>
        <button
          type="button"
          onClick={() => {
            setMarks({});
            setI(0);
          }}
          className="text-small text-plum-300 underline"
        >
          See them again
        </button>
      </div>
    );
  }
  const q = qs[i]!;
  return (
    <div className="space-y-5">
      <Kicker>{`How well do I know you? · ${i + 1}/${qs.length}`}</Kicker>
      <div className="space-y-4 rounded-[28px] bg-paper px-6 py-7">
        <p className="text-center font-display text-[22px] leading-[1.3] text-plum-900">{q.q}</p>
        {shown ? (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="space-y-1 rounded-[18px] bg-rose-50 px-4 py-3 text-center">
            <p className="text-micro text-rose-600">{`${from} says`}</p>
            <p className="text-lead font-semibold text-plum-900">{q.a}</p>
          </motion.div>
        ) : (
          <Button block onClick={() => setShown(true)}>{`Reveal ${from}’s answer`}</Button>
        )}
      </div>
      {shown ? (
        <div className="flex gap-3">
          <Button variant="night" className="flex-1" onClick={() => mark(false)}>
            ✗ Wrong
          </Button>
          <Button variant="accept" className="flex-1" onClick={() => mark(true)}>
            ✓ Right
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Gift({ title, body, onOpen }: { title: string; body: string; onOpen: () => void }) {
  const [taps, setTaps] = useState(0);
  const open = taps >= 3;
  const tap = () => {
    if (open) return;
    if (taps + 1 >= 3) onOpen();
    setTaps(taps + 1);
  };
  return (
    <div className="flex flex-col items-center gap-5">
      <Kicker>A little something</Kicker>
      {open ? (
        <motion.div initial={{ opacity: 0, y: 20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', bounce: 0.4 }} className="w-full space-y-3 rounded-[28px] border-2 border-dashed border-gold-300 bg-paper px-6 py-8 text-center">
          <p className="text-[44px] leading-none">🎟️</p>
          <p className="font-display text-[24px] leading-[1.3] text-plum-900">{title || 'Your gift'}</p>
          {body ? <p className="text-body text-plum-700">{body}</p> : null}
        </motion.div>
      ) : (
        <>
          <motion.button key={taps} type="button" aria-label="Shake the gift box" onClick={tap} animate={taps ? { rotate: [0, -12, 12, -8, 0] } : undefined} transition={{ duration: 0.32 }} className="text-[150px] leading-none">
            🎁
          </motion.button>
          <p className="text-center text-small text-plum-200">{taps === 0 ? 'Click to shake it' : taps === 1 ? 'Again…' : 'One more!'}</p>
        </>
      )}
    </div>
  );
}

/** A cake with a knife to drag down through it. */
export function CakeCutter({ knife, cut, size, onMove }: { knife: number; cut: boolean; size: number; onMove: (knife: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const at = (e: ReactPointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    // The knife enters at the top of the cake (a third down) and leaves at the plate.
    onMove((e.clientY - r.top - size * 0.3) / (size * 0.55));
  };
  return (
    <div
      ref={box}
      role="slider"
      aria-label="Drag down to cut the cake"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(knife * 100)}
      tabIndex={0}
      onKeyDown={(e) => e.key === 'ArrowDown' && onMove(knife + 0.15)}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        at(e);
      }}
      onPointerMove={(e) => dragging.current && at(e)}
      onPointerUp={() => (dragging.current = false)}
      className="cursor-grab touch-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
    >
      <Cake size={size} lit={false} knife={Math.max(knife, cut ? 1 : 0.02)} cut={cut} />
    </div>
  );
}

function CakeStep({ line, from, maker, canCall, onCut }: { line: string; from: string; maker: boolean; canCall: boolean; onCut: () => void }) {
  const calls = useCallManager();
  const [tryCake, setTryCake] = useState({ knife: 0, cut: false });
  return (
    <div className="flex flex-col items-center gap-5">
      <Kicker>Cut the cake together</Kicker>
      {line ? <p className="text-center font-display text-[22px] leading-[1.3]">{line}</p> : null}
      {maker ? (
        <>
          <p className="text-center text-small text-plum-200">On the day, her button calls you. You both see this cake, and when either of you drags the knife, it cuts on both screens. Try it:</p>
          <CakeCutter
            size={240}
            knife={tryCake.knife}
            cut={tryCake.cut}
            onMove={(k) =>
              setTryCake((t) => {
                if (t.cut) return t;
                const knife = Math.max(t.knife, Math.min(1, k));
                if (knife >= 0.92) {
                  onCut();
                  return { knife: 1, cut: true };
                }
                return { knife, cut: false };
              })
            }
          />
        </>
      ) : (
        <>
          <Cake size={220} lit={false} />
          {canCall ? (
            <Button
              size="lg"
              onClick={() => {
                bringCakeOnAnswer();
                void calls.startCall('video');
              }}
            >
              <Phone className="h-5 w-5" />
              {`Call ${from}`}
            </Button>
          ) : null}
          <p className="text-center text-small text-plum-200">The cake comes out on the call. Drag the knife down to cut it.</p>
        </>
      )}
    </div>
  );
}

function CardStep({ line, from }: { line: string; from: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center gap-5">
      <Kicker>Sign the card</Kicker>
      <p className="text-[64px] leading-none">💌</p>
      {line ? <p className="text-center font-display text-[22px] leading-[1.3]">{line}</p> : null}
      <Button size="lg" onClick={() => router.push('/connect/draw')}>
        Open Draw together ✍️
      </Button>
      <p className="text-center text-small text-plum-200">{`Doodle and sign it with ${from}, live. Save it when you’re both done.`}</p>
    </div>
  );
}

function Ending({ room, maker, from, b }: { room: BirthdayRoom; maker: boolean; from: string; b: BirthdayView }) {
  const [keeping, setKeeping] = useState(false);
  const [thanking, setThanking] = useState(false);
  const [thanks, setThanks] = useState('Thank you for my birthday surprise 🥹💛');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kept = !!room.memory_id;
  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-[56px] leading-none">🎂</p>
      <p className="text-center font-display text-[30px] leading-[1.25]">{room.content.ending.line}</p>
      <p className="text-small text-plum-200">{`— ${from}`}</p>
      <div className="w-full space-y-3">
        <Button
          variant="night"
          block
          disabled={maker || kept}
          loading={keeping}
          onClick={async () => {
            setKeeping(true);
            await b.keep().catch(() => {});
            setKeeping(false);
          }}
        >
          {kept ? 'Kept in Memories ✓' : 'Keep this in Memories'}
        </Button>
        <Button block disabled={maker || sent} onClick={() => setThanking(true)}>
          {sent ? 'Thank-you sent 💛' : 'Send a thank-you'}
        </Button>
        {maker ? <p className="text-center text-micro text-plum-300">These two buttons work for her on the day.</p> : null}
      </div>
      <Dialog open={thanking} onOpenChange={setThanking} title={`A note to ${from}`}>
        <div className="space-y-3">
          <textarea
            aria-label="Your message"
            value={thanks}
            onChange={(e) => setThanks(e.target.value)}
            rows={4}
            maxLength={1000}
            className="w-full rounded-control border border-paper-edge bg-paper-raised px-4 py-3 text-body text-ink focus:border-rose-400 focus:outline-none"
          />
          {error ? <p className="text-small text-rose-600">{error}</p> : null}
          <Button
            block
            loading={busy}
            disabled={!thanks.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await b.thank(thanks);
                setSent(true);
                setThanking(false);
              } catch {
                setError('Couldn’t send. Try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            Send
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
