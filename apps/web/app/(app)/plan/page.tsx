'use client';

import { useCouple, useFeatures } from '@us/shared/react';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FeatureOff } from '@/components/app/feature-off';
import { ModuleHeader } from '@/components/app/module-header';
import { PlanCalendar } from '@/components/plan/calendar';
import { PlanCosts } from '@/components/plan/costs';
import { PlanDecide } from '@/components/plan/decide';
import { PlanHub, PLAN_SECTIONS, type PlanOpen, type PlanSection } from '@/components/plan/hub';
import { PlanLabour } from '@/components/plan/labour';
import { PlanLists } from '@/components/plan/lists';
import { PrivacyBadge } from '@/components/ui/privacy';

export default function PlanPage() {
  const { partner } = useCouple();
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
      <div className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-10 sm:py-14">
        <ModuleHeader id="plan">
          <PrivacyBadge privacy="shared" partnerName={partner.display_name} />
        </ModuleHeader>
        {sections.length ? <PlanHub sections={sections} onOpen={setOpen} /> : <FeatureOff />}
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
