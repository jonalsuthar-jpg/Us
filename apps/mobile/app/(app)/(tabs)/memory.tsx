import { useCouple, useFeature } from '@us/shared/react';
import { FeatureOff } from '@/components/feature-off';
import { MemoryTimeline } from '@/components/memory/timeline';
import { ModuleScreen } from '@/components/module-screen';
import { PrivacyBadge } from '@/components/ui/privacy';

export default function Memory() {
  const { partner } = useCouple();
  const on = useFeature('memories');
  return (
    <ModuleScreen id="memory" aside={<PrivacyBadge privacy="shared" partnerName={partner.display_name} />}>
      {on ? <MemoryTimeline /> : <FeatureOff />}
    </ModuleScreen>
  );
}
