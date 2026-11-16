'use client';

import { useFeature } from '@us/shared/react';
import { FeatureOff } from '@/components/app/feature-off';
import { MobileSettingsLink } from '@/components/app/app-shell';
import { ConnectRows } from '@/components/connect/connect-rows';

// TODO(phase-3): Fight Translator (Edge Function supabase/functions/fight-translator), Future Letters, Inside Jokes.
// Their tables and RLS are ready (20261022000000_connect.sql).
export default function ConnectPage() {
  const daily = useFeature('daily_question');
  const draw = useFeature('draw');
  const quizzes = useFeature('quizzes');

  return (
    <div className="mx-auto max-w-4xl px-4 py-7 sm:px-10 sm:py-12">
      {daily || draw || quizzes ? <ConnectRows settings={<MobileSettingsLink className="h-10 w-10" />} /> : <FeatureOff />}
    </div>
  );
}
