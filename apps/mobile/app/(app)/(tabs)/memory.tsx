import { useCouple } from '@us/shared/react';
import { MemoryTimeline } from '@/components/memory/timeline';
import { ModuleScreen } from '@/components/module-screen';
import { PrivacyBadge } from '@/components/ui/privacy';

export default function Memory() {
  const { partner } = useCouple();
  return (
    <ModuleScreen id="memory" aside={<PrivacyBadge privacy="shared" partnerName={partner.display_name} />}>
      <MemoryTimeline />
    </ModuleScreen>
  );
}
