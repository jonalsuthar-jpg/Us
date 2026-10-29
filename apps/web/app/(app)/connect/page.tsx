'use client';

import { moduleById } from '@us/shared';
import { useCouple, useFeature } from '@us/shared/react';
import { FeatureOff } from '@/components/app/feature-off';
import { MobileSettingsLink } from '@/components/app/app-shell';
import { DailyQuestion } from '@/components/connect/daily-question';
import { DailyDoodleCard, DrawingsStrip, DrawTiles } from '@/components/draw/connect-draw';
import { Avatar } from '@/components/ui/avatar';

// TODO(phase-3): Fight Translator (Edge Function supabase/functions/fight-translator), Future Letters, Inside Jokes.
// Their tables and RLS are ready (20261022000000_connect.sql).
export default function ConnectPage() {
  const { partner, partnerSlot, partnerOnline } = useCouple();
  const mod = moduleById('connect');
  const daily = useFeature('daily_question');
  const draw = useFeature('draw');

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:space-y-8 sm:px-10 sm:py-12">
      <header className="flex items-center gap-3 sm:items-end">
        <div className="min-w-0 flex-1">
          <p className="text-micro font-semibold uppercase tracking-[0.08em] text-teal-700">Connect</p>
          <h1 className="mt-0.5 font-display text-title text-ink sm:mt-1 sm:text-[40px] sm:leading-[1.1]">Do something together</h1>
          <p className="mt-2 hidden font-serif text-lead font-light italic text-ink-soft sm:block">{mod.tagline}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-2.5 rounded-full border border-paper-edge bg-paper-raised py-1.5 pl-1.5 pr-3.5 sm:inline-flex">
            <Avatar name={partner.display_name} slot={partnerSlot} size="sm" online={partnerOnline} className="[&>span:first-child]:ring-0 [&>span:first-child]:ring-offset-0" />
            <span className="text-small text-ink-soft">
              <b className="font-semibold text-ink">{partner.display_name}</b> {partnerOnline ? 'is here now' : 'is away'}
            </span>
          </span>
          <MobileSettingsLink className="h-10 w-10" />
        </div>
      </header>

      {draw ? (
        <>
          <DrawTiles />
          <DrawingsStrip />
          <DailyDoodleCard />
        </>
      ) : null}
      {daily ? <DailyQuestion /> : draw ? null : <FeatureOff />}
    </div>
  );
}
