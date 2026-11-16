'use client';

import { BIRTHDAY_STEPS, birthdayUrls, daysTogether, type BirthdayRoom } from '@us/shared';
import { useBirthdayStory, useCouple, useUsSoFar } from '@us/shared/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Confetti } from '@/components/games/confetti';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { SongPlayer } from './audio';
import { Cake } from './cake';

/**
 * The birthday story, kept in Memories: tapped through again at your own
 * pace, exactly as it was written.
 */
export function BirthdayStoryPage({ memoryId }: { memoryId: string }) {
  const story = useBirthdayStory(memoryId);
  const router = useRouter();
  if (!story.room) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-plum-900 px-8 text-center">
        {story.loading ? (
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : (
          <>
            <p className="text-body text-plum-100">This story isn’t here 🙂</p>
            <Button variant="night" onClick={() => router.push('/memory')}>
              Back
            </Button>
          </>
        )}
      </div>
    );
  }
  return <Story room={story.room} />;
}

function Story({ room }: { room: BirthdayRoom }) {
  const router = useRouter();
  const { sb, me, partner } = useCouple();
  const from = room.from_id === me.id ? me.display_name : partner.display_name;
  const c = room.content;
  const close = () => router.push('/memory');

  // Pages with nothing in them are skipped.
  const steps = useMemo(
    () =>
      BIRTHDAY_STEPS.filter((s) => {
        if (s === 'song') return !!c.song.audio_path;
        if (s === 'notes') return c.notes.length > 0;
        if (s === 'quiz') return c.quiz.length > 0;
        if (s === 'gift') return !!c.gift.title;
        return true;
      }),
    [c],
  );
  const [index, setIndex] = useState(0);
  const step = steps[Math.min(index, steps.length - 1)]!;
  const [note, setNote] = useState(0);
  const [blown, setBlown] = useState(false);
  const [burst, setBurst] = useState(0);
  const celebrate = () => setBurst((n) => n + 1);

  useEffect(() => {
    const before = document.title;
    document.title = `${room.name}’s birthday ✨`;
    return () => {
      document.title = before;
    };
  }, [room.name]);

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
  const keys = useRef({ next, back, close });
  keys.current = { next, back, close };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, [role="dialog"]')) return;
      if (e.key === 'ArrowRight') keys.current.next();
      if (e.key === 'ArrowLeft') keys.current.back();
      if (e.key === 'Escape') keys.current.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tapToAdvance = step === 'song' || step === 'notes' || step === 'us' || (step === 'wish' && blown);

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
          <span className="text-small font-medium text-plum-100">{`From ${from} 💌`}</span>
          <span className="flex-1" />
          <button type="button" aria-label="Close" onClick={close} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className={cn('relative flex-1 overflow-y-auto', tapToAdvance && 'cursor-pointer')} onClick={tapToAdvance ? next : undefined}>
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
                <Song caption={c.song.caption} url={c.song.audio_path ? urls[c.song.audio_path] : undefined} from={from} />
              ) : step === 'notes' ? (
                <Notes notes={c.notes} index={note} />
              ) : step === 'us' ? (
                <UsSoFar room={room} urls={urls} from={from} />
              ) : step === 'quiz' ? (
                <Quiz room={room} from={from} />
              ) : step === 'gift' ? (
                <Gift title={c.gift.title} body={c.gift.body} onOpen={celebrate} />
              ) : (
                <Ending line={c.ending.line} from={from} />
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
    </div>
  );
}

function Kicker({ children }: { children: string }) {
  return <p className="text-center text-micro font-semibold uppercase tracking-[0.2em] text-gold-300">{children}</p>;
}

function Wish({ line, name, blown, onBlow }: { line: string; name: string; blown: boolean; onBlow: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5">
      <Kicker>Make a wish</Kicker>
      <h1 className="text-center font-display text-[28px] leading-[1.25]">{blown ? `Happy birthday, ${name}! 🎉` : line}</h1>
      <button type="button" aria-label="Blow out the candles" disabled={blown} onClick={onBlow} className="rounded-[28px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
        <Cake size={280} lit={!blown} />
      </button>
      <p className="text-center text-small text-plum-200">
        {blown ? 'I hope it comes true ✨' : 'Click the candles to blow them out'}
      </p>
    </div>
  );
}

function Song({ caption, url, from }: { caption: string; url?: string; from: string }) {
  return (
    <div className="flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()}>
      <Kicker>{`A song from ${from}`}</Kicker>
      <p className="text-[56px] leading-none">🎶</p>
      {url ? <SongPlayer url={url} autoPlay /> : <p className="text-center text-body text-plum-200">Loading…</p>}
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
        <p className="text-center font-display text-[24px] leading-[1.35] text-plum-900">{notes[index]}</p>
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

/** The questions, the answers, and how she marked each one on the day. */
function Quiz({ room, from }: { room: BirthdayRoom; from: string }) {
  const qs = room.content.quiz;
  const marked = qs.some((_, i) => room.marks[i] !== undefined);
  const score = qs.filter((_, i) => room.marks[i]).length;
  return (
    <div className="space-y-5" onClick={(e) => e.stopPropagation()}>
      <Kicker>How well do I know you?</Kicker>
      {marked ? <p className="text-center font-display text-[44px] leading-none">{`${score}/${qs.length}`}</p> : null}
      <div className="space-y-3">
        {qs.map((q, i) => (
          <div key={i} className="space-y-2 rounded-[24px] bg-paper px-5 py-4">
            <p className="font-display text-[19px] leading-[1.3] text-plum-900">{q.q}</p>
            <div className="flex items-center gap-2">
              <p className="flex-1 text-body text-plum-700">
                <span className="text-micro text-rose-600">{`${from} said `}</span>
                {q.a}
              </p>
              {room.marks[i] !== undefined ? <span className="text-lead text-plum-900">{room.marks[i] ? '✓' : '✗'}</span> : null}
            </div>
          </div>
        ))}
      </div>
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

function Ending({ line, from }: { line: string; from: string }) {
  return (
    <div className="flex flex-col items-center gap-6">
      <p className="text-[56px] leading-none">🎂</p>
      <p className="text-center font-display text-[30px] leading-[1.25]">{line}</p>
      <p className="text-small text-plum-200">{`— ${from}`}</p>
    </div>
  );
}
