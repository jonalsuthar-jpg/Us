'use client';

import { useFeature } from '@us/shared/react';
import dynamic from 'next/dynamic';
import { FeatureOff } from '@/components/app/feature-off';

/** three.js and the island load only here, as their own chunk. */
const IsleView = dynamic(() => import('@/components/isle/isle-view').then((m) => m.IsleView), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#A9D8E8]">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/40 border-t-white" aria-label="Opening the island" />
    </div>
  ),
});

export default function IslePage() {
  const on = useFeature('isle');
  if (!on) return <FeatureOff />;
  return <IsleView />;
}
