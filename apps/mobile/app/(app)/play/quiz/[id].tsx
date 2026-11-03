import { useFeature } from '@us/shared/react';
import { useLocalSearchParams } from 'expo-router';
import { FeatureOff } from '@/components/feature-off';
import { QuizScreen } from '@/components/games/quiz-screen';

export default function QuizRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const on = useFeature('quizzes');
  if (!on) return <FeatureOff />;
  return <QuizScreen id={id} />;
}
