'use client';

import { useFeature } from '@us/shared/react';
import { FeatureOff } from '@/components/app/feature-off';
import { DailyDoodle } from '@/components/draw/daily';

export default function DailyDoodlePage() {
  const on = useFeature('draw');
  if (!on) return <FeatureOff />;
  return <DailyDoodle />;
}
