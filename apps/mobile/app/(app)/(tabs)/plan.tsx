import { useCouple } from '@us/shared/react';
import { useState } from 'react';
import { ModuleScreen } from '@/components/module-screen';
import { PlanCalendar } from '@/components/plan/calendar';
import { PlanCosts } from '@/components/plan/costs';
import { PlanDecide } from '@/components/plan/decide';
import { PlanLabour } from '@/components/plan/labour';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Segmented } from '@/components/ui/segmented';

type Tab = 'calendar' | 'decide' | 'labour' | 'costs';

export default function Plan() {
  const { partner } = useCouple();
  const [tab, setTab] = useState<Tab>('calendar');
  return (
    <ModuleScreen id="plan" aside={<PrivacyBadge privacy="shared" partnerName={partner.display_name} />}>
      <Segmented
        label="Plan section"
        options={[
          { value: 'calendar', label: 'Calendar' },
          { value: 'decide', label: 'Decide' },
          { value: 'labour', label: 'Labour' },
          { value: 'costs', label: 'Costs' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'calendar' && <PlanCalendar />}
      {tab === 'decide' && <PlanDecide />}
      {tab === 'labour' && <PlanLabour />}
      {tab === 'costs' && <PlanCosts />}
    </ModuleScreen>
  );
}
