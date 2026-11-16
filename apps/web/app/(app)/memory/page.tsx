'use client';

import { useCouple, useFeature } from '@us/shared/react';
import { FeatureOff } from '@/components/app/feature-off';
import { MobileSettingsLink } from '@/components/app/app-shell';
import { GoldenBanner } from '@/components/memory/art';
import { MemoryTimeline } from '@/components/memory/timeline';
import { Initial } from '@/components/plan/bits';

export default function MemoryPage() {
  const { me, partner, mySlot, partnerSlot } = useCouple();
  const on = useFeature('memories');
  return (
    <div className="min-h-full bg-[#FFF6F1] pb-12 dark:bg-paper">
      {/* Golden hour, fairy lights and polaroids; the story card rises over its foot. */}
      <header className="relative h-[230px] overflow-hidden sm:h-[260px]">
        <GoldenBanner className="absolute inset-0 h-full w-full" />
        <div className="relative mx-auto flex max-w-4xl items-start justify-between gap-4 px-5 pt-7 sm:px-8 sm:pt-10">
          <div>
            <p className="text-body font-medium text-white/95">Our little story, kept together</p>
            <h1 className="mt-1 font-display text-[48px] font-extrabold leading-[1.05] text-white drop-shadow-[0_2px_8px_rgba(122,75,58,0.3)] sm:text-[56px]">Memory</h1>
            <span aria-hidden className="mt-2 block h-1 w-14 rounded-full bg-gold-400" />
          </div>
          <div className="flex items-center gap-2 pt-20 sm:pt-6">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/85 py-1.5 pl-1.5 pr-4 shadow-[0_8px_20px_-12px_rgba(122,75,58,0.6)] backdrop-blur" title={`Shared with ${partner.display_name}`}>
              <span className="flex">
                <Initial slot={mySlot} name={me.display_name} size={30} />
                <span className="-ml-1.5 rounded-full ring-2 ring-white">
                  <Initial slot={partnerSlot} name={partner.display_name} size={30} />
                </span>
              </span>
              <span className="text-small font-semibold text-ink-soft">Shared</span>
            </span>
            <MobileSettingsLink className="h-10 w-10" />
          </div>
        </div>
      </header>
      <div className="relative mx-auto -mt-14 max-w-4xl px-4 sm:-mt-16 sm:px-8">{on ? <MemoryTimeline /> : <FeatureOff />}</div>
    </div>
  );
}
