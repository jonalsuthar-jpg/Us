'use client';

import { useFeature } from '@us/shared/react';
import dynamic from 'next/dynamic';
import { FeatureOff } from '@/components/app/feature-off';

/** three.js and the house load only here, as their own chunk. */
const HouseView = dynamic(() => import('@/components/house/house-view').then((m) => m.HouseView), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#BFDDF2]">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/40 border-t-white" aria-label="Opening the house" />
    </div>
  ),
});

export default function HousePage() {
  const on = useFeature('house');
  if (!on) return <FeatureOff />;
  return <HouseView />;
}
