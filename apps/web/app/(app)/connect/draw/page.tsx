'use client';

import { useFeature } from '@us/shared/react';
import { FeatureOff } from '@/components/app/feature-off';
import { LiveCanvas } from '@/components/draw/live-canvas';

export default function DrawPage() {
  const on = useFeature('draw');
  if (!on) return <FeatureOff />;
  return <LiveCanvas />;
}
