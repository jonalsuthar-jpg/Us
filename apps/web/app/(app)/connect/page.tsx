'use client';

import { moduleById, TOGETHER_SOON } from '@us/shared';
import { useCouple, useFeature } from '@us/shared/react';
import { BookOpen, Gamepad2, PenLine } from 'lucide-react';
import { FeatureOff } from '@/components/app/feature-off';
import { MobileSettingsLink } from '@/components/app/app-shell';
import { DailyQuestion } from '@/components/connect/daily-question';
import { TogetherCards } from '@/components/connect/together-cards';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';

const ACTIVITY = {
  draw: { Icon: PenLine, wash: 'bg-rose-50', fill: 'bg-rose-400 text-white', pill: 'text-rose-700' },
  games: { Icon: Gamepad2, wash: 'bg-gold-50', fill: 'bg-gold-400 text-gold-900', pill: 'text-gold-700' },
  read: { Icon: BookOpen, wash: 'bg-sage-50', fill: 'bg-sage-500 text-white', pill: 'text-sage-700' },
};

// TODO(phase-3): Fight Translator (Edge Function supabase/functions/fight-translator), Future Letters, Inside Jokes.
// Their tables and RLS are ready (20261022000000_connect.sql).
export default function ConnectPage() {
  const { partner, partnerSlot, partnerOnline } = useCouple();
  const mod = moduleById('connect');
  const soon = mod.features.filter((f) => f.soon);
  const daily = useFeature('daily_question');
  const calls = useFeature('calls');

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-5 py-8 sm:px-10 sm:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-micro font-semibold uppercase tracking-[0.08em] text-teal-700">Connect</p>
          <h1 className="mt-1 font-display text-title text-ink sm:text-[40px] sm:leading-[1.1]">Do something together</h1>
          <p className="mt-2 font-serif text-lead font-light italic text-ink-soft">{mod.tagline}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-paper-edge bg-paper-raised py-1.5 pl-1.5 pr-3.5">
            <Avatar name={partner.display_name} slot={partnerSlot} size="sm" online={partnerOnline} className="[&>span:first-child]:ring-0 [&>span:first-child]:ring-offset-0" />
            <span className="text-small text-ink-soft">
              <b className="font-semibold text-ink">{partner.display_name}</b> {partnerOnline ? 'is here now' : 'is away'}
            </span>
          </span>
          <MobileSettingsLink className="h-10 w-10" />
        </div>
      </header>

      {calls ? <TogetherCards /> : null}
      {daily ? <DailyQuestion /> : calls ? null : <FeatureOff />}

      <section aria-labelledby="more" className="space-y-3.5">
        <h2 id="more" className="font-display text-heading text-ink">
          More to do together
        </h2>
        <ul className="grid gap-3.5 sm:grid-cols-3">
          {TOGETHER_SOON.map((a) => {
            const look = ACTIVITY[a.id];
            return (
              <li key={a.id} className={cn('flex flex-col gap-3 rounded-[20px] p-5', look.wash)}>
                <div className="flex items-center justify-between">
                  <span className={cn('flex h-11 w-11 items-center justify-center rounded-[14px]', look.fill)}>
                    <look.Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className={cn('rounded-full bg-paper-raised px-2.5 py-1 text-micro font-semibold', look.pill)}>Soon</span>
                </div>
                <h3 className="font-display text-lead text-ink">{a.title}</h3>
                <p className="text-small text-ink-soft">{a.blurb}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="coming" className="space-y-3.5">
        <h2 id="coming" className="font-display text-heading text-ink">
          Coming to Connect
        </h2>
        <ul className="grid gap-3.5 sm:grid-cols-3">
          {soon.map((f) => (
            <li key={f.title} className="rounded-[20px] bg-paper-sunken px-5 py-4">
              <h3 className="font-display text-lead text-ink">{f.title}</h3>
              <p className="mt-1.5 text-small text-ink-soft">{f.blurb}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
