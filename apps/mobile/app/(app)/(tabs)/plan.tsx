import { useCouple } from '@us/shared/react';
import { useState } from 'react';
import { ModuleScreen } from '@/components/module-screen';
import { PlanCalendar } from '@/components/plan/calendar';
import { PlanCosts } from '@/components/plan/costs';
import { PlanDecide } from '@/components/plan/decide';
import { PlanLabour } from '@/components/plan/labour';
import { PlanLists } from '@/components/plan/lists';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Segmented } from '@/components/ui/segmented';

type Tab = 'calendar' | 'lists' | 'decide' | 'labour' | 'costs';

export default function Plan() {
  const { partner } = useCouple();
  const [tab, setTab] = useState<Tab>('calendar');
  return (
    <ModuleScreen id="plan" aside={<PrivacyBadge privacy="shared" partnerName={partner.display_name} />}>
      <Segmented
        label="Plan section"
        size="sm"
        options={[
          { value: 'calendar', label: 'Calendar' },
          { value: 'lists', label: 'Lists' },
          { value: 'decide', label: 'Decide' },
          { value: 'labour', label: 'Labour' },
          { value: 'costs', label: 'Costs' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'calendar' && <PlanCalendar />}
      {tab === 'lists' && <PlanLists />}
      {tab === 'decide' && <PlanDecide />}
      {tab === 'labour' && <PlanLabour />}
      {tab === 'costs' && <PlanCosts />}
    </ModuleScreen>
  );
}
