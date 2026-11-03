import { useFeature } from '@us/shared/react';
import { useLocalSearchParams } from 'expo-router';
import { FeatureOff } from '@/components/feature-off';
import { GameScreen } from '@/components/games/game-screen';

export default function GameRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const on = useFeature('games');
  if (!on) return <FeatureOff />;
  return <GameScreen id={id} />;
}
