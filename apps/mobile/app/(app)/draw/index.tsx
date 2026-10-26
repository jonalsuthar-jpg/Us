import { useFeature } from '@us/shared/react';
import { LiveBoard } from '@/components/draw/live-board';
import { FeatureOff } from '@/components/feature-off';

export default function DrawScreen() {
  const on = useFeature('draw');
  if (!on) return <FeatureOff />;
  return <LiveBoard />;
}
