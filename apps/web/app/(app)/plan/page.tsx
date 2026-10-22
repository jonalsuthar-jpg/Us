'use client';

import type { FeatureKey } from '@us/shared';
import { useCouple, useFeatures } from '@us/shared/react';
import { useState } from 'react';
import { FeatureOff } from '@/components/app/feature-off';
import { ModuleHeader } from '@/components/app/module-header';
import { PlanCalendar } from '@/components/plan/calendar';
import { PlanCosts } from '@/components/plan/costs';
import { PlanDecide } from '@/components/plan/decide';
import { PlanLabour } from '@/components/plan/labour';
import { PlanLists } from '@/components/plan/lists';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Segmented } from '@/components/ui/segmented';

type Tab = 'calendar' | 'lists' | 'decide' | 'labour' | 'costs';

const TABS: { value: Tab; label: string; feature: FeatureKey }[] = [
  { value: 'calendar', label: 'Calendar', feature: 'calendar' },
  { value: 'lists', label: 'Lists', feature: 'lists' },
  { value: 'decide', label: 'Decide', feature: 'decide' },
  { value: 'labour', label: 'Labour', feature: 'labour' },
  { value: 'costs', label: 'Costs', feature: 'costs' },
];

export default function PlanPage() {
  const { partner } = useCouple();
  const has = useFeatures();
  const tabs = TABS.filter((t) => has(t.feature));
  const [picked, setTab] = useState<Tab>('calendar');
  const tab = tabs.some((t) => t.value === picked) ? picked : tabs[0]?.value;

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-10 sm:py-14">
      <ModuleHeader id="plan">
        <PrivacyBadge privacy="shared" partnerName={partner.display_name} />
      </ModuleHeader>
      {!tab && <FeatureOff />}
      {tab && tabs.length > 1 && <Segmented label="Plan section" options={tabs} value={tab} onChange={setTab} className="w-full sm:w-auto" />}
      {tab === 'calendar' && <PlanCalendar />}
      {tab === 'lists' && <PlanLists />}
      {tab === 'decide' && <PlanDecide />}
      {tab === 'labour' && <PlanLabour />}
      {tab === 'costs' && <PlanCosts />}
    </div>
  );
}
