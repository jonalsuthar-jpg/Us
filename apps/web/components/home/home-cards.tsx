'use client';

import { dailyState, daysUntil, formatEventTime, toDateKey, whenLabel, type HomeData } from '@us/shared';
import { useCouple } from '@us/shared/react';
import { ChevronRight, Mail, Star } from 'lucide-react';
import Link from 'next/link';
import { useDaily } from '@/components/connect/daily-question';
import { DinnerArt } from '@/components/plan/art';

/** The next plan, on a dark card with a candlelit table: the same look as Plan's "Next up". */
export function NextUpCard({ event }: { event: HomeData['nextEvent'] }) {
  const { me, partner } = useCouple();
  const at = event ? new Date(event.starts_at) : null;
  return (
    <Link
      href="/plan"
      className="relative flex h-full min-h-[112px] items-center gap-3.5 overflow-hidden rounded-[26px] bg-gradient-to-r from-[#3A2A5E] to-[#4B3468] p-4 text-white shadow-[0_18px_34px_-22px_rgba(36,25,51,0.9)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
    >
      <DinnerArt className="pointer-events-none absolute -right-2 bottom-0 h-[80px] w-[130px] opacity-90" />
      {at && event ? (
        <>
          <span className="relative flex h-16 w-[58px] shrink-0 flex-col items-center justify-center rounded-[16px] bg-white/10">
            <span className="text-micro font-extrabold uppercase text-gold-300">{at.toLocaleDateString(undefined, { weekday: 'short' })}</span>
            <span className="text-[24px] font-extrabold leading-7">{at.getDate()}</span>
          </span>
          <span className="relative min-w-0 flex-1 pr-16">
            <span className="block text-micro font-bold text-gold-300">Next up · {whenLabel(daysUntil(toDateKey(at))).toLowerCase()}</span>
            <span className="block truncate text-[18px] font-extrabold">{event.title}</span>
            <span className="block truncate text-micro text-white/80">
              {formatEventTime(event)} · {event.created_by === me.id ? 'you planned it' : `${partner.display_name} planned it`}
            </span>
          </span>
        </>
      ) : (
        <span className="relative min-w-0 flex-1 pr-20">
          <span className="block text-micro font-bold text-gold-300">Next up</span>
          <span className="block text-[18px] font-extrabold">Nothing planned yet</span>
          <span className="block text-micro text-white/80">Plan a date, a trip, or a quiet night in.</span>
        </span>
      )}
    </Link>
  );
}

/** A memory to look back on: its photo (or golden hills) with an "On this day" badge, the title under it. */
export function MemoryCard({ memory, photoUrl }: { memory: HomeData['memory']; photoUrl: string | null | undefined }) {
  return (
    <Link
      href="/memory"
      className="group block h-full overflow-hidden rounded-[26px] border border-paper-edge bg-paper-raised shadow-[0_18px_36px_-26px_rgba(99,72,130,0.55)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
    >
      <span className="relative block h-[150px] overflow-hidden bg-gradient-to-br from-[#F4AE8C] to-[#E98A78]">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <svg aria-hidden viewBox="0 0 354 150" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
            <circle cx="80" cy="104" r="56" fill="#FFE4A8" opacity=".5" />
            <path d="M0 122 L90 76 L170 114 L260 66 L354 104 V150 H0Z" fill="#7A4B3A" opacity=".35" />
            <path d="M0 140 Q120 112 240 138 T354 132 V150 H0Z" fill="#7A4B3A" opacity=".5" />
          </svg>
        )}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-micro font-extrabold text-gold-700">
          <Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" aria-hidden />
          {memory?.yearsAgo ? `On this day · ${memory.yearsAgo} ${memory.yearsAgo === 1 ? 'year' : 'years'} ago` : 'A memory'}
        </span>
      </span>
      <span className="flex items-center gap-3 p-4">
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-[17px] font-extrabold leading-[22px] text-ink">{memory ? memory.title : 'Keep your first memory'}</span>
          <span className="block text-small text-ink-soft">{memory ? 'Tap to relive it' : 'A photo, a line, the date — the start of your story.'}</span>
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper-sunken text-ink-muted">
          <ChevronRight className="h-4 w-4" aria-hidden />
        </span>
      </span>
    </Link>
  );
}

/** Today's question itself, in mint with an envelope, and what's next: answer it, wait, or read both. */
export function QuestionCard() {
  const daily = useDaily();
  const today = daily.data?.today;
  const state = today ? dailyState(today) : null;
  const action = state === 'revealed' ? 'Read' : state === 'waiting' ? 'Waiting' : 'Answer';
  return (
    <Link
      href="/connect"
      className="flex h-full items-center gap-3.5 rounded-[26px] border border-teal-100 bg-gradient-to-br from-[#D8F5EE] to-[#F1FCF9] p-4 shadow-[0_18px_36px_-26px_rgba(10,119,109,0.6)] transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 dark:border-paper-edge dark:from-teal-50 dark:to-paper-raised"
    >
      <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[17px] bg-teal-600 text-white shadow-[0_6px_14px_-8px_rgba(10,119,109,0.8)]">
        <Mail className="h-6 w-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-micro font-bold text-teal-700">Connect · Today’s question</span>
        <span className="line-clamp-3 block font-serif text-[16px] leading-[21px] text-ink">{today?.prompt ?? 'One question a day. Your answers open once you’ve both replied.'}</span>
      </span>
      <span className={action === 'Waiting' ? 'shrink-0 rounded-full bg-paper-sunken px-3 py-2 text-micro font-extrabold text-ink-muted' : 'shrink-0 rounded-full bg-teal-600 px-3 py-2 text-micro font-extrabold text-white'}>
        {action}
      </span>
    </Link>
  );
}
