'use client';

import { useFeature } from '@us/shared/react';
import { use } from 'react';
import { FeatureOff } from '@/components/app/feature-off';
import { QuizScreen } from '@/components/games/quiz-screen';

export default function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const on = useFeature('quizzes');
  if (!on) return <FeatureOff />;
  return <QuizScreen id={id} />;
}
