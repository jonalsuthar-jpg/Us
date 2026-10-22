'use client';

import { useCouple, useFeature } from '@us/shared/react';
import { FeatureOff } from '@/components/app/feature-off';
import { ModuleHeader } from '@/components/app/module-header';
import { MemoryTimeline } from '@/components/memory/timeline';
import { PrivacyBadge } from '@/components/ui/privacy';

export default function MemoryPage() {
  const { partner } = useCouple();
  const on = useFeature('memories');
  return (
    <div className="mx-auto max-w-6xl space-y-10 px-5 py-10 sm:px-10 sm:py-14">
      <ModuleHeader id="memory">
        <PrivacyBadge privacy="shared" partnerName={partner.display_name} />
      </ModuleHeader>
      {on ? <MemoryTimeline /> : <FeatureOff />}
    </div>
  );
}
