'use client';

import { useFeature } from '@us/shared/react';
import { use } from 'react';
import { FeatureOff } from '@/components/app/feature-off';
import { GameScreen } from '@/components/games/game-screen';

export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const on = useFeature('games');
  if (!on) return <FeatureOff />;
  return <GameScreen id={id} />;
}
