'use client';

import { useCouple, useFeatures } from '@us/shared/react';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FeatureOff } from '@/components/app/feature-off';
import { MobileSettingsLink } from '@/components/app/app-shell';
import { PlanCalendar } from '@/components/plan/calendar';
import { PlanCosts } from '@/components/plan/costs';
import { PlanDecide } from '@/components/plan/decide';
import { PlanHub, PLAN_SECTIONS, type PlanOpen, type PlanSection } from '@/components/plan/hub';
import { PlanLabour } from '@/components/plan/labour';
import { PlanLists } from '@/components/plan/lists';
import { SunsetBanner } from '@/components/plan/art';
import { Initial } from '@/components/plan/bits';

export default function PlanPage() {
  const { me, partner, mySlot, partnerSlot } = useCouple();
  const has = useFeatures();
  const sections = (Object.keys(PLAN_SECTIONS) as PlanSection[]).filter((s) => has(PLAN_SECTIONS[s].feature));
  const [open, setOpenState] = useState<PlanOpen | null>(null);
  const current = open && sections.includes(open.section) ? open : sections.length === 1 ? { section: sections[0]! } : null;

  // Opening a section is a history step, so the browser's back button returns to the hub.
  const setOpen = (next: PlanOpen | null) => {
    if (next && !open) window.history.pushState({ planSection: true }, '');
    if (!next && open && window.history.state?.planSection) return window.history.back();
    setOpenState(next);
  };
  useEffect(() => {
    const onPop = () => setOpenState(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => {
    if (open) window.scrollTo({ top: 0 });
  }, [open?.section]);

  if (!current)
    return (
      <div className="min-h-full bg-[#F6F2FA] pb-12 dark:bg-paper">
        {/* Dusk over the hills; the week card rises over its foot. */}
        <header className="relative h-[230px] overflow-hidden sm:h-[260px]">
          <SunsetBanner className="absolute inset-0 h-full w-full" />
          <div className="relative mx-auto flex max-w-3xl items-start justify-between gap-4 px-5 pt-7 sm:px-8 sm:pt-10">
            <div>
              <p className="text-body font-medium text-white/90">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
              <h1 className="mt-1 font-display text-[48px] font-extrabold leading-[1.05] text-white drop-shadow-[0_2px_8px_rgba(36,25,51,0.25)] sm:text-[56px]">Plan</h1>
              <span aria-hidden className="mt-2 block h-1 w-14 rounded-full bg-rose-500" />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/85 py-1.5 pl-1.5 pr-4 shadow-[0_8px_20px_-12px_rgba(36,25,51,0.6)] backdrop-blur" title={`Shared with ${partner.display_name}`}>
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
        <div className="relative mx-auto -mt-14 max-w-3xl px-4 sm:-mt-16 sm:px-8">{sections.length ? <PlanHub sections={sections} onOpen={setOpen} /> : <FeatureOff />}</div>
      </div>
    );

  const props = { adding: current.adding, onAdded: () => setOpenState({ section: current.section }) };
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-5 py-8 sm:px-10 sm:py-12">
      <header className="space-y-1">
        {sections.length > 1 ? (
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="-ml-1.5 inline-flex h-10 items-center gap-0.5 rounded-control px-1.5 font-medium text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <ChevronLeft className="h-5 w-5" /> Plan
          </button>
        ) : null}
        <h1 className="font-display text-[34px] leading-tight text-ink sm:text-[42px]">{PLAN_SECTIONS[current.section].title}</h1>
      </header>
      <div key={current.section}>
        {current.section === 'calendar' && <PlanCalendar {...props} />}
        {current.section === 'lists' && <PlanLists onPick={sections.includes('decide') ? (category) => setOpenState({ section: 'decide', category }) : undefined} />}
        {current.section === 'decide' && <PlanDecide initialCategory={current.category} />}
        {current.section === 'labour' && <PlanLabour {...props} />}
        {current.section === 'costs' && <PlanCosts {...props} />}
      </div>
    </div>
  );
}
