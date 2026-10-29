'use client';

import { useCouple, useDailyDoodle, useDrawGames, useDrawings, usePartnerDrawing } from '@us/shared/react';
import { MessageCircleQuestion, PenLine, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
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
        className="relative isolate flex h-[200px] flex-col justify-between overflow-hidden rounded-[26px] border border-rose-100 bg-rose-50 p-4 transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 md:h-[220px] md:p-5"
      >
        <CoupleDoodle className="absolute -right-[18px] -top-[14px] -z-10 h-[160px] w-[120px] rotate-6 md:h-[190px] md:w-[142px]" />
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
        className="relative isolate flex h-[200px] flex-col justify-between overflow-hidden rounded-[26px] border border-gold-100 bg-gold-50 p-4 transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 md:h-[220px] md:p-5"
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

/** "Our drawings" strip with a "Leave a doodle" tile at the end. */
export function DrawingsStrip() {
  const { partner } = useCouple();
  const { drawings, urls } = useDrawings();
  const [doodle, setDoodle] = useState(false);
  const shown = drawings.filter((d) => d.kind !== 'guess' || d.answered_at).slice(0, 5);

  return (
    <section aria-labelledby="our-drawings" className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <h2 id="our-drawings" className="font-display text-heading text-ink">
          Our drawings
        </h2>
        {drawings.length ? (
          <Link href="/connect/draw/gallery" className="text-body font-semibold text-rose-600 hover:text-rose-700">
            See all {drawings.length}
          </Link>
        ) : null}
      </div>
      <div className="scrollbar-quiet -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
        {shown.map((d, i) => (
          <Link
            key={d.id}
            href={`/connect/draw/gallery?d=${d.id}`}
            aria-label={d.title ?? 'A drawing'}
            className={cn(
              'block h-[120px] w-[90px] shrink-0 overflow-hidden rounded-[14px] border border-paper-edge bg-white md:h-[160px] md:w-[120px]',
              i >= 3 && 'hidden md:block',
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {urls[d.png_path] ? <img src={urls[d.png_path]} alt="" className="h-full w-full object-cover" /> : null}
          </Link>
        ))}
        <button
          type="button"
          aria-label={`Leave ${partner.display_name} a doodle`}
          onClick={() => setDoodle(true)}
          className="flex h-[120px] w-[90px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed border-rose-300 text-center text-micro font-semibold text-rose-600 hover:bg-rose-50 md:h-[160px] md:w-[120px]"
        >
          <Plus className="h-[22px] w-[22px]" aria-hidden />
          Leave a doodle
        </button>
      </div>
      <DoodleDialog open={doodle} onOpenChange={setDoodle} />
    </section>
  );
}

/** Today's doodle prompt, revealed when we've both drawn it. */
export function DailyDoodleCard() {
  const { partner } = useCouple();
  const daily = useDailyDoodle();
  const name = partner.display_name;
  const line = daily.mine && daily.partner
    ? 'You both drew it. Tap to see them side by side.'
    : daily.mine
      ? `Yours is in. ${name}’s shows here when they draw theirs.`
      : daily.partner
        ? `${name} drew theirs. Draw yours to see it.`
        : `Draw it, then see ${name}’s.`;
  return (
    <Link href="/connect/draw/daily" className="flex flex-col gap-1 rounded-[20px] bg-paper-sunken px-4 py-3.5 hover:bg-paper-edge/60">
      <span className="text-body font-semibold text-ink">Today’s doodle: “{daily.prompt}”</span>
      <span className="text-small text-ink-soft">{line}</span>
    </Link>
  );
}
