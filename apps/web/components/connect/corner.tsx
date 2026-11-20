'use client';

import { dailyState, QUIZ_INFO, quizState, quizVerdict, rateGap, roundScore, type QuizKind, type QuizRound } from '@us/shared';
import { useCouple, useCoupleLive, useDailyDoodle, useDrawGames, useDrawings, useFeature, usePartnerDrawing, usePartnerInHouse, useQuizzes } from '@us/shared/react';
import { Check, House, Lock, Play, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Initial } from '@/components/plan/bits';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { Blob, CanvasArt, GuessArt, ME, StarsArt, THEM } from './art';
import { TodayQuestion, useDaily } from './daily-question';

const QUIZ_ORDER: QuizKind[] = ['know_me', 'this_or_that', 'most_likely', 'rate_it'];

/** Each game's tint and edge, title colour and the fill of its Play button. */
const GAME_TONE: Record<QuizKind, { card: string; title: string; fill: string }> = {
  know_me: { card: 'bg-[#D3F4EB] border-[#91E3D5]', title: 'text-teal-700', fill: 'bg-teal-700' },
  this_or_that: { card: 'bg-[#FFE1E9] border-[#FFB8C9]', title: 'text-rose-700', fill: 'bg-rose-600' },
  most_likely: { card: 'bg-[#E8E0F8] border-[#C9B8EC]', title: 'text-plum-600', fill: 'bg-plum-600' },
  rate_it: { card: 'bg-[#FFEDC6] border-[#FCC24F]', title: 'text-gold-700', fill: 'bg-gold-700' },
};

const LIFT = 'shadow-[0_10px_24px_-14px_rgba(63,44,102,0.45)]';
const HOVER = 'transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400';

/**
 * Connect: drawing together up top, today's four games as a 2×2, then
 * drawings, and today's question in the plum card.
 */
export function ConnectCorner({ settings }: { settings?: ReactNode }) {
  const draw = useFeature('draw');
  const quizzesOn = useFeature('quizzes');
  const houseOn = useFeature('house');
  const dailyOn = useFeature('daily_question');
  const quizzes = useQuizzes(quizzesOn);
  const daily = useDaily();
  const { partner } = useCouple();
  const { partnerOnline } = useCoupleLive();
  const streak = daily.data?.streak ?? 0;
  const done = QUIZ_ORDER.filter((k) => quizzes.today[k] && quizState(quizzes.today[k]!) !== 'mine').length;
  const upNext = QUIZ_ORDER.find((k) => quizzes.today[k] && quizState(quizzes.today[k]!) === 'mine');

  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[17px] text-plum-500">Your little corner,</p>
          <h1 className="font-display text-[40px] font-extrabold leading-[46px] tracking-[-0.025em] sm:text-[48px] sm:leading-[54px]">Connect</h1>
          {partnerOnline || streak > 0 ? (
            <p className="mt-1.5 flex items-center gap-2 text-small text-plum-500">
              {partnerOnline ? <span className="h-2 w-2 rounded-full bg-sage-400" /> : null}
              {partnerOnline ? `${partner.display_name}’s here` : null}
              {partnerOnline && streak > 0 ? ' · ' : null}
              {streak > 0 ? (
                <span>
                  <b className="text-rose-600">{streak}</b>-day streak
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
        {settings}
      </header>

      {houseOn ? (
        <Section title="Our house" bar="bg-[#2F7FA8]">
          <HouseCard />
        </Section>
      ) : null}

      {draw ? (
        <Section title="Draw" bar="bg-rose-400">
          <div className="grid grid-cols-2 gap-3">
            <DrawTogetherCard />
            <DrawGuessCard />
          </div>
        </Section>
      ) : null}

      {quizzesOn ? (
        <Section title="Daily games" bar="bg-teal-500" right={<span className="text-small text-plum-400">{done} of 4 done</span>}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {QUIZ_ORDER.map((kind) => (
              <GameTile key={kind} kind={kind} round={quizzes.today[kind]} loading={quizzes.loading} upNext={kind === upNext} />
            ))}
          </div>
        </Section>
      ) : null}

      {draw ? <Drawings /> : null}

      {dailyOn ? (
        <Section title="Today’s question" bar="bg-plum-500">
          <QuestionCard daily={daily} />
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, bar, right, children }: { title: string; bar: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-[22px] font-bold">
          <span aria-hidden className={cn('h-[22px] w-1 rounded-full', bar)} />
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

const pill = 'mt-1.5 inline-flex self-start rounded-full px-3.5 py-[7px] text-[13px] font-bold';

/** In through the front door: a home with a garden and a pool, where we both walk around. */
function HouseCard() {
  const { partner } = useCouple();
  const inside = usePartnerInHouse();
  const line = inside ? `${partner.display_name} is in the house now` : 'Two floors, a garden and a pool. Walk around together';
  return (
    <Link
      href="/house"
      className={cn('flex min-h-[132px] items-center gap-4 rounded-[26px] bg-gradient-to-br from-[#7CC6E8] to-[#2F7FA8] p-4 text-white shadow-[0_14px_26px_-16px_rgba(47,127,168,0.8)]', HOVER)}
    >
      <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[22px] bg-white/20">
        <House size={44} strokeWidth={1.7} />
      </span>
      <span className="flex flex-1 flex-col gap-1">
        <span className="text-[18px] font-bold">Our house</span>
        <span className="line-clamp-2 text-[13px] text-white/90">{line}</span>
        <span className={cn(pill, 'bg-white text-[#2F7FA8]')}>{inside ? 'Join' : 'Go in'}</span>
      </span>
    </Link>
  );
}

function DrawTogetherCard() {
  const { partner } = useCouple();
  const { partnerOnline } = useCoupleLive();
  const drawing = usePartnerDrawing();
  const name = partner.display_name;
  const line = drawing ? `${name} is drawing now` : partnerOnline ? `${name} is online` : 'Paint on the same page';
  return (
    <Link
      href="/connect/draw"
      className={cn('flex min-h-[200px] flex-col gap-1.5 rounded-[26px] bg-gradient-to-br from-[#F7709A] to-[#D42A5E] p-4 text-white shadow-[0_14px_26px_-16px_rgba(196,29,85,0.8)]', HOVER)}
    >
      <CanvasArt />
      <span className="flex-1" />
      <span className="text-[18px] font-bold">Draw together</span>
      <span className="line-clamp-2 text-[13px] text-white/90">{line}</span>
      <span className={cn(pill, 'bg-white text-rose-600')}>{drawing ? 'Join' : 'Open'}</span>
    </Link>
  );
}

function DrawGuessCard() {
  const { partner } = useCouple();
  const { stats, toGuess, myTurnToDraw } = useDrawGames();
  const line = toGuess ? `${partner.display_name} drew one for you` : myTurnToDraw ? 'Your turn to draw' : stats.best ? `Best team score ${stats.best}` : 'Draw it, they guess it';
  return (
    <Link
      href="/connect/draw/guess"
      className={cn('relative flex min-h-[200px] flex-col gap-1.5 rounded-[26px] bg-gradient-to-br from-[#FFD36B] to-[#F3A823] p-4 text-plum-800 shadow-[0_14px_26px_-16px_rgba(174,111,8,0.8)]', HOVER)}
    >
      <GuessArt />
      {toGuess || myTurnToDraw ? <span className="absolute right-3 top-3 rounded-full bg-rose-500 px-2.5 py-1 text-[11px] font-bold text-white">Your turn</span> : null}
      <span className="flex-1" />
      <span className="text-[18px] font-bold">Draw &amp; Guess</span>
      <span className="line-clamp-2 text-[13px] text-gold-800">{line}</span>
      <span className={cn(pill, 'bg-plum-800 text-white')}>{toGuess ? 'Guess' : myTurnToDraw ? 'Draw' : 'Play'}</span>
    </Link>
  );
}

/** One of today's games: its own tint, edge and title colour. */
function GameTile({ kind, round, loading, upNext }: { kind: QuizKind; round: QuizRound | undefined; loading: boolean; upNext: boolean }) {
  const { me, partner } = useCouple();
  const name = partner.display_name;
  const tone = GAME_TONE[kind];
  const state = round ? quizState(round) : null;
  const first = round?.items[0];
  const total = round?.questions.length ?? 8;
  const score = round && state === 'revealed' ? roundScore(round) : 0;

  let line: string;
  if (!round) line = loading ? 'Shuffling…' : 'Not ready yet';
  else if (state === 'waiting') line = 'You answered · waiting';
  else if (state === 'revealed')
    line =
      kind === 'this_or_that'
        ? `You matched ${score} of ${total}`
        : kind === 'rate_it'
          ? `${rateGap(round.my_answers, round.partner_answers)} apart on average`
          : `${score} of ${total} · ${quizVerdict(kind, score, total).replace(/\s\S+$/u, '')}`;
  else
    line =
      kind === 'know_me'
        ? round.subject_id === me.id
          ? `All about you. ${name} guesses.`
          : `Guess ${name}’s answers`
        : kind === 'this_or_that'
          ? `${total} quick picks`
          : kind === 'most_likely' && first?.prompt
            ? `…to ${first.prompt}?`
            : first?.prompt
              ? `“${first.prompt}”`
              : `${total} to play`;

  const art =
    kind === 'know_me' ? (
      <Blob {...THEM} size={44} mood="o" />
    ) : kind === 'this_or_that' ? (
      <span className="flex flex-col items-start gap-1">
        <span className="max-w-full truncate rounded-full bg-white px-2.5 py-0.5 text-[12px] font-bold text-rose-600">{first?.options[0] ?? 'This'}</span>
        <span className="max-w-full truncate rounded-full bg-teal-700 px-2.5 py-0.5 text-[12px] font-bold text-white">{first?.options[1] ?? 'That'}</span>
      </span>
    ) : kind === 'most_likely' ? (
      <span className="flex">
        <Blob {...ME} size={32} />
        <span className="-ml-1">
          <Blob {...THEM} size={32} />
        </span>
      </span>
    ) : (
      <StarsArt />
    );

  const badge =
    state === 'revealed' ? (
      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-white">
        <Check className="h-3.5 w-3.5 text-rose-500" strokeWidth={3} aria-hidden />
      </span>
    ) : state === 'waiting' ? (
      <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold">{name}’s turn</span>
    ) : upNext ? (
      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-[0.05em] text-white', tone.fill)}>UP NEXT</span>
    ) : null;

  const body = (
    <>
      <span className="flex items-start justify-between gap-1">
        <span className="min-w-0 flex-1">{art}</span>
        {badge}
      </span>
      <span className="flex-1" />
      <span className={cn('line-clamp-2 text-[17px] font-bold leading-[21px]', tone.title)}>{QUIZ_INFO[kind].title}</span>
      <span className="line-clamp-2 text-[13px] leading-[17px] text-plum-500">{line}</span>
      {state === 'mine' ? (
        <span className={cn('mt-1.5 flex h-[34px] items-center justify-center gap-1.5 rounded-full text-[13px] font-bold', upNext ? cn(tone.fill, 'text-white') : cn('bg-white', tone.title))}>
          {upNext ? <Play className="h-3 w-3 fill-white" aria-hidden /> : null}
          Play
        </span>
      ) : null}
    </>
  );
  const cls = cn('flex min-h-[170px] flex-col gap-1 rounded-[24px] border-2 p-3.5', tone.card);
  return round ? (
    <Link href={`/connect/play/quiz/${round.id}`} className={cn(cls, HOVER)}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Today's doodle, then our latest drawings as polaroids. */
function Drawings() {
  const { me, partner } = useCouple();
  const doodle = useDailyDoodle(true);
  const { drawings, urls } = useDrawings();
  const name = partner.display_name;
  const mine = doodle.drawings.find((d) => d.created_by === me.id);
  const theirs = doodle.drawings.find((d) => d.created_by !== me.id);
  const both = doodle.mine && doodle.partner;
  const line = both ? 'You both drew it. See them side by side.' : doodle.mine ? `Yours is in. Waiting for ${name}.` : doodle.partner ? `${name} drew theirs. Draw yours to swap.` : `Draw it, then see ${name}’s.`;
  const action = both ? 'See both' : doodle.mine ? 'Look again' : 'Start drawing';
  const recent = drawings.filter((d) => urls[d.png_path]).slice(0, 3);
  const tilt = ['-rotate-3', 'rotate-2', '-rotate-2'];

  return (
    <Section
      title="Drawings"
      bar="bg-gold-400"
      right={
        drawings.length ? (
          <Link href="/connect/draw/gallery" className="text-small font-bold text-rose-600 hover:underline">
            See all {drawings.length}
          </Link>
        ) : undefined
      }
    >
      <Link href="/connect/draw/daily" className={cn('flex items-center gap-3.5 rounded-[26px] border border-paper-edge bg-paper-raised p-4', HOVER)}>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[12px] font-bold tracking-[0.08em] text-rose-700">TODAY’S DOODLE</span>
          <span className="line-clamp-2 text-[18px] font-bold">{doodle.prompt}</span>
          <span className="text-[13px] text-plum-500">{line}</span>
          <span className={cn(pill, 'mt-2 bg-rose-50 text-rose-600')}>{action}</span>
        </span>
        <span aria-hidden className="flex shrink-0">
          <Polaroid rotate="-rotate-6" url={both && theirs ? doodle.urls[theirs.png_path] : undefined} tint="#C8F2EA" locked={doodle.partner && !both} />
          <span className="-ml-2 mt-3">
            <Polaroid rotate="rotate-6" url={mine ? doodle.urls[mine.png_path] : undefined} dashed={!doodle.mine} />
          </span>
        </span>
      </Link>
      {recent.length ? (
        <div className="grid grid-cols-3 gap-2.5">
          {recent.map((d, i) => (
            <Link key={d.id} href="/connect/draw/gallery" aria-label="Open our drawings" className={cn('block h-24 rounded-[6px] bg-white p-1.5 pb-4 sm:h-32', LIFT, tilt[i], HOVER)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urls[d.png_path]} alt="" className="h-full w-full rounded-[3px] object-contain" />
            </Link>
          ))}
        </div>
      ) : null}
    </Section>
  );
}

function Polaroid({ rotate, url, tint = '#fff', locked, dashed }: { rotate: string; url?: string; tint?: string; locked?: boolean; dashed?: boolean }) {
  return (
    <span className={cn('block w-14 rounded-[6px] bg-white p-1 pb-3', LIFT, rotate)}>
      <span className={cn('flex h-12 items-center justify-center overflow-hidden rounded-[3px]', dashed && 'border-2 border-dashed border-rose-300')} style={{ backgroundColor: dashed ? '#fff' : tint }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : dashed ? <Plus className="h-5 w-5 text-rose-500" /> : locked ? <Lock className="h-4 w-4 text-teal-700" /> : null}
      </span>
    </span>
  );
}

/** Today's question in the plum card. */
function QuestionCard({ daily }: { daily: ReturnType<typeof useDaily> }) {
  const { partner, partnerSlot } = useCouple();
  const [open, setOpen] = useState(false);
  const today = daily.data?.today;
  const state = today ? dailyState(today) : null;
  const name = partner.display_name;
  const status =
    state === 'nudge'
      ? `${name} has answered. Theirs opens once you write yours.`
      : state === 'waiting'
        ? `Yours is in. You’ll see ${name}’s when they answer.`
        : state === 'revealed'
          ? 'You both answered. Read them side by side.'
          : `Neither of you has answered yet. It stays hidden till ${name} answers too.`;
  const action = state === 'revealed' ? 'Read both answers' : state === 'waiting' ? 'Read yours' : 'Write your answer';
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('flex w-full flex-col gap-3.5 rounded-[26px] bg-gradient-to-br from-[#3A2A5E] to-[#4B3468] p-5 text-left text-white shadow-[0_16px_30px_-18px_rgba(36,25,51,0.9)]', HOVER)}
      >
        <span className="text-[12px] font-bold tracking-[0.08em] text-gold-300">ASKED TO YOU BOTH</span>
        <span className="text-[21px] font-semibold leading-[28px]">{today?.prompt ?? 'Loading today’s question…'}</span>
        <span className="flex items-center gap-3 rounded-[16px] bg-white/10 px-3 py-2.5">
          <Initial slot={partnerSlot} name={name} size={30} />
          <span className="flex-1 text-[13px] leading-[18px] text-white/85">{status}</span>
        </span>
        <span className="flex h-[50px] items-center justify-center rounded-full bg-rose-600 text-[16px] font-bold">{action}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="Today’s question" className="sm:w-[min(92vw,560px)]">
        <TodayQuestion daily={daily} />
      </Dialog>
    </>
  );
}
