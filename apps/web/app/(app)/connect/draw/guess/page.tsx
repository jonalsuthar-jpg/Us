'use client';

import { useFeature } from '@us/shared/react';
import { FeatureOff } from '@/components/app/feature-off';
import { GuessGame } from '@/components/draw/guess-game';

export default function GuessPage() {
  const on = useFeature('draw');
  if (!on) return <FeatureOff />;
  return <GuessGame />;
}
