'use client';

import { useFeature } from '@us/shared/react';
import { FeatureOff } from '@/components/app/feature-off';
import { AnswersArchive } from '@/components/connect/answers-archive';

export default function QuestionsPage() {
  const daily = useFeature('daily_question');
  return daily ? <AnswersArchive /> : <FeatureOff />;
}
