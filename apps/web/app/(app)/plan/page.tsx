'use client';

import { useCouple } from '@us/shared/react';
import { useState } from 'react';
import { ModuleHeader } from '@/components/app/module-header';
import { PlanCalendar } from '@/components/plan/calendar';
import { PlanCosts } from '@/components/plan/costs';
import { PlanDecide } from '@/components/plan/decide';
import { PlanLabour } from '@/components/plan/labour';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Segmented } from '@/components/ui/segmented';

type Tab = 'calendar' | 'decide' | 'labour' | 'costs';

const TABS: { value: Tab; label: string }[] = [
  { value: 'calendar', label: 'Calendar' },
  { value: 'decide', label: 'Decide' },
  { value: 'labour', label: 'Labour' },
  { value: 'costs', label: 'Costs' },
];

export default function PlanPage() {
  const { partner } = useCouple();
  const [tab, setTab] = useState<Tab>('calendar');

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-10 sm:py-14">
      <ModuleHeader id="plan">
        <PrivacyBadge privacy="shared" partnerName={partner.display_name} />
      </ModuleHeader>
      <Segmented label="Plan section" options={TABS} value={tab} onChange={setTab} className="w-full sm:w-auto" />
      {tab === 'calendar' && <PlanCalendar />}
      {tab === 'decide' && <PlanDecide />}
      {tab === 'labour' && <PlanLabour />}
      {tab === 'costs' && <PlanCosts />}
    </div>
  );
}
