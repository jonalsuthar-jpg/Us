import { useFeature } from '@us/shared/react';
import { GuessGame } from '@/components/draw/guess-game';
import { FeatureOff } from '@/components/feature-off';

export default function GuessScreen() {
  const on = useFeature('draw');
  if (!on) return <FeatureOff />;
  return <GuessGame />;
}
