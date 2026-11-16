'use client';

import { useCouple, useDailyDoodle, useDrawGames, useDrawings, usePartnerDrawing } from '@us/shared/react';
import { Clock, Lock, MessageCircleQuestion, PenLine, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { CoupleDoodle } from './art';
import { DoodleDialog } from './doodle-dialog';

/** Draw together and Draw & Guess, the two tiles at the top of Connect. */
export function DrawTiles() {
  const { partner, partnerOnline } = useCouple();
  const drawing = usePartnerDrawing();
  const { stats, toGuess, myTurnToDraw } = useDrawGames();
  const name = partner.display_name;
  const guessLine = toGuess ? 'Your turn to guess' : myTurnToDraw ? 'Your turn to draw' : stats.best ? `Best team score ${stats.best}` : 'Six rounds, one team';

  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4">
      <Link
        href="/connect/draw"
        className="relative isolate flex h-[176px] flex-col justify-between overflow-hidden rounded-[24px] border border-rose-100 bg-rose-50 p-4 transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 md:h-[200px] md:p-5"
      >
        <CoupleDoodle className="absolute -right-[18px] -top-[14px] -z-10 h-[140px] w-[105px] rotate-6 md:h-[170px] md:w-[128px]" />
        <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-rose-400 text-white">
          <PenLine className="h-[19px] w-[19px]" aria-hidden />
        </span>
        <span className="flex flex-col gap-1">
          {drawing || partnerOnline ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-sage-700">
              <span className="h-[7px] w-[7px] rounded-full bg-sage-400" />
              {drawing ? `${name} is drawing` : `${name} is online`}
            </span>
          ) : null}
          <span className="font-display text-[19px] leading-[23px] text-ink">Draw together</span>
          <span className="text-micro text-ink-soft">One canvas, live</span>
        </span>
      </Link>
      <Link
        href="/connect/draw/guess"
        className="relative isolate flex h-[176px] flex-col justify-between overflow-hidden rounded-[24px] border border-gold-100 bg-gold-50 p-4 transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 md:h-[200px] md:p-5"
      >
        <span aria-hidden className="absolute right-3 top-3.5 flex gap-1">
          <span className="h-6 w-[18px] border-b-[3px] border-gold-700" />
          <span className="h-6 w-[18px] border-b-[3px] border-gold-700 text-center text-[18px] font-bold leading-6 text-gold-700">a</span>
          <span className="h-6 w-[18px] border-b-[3px] border-gold-700" />
        </span>
        <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-gold-400 text-gold-900">
          <MessageCircleQuestion className="h-[19px] w-[19px]" aria-hidden />
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-[12px] font-semibold text-gold-700">{guessLine}</span>
          <span className="font-display text-[19px] leading-[23px] text-ink">Draw &amp; Guess</span>
          <span className="text-micro text-ink-soft">{stats.played ? `${stats.played} ${stats.played === 1 ? 'game' : 'games'} played` : 'Indian, Hinglish & your words'}</span>
        </span>
      </Link>
    </div>
  );
}

/** "Our drawings": a "Leave a doodle" tile first, then the latest drawings. */
export function DrawingsStrip() {
  const { partner } = useCouple();
  const { drawings, urls } = useDrawings();
  const [doodle, setDoodle] = useState(false);
  const shown = drawings.filter((d) => d.kind !== 'guess' || d.answered_at).slice(0, 8);

  return (
    <section aria-labelledby="our-drawings" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 id="our-drawings" className="font-display text-heading text-ink">
          Our drawings
        </h2>
        {drawings.length ? (
          <Link href="/connect/draw/gallery" className="text-small font-semibold text-rose-600 hover:text-rose-700">
            See all {drawings.length}
          </Link>
        ) : null}
      </div>
      <div className="scrollbar-quiet -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-2">
        <button
          type="button"
          aria-label={`Leave ${partner.display_name} a doodle`}
          onClick={() => setDoodle(true)}
          className="flex h-[112px] w-[84px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[16px] border-2 border-dashed border-rose-300 bg-rose-50 px-1 text-center text-micro font-bold text-rose-700 hover:bg-rose-100 md:h-[148px] md:w-[111px]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-400 text-white">
            <Plus className="h-[17px] w-[17px]" aria-hidden />
          </span>
          Leave a doodle
        </button>
        {shown.map((d, i) => (
          <Link
            key={d.id}
            href={`/connect/draw/gallery?d=${d.id}`}
            aria-label={d.title ?? 'A drawing'}
            className={cn(
              'block h-[112px] w-[84px] shrink-0 overflow-hidden rounded-[16px] border border-paper-edge bg-white shadow-[0_10px_22px_-18px_rgba(36,25,51,0.6)] transition-transform hover:-translate-y-0.5 md:h-[148px] md:w-[111px]',
              i >= 5 && 'hidden md:block',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {urls[d.png_path] ? <img src={urls[d.png_path]} alt="" className="h-full w-full object-cover" /> : null}
          </Link>
        ))}
        {!shown.length ? <p className="self-center px-2 font-serif text-small italic text-ink-soft">Your doodles collect here.</p> : null}
      </div>
      <DoodleDialog open={doodle} onOpenChange={setDoodle} />
    </section>
  );
}

/** Today's doodle prompt: my frame and theirs. Theirs stays hidden until I've drawn mine. */
export function DailyDoodleCard() {
  const { me, partner } = useCouple();
  const daily = useDailyDoodle();
  const name = partner.display_name;
  const mine = daily.drawings.find((d) => d.created_by === me.id);
  const theirs = daily.drawings.find((d) => d.created_by !== me.id);
  const cta = daily.mine && daily.partner ? 'See side by side' : daily.mine ? `Waiting for ${name}` : 'Draw it';

  return (
    <section aria-labelledby="todays-doodle" className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="todays-doodle" className="font-display text-heading text-ink">
          Today’s doodle
        </h2>
        <span className="text-micro font-semibold text-ink-muted">New prompt every day</span>
      </div>
      <div className="space-y-4 rounded-[26px] border border-rose-100 bg-rose-50 p-4 sm:p-6">
        <div className="space-y-1">
          <p className="text-micro font-bold text-rose-700">Draw it, then see theirs</p>
          <p className="font-serif text-[26px] leading-[1.2] text-ink">“{daily.prompt}”</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
          <DoodleFrame who="You" dot="bg-rose-400">
            {daily.mine ? (
              <Thumb url={mine ? daily.urls[mine.png_path] : undefined} />
            ) : (
              <Link
                href="/connect/draw/daily"
                className="flex h-full flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-rose-300 bg-paper-raised text-small font-bold text-rose-700 hover:bg-rose-50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-rose-400 text-white">
                  <PenLine className="h-[19px] w-[19px]" aria-hidden />
                </span>
                Draw yours
              </Link>
            )}
          </DoodleFrame>
          <DoodleFrame who={name} dot="bg-teal-500">
            {daily.partner && daily.mine ? (
              <Thumb url={theirs ? daily.urls[theirs.png_path] : undefined} />
            ) : daily.partner ? (
              <div className="relative flex h-full items-center justify-center overflow-hidden rounded-[18px] border border-paper-edge bg-white">
                <CoupleDoodle className="h-24 w-20 opacity-60 blur-md" />
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2 text-center text-micro font-bold text-teal-700">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-600 text-white">
                    <Lock className="h-4 w-4" aria-hidden />
                  </span>
                  Drawn · draw yours to see
                </span>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-[18px] border border-paper-edge bg-paper-raised text-micro font-semibold text-ink-muted">
                <Clock className="h-5 w-5" aria-hidden />
                Waiting for {name}
              </div>
            )}
          </DoodleFrame>
        </div>
        {daily.mine && !daily.partner ? (
          <p className="flex h-12 items-center justify-center rounded-full border border-paper-edge bg-paper-raised text-small font-semibold text-ink-muted">{cta}</p>
        ) : (
          <Link
            href="/connect/draw/daily"
            className="flex h-12 items-center justify-center rounded-full bg-rose-600 text-small font-bold text-white hover:bg-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            {cta}
          </Link>
        )}
      </div>
    </section>
  );
}

function DoodleFrame({ who, dot, children }: { who: string; dot: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="h-[168px] sm:h-[220px]">{children}</div>
      <p className="inline-flex items-center gap-1.5 text-micro font-bold text-ink">
        <span className={cn('h-[7px] w-[7px] rounded-full', dot)} />
        {who}
      </p>
    </div>
  );
}

function Thumb({ url }: { url: string | undefined }) {
  return (
    <div className="h-full overflow-hidden rounded-[18px] border border-paper-edge bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" className="h-full w-full object-contain" /> : null}
    </div>
  );
}
