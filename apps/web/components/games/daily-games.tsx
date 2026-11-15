'use client';

import { QUIZ_INFO, QUIZ_KINDS, quizState, rateGap, roundScore, type QuizKind, type QuizRound } from '@us/shared';
import { useCouple, useFeature, useQuizzes } from '@us/shared/react';
import { ArrowLeftRight, Clock, Search, Star, Users } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

const TILE: Record<QuizKind, { card: string; chip: string; icon: ReactNode }> = {
  this_or_that: { card: 'border-sage-100 bg-sage-50', chip: 'bg-sage-400 text-white', icon: <ArrowLeftRight className="h-[19px] w-[19px]" aria-hidden /> },
  know_me: { card: 'border-teal-100 bg-teal-50', chip: 'bg-teal-600 text-white', icon: <Search className="h-[19px] w-[19px]" aria-hidden /> },
  most_likely: { card: 'border-plum-100 bg-plum-50', chip: 'bg-plum-500 text-white', icon: <Users className="h-[19px] w-[19px]" aria-hidden /> },
  rate_it: { card: 'border-gold-100 bg-gold-50', chip: 'bg-gold-500 text-white', icon: <Star className="h-[19px] w-[19px]" aria-hidden /> },
};

/** Today's round of each couple game, as cards like the Draw tiles. */
export function DailyGames() {
  const on = useFeature('quizzes');
  const quizzes = useQuizzes(on);
  if (!on) return null;

  return (
    <section aria-labelledby="daily-games" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="daily-games" className="font-display text-heading text-ink">
          Daily games
        </h2>
        <span className="inline-flex items-center gap-1.5 text-micro font-semibold text-ink-muted">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          New ones every day
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {QUIZ_KINDS.map((kind) => (
          <GameTile key={kind} kind={kind} round={quizzes.today[kind]} loading={quizzes.loading} />
        ))}
      </div>
      {quizzes.error && !quizzes.rounds.length ? <p className="text-small text-rose-700">Couldn’t load today’s games. Pull to refresh or try again soon.</p> : null}
    </section>
  );
}

function GameTile({ kind, round, loading }: { kind: QuizKind; round: QuizRound | undefined; loading: boolean }) {
  const { me, partner } = useCouple();
  const t = TILE[kind];
  const name = partner.display_name;
  const state = round ? quizState(round) : null;
  const status =
    state === 'mine'
      ? { text: kind === 'know_me' && round!.subject_id === me.id ? 'Answer about you' : 'Your turn', dot: 'bg-rose-400', tone: 'text-rose-700' }
      : state === 'waiting'
        ? { text: `Waiting for ${name}`, dot: 'bg-ink-muted', tone: 'text-ink-muted' }
        : state === 'revealed'
          ? { text: 'Done · see results', dot: 'bg-sage-400', tone: 'text-sage-700' }
          : { text: loading ? 'Shuffling…' : 'Not ready yet', dot: 'bg-paper-edge', tone: 'text-ink-muted' };
  const line =
    state === 'revealed'
      ? kind === 'rate_it'
        ? `${rateGap(round!.my_answers, round!.partner_answers)} apart on average`
        : `${roundScore(round!)} of ${round!.questions.length} matched`
      : kind === 'know_me' && round
        ? round.subject_id === me.id
          ? `About you today`
          : `About ${name} today`
        : QUIZ_INFO[kind].blurb;

  const body = (
    <>
      <TileArt kind={kind} initial={(round?.subject_id === me.id ? me.display_name : name).slice(0, 1).toUpperCase()} />
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-[14px]', t.chip)}>{t.icon}</span>
      <span className="flex flex-col gap-1">
        <span className={cn('inline-flex items-center gap-1.5 text-[12px] font-semibold', status.tone)}>
          <span className={cn('h-[7px] w-[7px] shrink-0 rounded-full', status.dot)} />
          <span className="truncate">{status.text}</span>
        </span>
        <span className="font-display text-[17px] leading-[21px] text-ink md:text-[19px] md:leading-[23px]">{QUIZ_INFO[kind].title}</span>
        <span className="truncate text-micro text-ink-soft">{line}</span>
      </span>
    </>
  );
  const cls = cn(
    'relative isolate flex h-[176px] flex-col justify-between overflow-hidden rounded-[24px] border p-4 md:h-[200px] md:p-5',
    t.card,
  );

  if (!round) return <div className={cn(cls, 'opacity-70')}>{body}</div>;
  return (
    <Link
      href={`/connect/play/quiz/${round.id}`}
      className={cn(cls, 'transition-transform hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400')}
    >
      {body}
    </Link>
  );
}

/** The little picture in each card's corner. */
function TileArt({ kind, initial }: { kind: QuizKind; initial: string }) {
  if (kind === 'this_or_that') {
    return (
      <span aria-hidden className="absolute -right-3 top-3 -z-10 h-[66px] w-[92px]">
        <span className="absolute left-0 top-1 flex h-9 w-[54px] -rotate-[10deg] items-center justify-center rounded-[11px] bg-rose-400 text-[11px] font-bold text-white">Chai</span>
        <span className="absolute left-[34px] top-5 flex h-9 w-[58px] rotate-[8deg] items-center justify-center rounded-[11px] bg-teal-500 text-[11px] font-bold text-white">Coffee</span>
      </span>
    );
  }
  if (kind === 'know_me') {
    return (
      <span aria-hidden className="absolute right-3 top-3 -z-10 flex h-[58px] w-[58px] items-center justify-center rounded-full border-2 border-dashed border-teal-300">
        <span className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-teal-500 text-[16px] font-extrabold text-white">{initial}</span>
        <span className="absolute -bottom-1 -right-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-teal-50 bg-gold-400 text-[13px] font-extrabold text-gold-900">?</span>
      </span>
    );
  }
  if (kind === 'most_likely') {
    return (
      <span aria-hidden className="absolute right-3 top-4 -z-10 flex">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-plum-50 bg-rose-400 text-[14px] font-extrabold text-white">?</span>
        <span className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-plum-50 bg-teal-500 text-[14px] font-extrabold text-white">?</span>
      </span>
    );
  }
  return (
    <span aria-hidden className="absolute right-3.5 top-5 -z-10 h-[26px] w-[76px]">
      <span className="absolute inset-x-0 top-[11px] h-1 rounded-full bg-gold-100" />
      <span className="absolute left-3 top-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-rose-400 text-[10px] font-extrabold text-white">7</span>
      <span className="absolute left-11 top-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-teal-500 text-[10px] font-extrabold text-white">9</span>
    </span>
  );
}
