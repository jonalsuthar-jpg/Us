import { QUIZ_INFO, quizState, type QuizKind } from '@us/shared';
import { useCouple, useFeature, useQuizzes } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { cn } from '../ui/cn';
import { FormSheet } from '../ui/form-sheet';
import { Display, Text } from '../ui/text';

const QUIZ_TINT: Record<QuizKind, string> = {
  know_me: 'border-teal-100 bg-teal-50',
  this_or_that: 'border-sage-100 bg-sage-50',
};

/** Connect's quizzes: the two to start, and any round waiting on one of us. */
export function PlaySection() {
  const on = useFeature('quizzes');
  const { me, partner } = useCouple();
  const quizzes = useQuizzes(on);
  const [busy, setBusy] = useState(false);
  const [knowMe, setKnowMe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!on) return null;

  const openQuiz = async (kind: QuizKind, subject?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      router.push(`/play/quiz/${await quizzes.start(kind, subject)}` as never);
    } catch {
      setError('Couldn’t start that. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const waiting = quizzes.rounds
    .filter((r) => quizState(r) !== 'revealed')
    .map((r) => ({ round: r, mine: quizState(r) === 'mine' }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || b.round.created_at.localeCompare(a.round.created_at));

  return (
    <View className="gap-3">
      <Display className="text-heading">Quizzes</Display>

      {waiting.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2.5">
          {waiting.slice(0, 8).map(({ round: r, mine }) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              onPress={() => router.push(`/play/quiz/${r.id}` as never)}
              className={cn('rounded-[18px] border px-3.5 py-2.5 active:opacity-80', mine ? 'border-rose-200 bg-rose-50' : 'border-paper-edge bg-paper-raised')}
            >
              <Text className="font-sans-semibold text-small text-ink">{`${QUIZ_INFO[r.kind].emoji} ${r.kind === 'know_me' ? 'Know me' : 'This or that'}`}</Text>
              <Text className={cn('text-micro', mine ? 'font-sans-semibold text-rose-700' : 'text-ink-soft')}>{mine ? 'Your turn to answer' : `Waiting for ${partner.display_name}`}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View className="flex-row justify-between">
        {(Object.keys(QUIZ_INFO) as QuizKind[]).map((kind) => (
          <Pressable
            key={kind}
            accessibilityRole="button"
            accessibilityLabel={`${QUIZ_INFO[kind].title}. ${QUIZ_INFO[kind].blurb}`}
            disabled={busy}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => {});
              if (kind === 'know_me') setKnowMe(true);
              else void openQuiz(kind);
            }}
            className={cn('h-[124px] w-[48.5%] justify-between rounded-[24px] border p-4 active:scale-[0.98]', QUIZ_TINT[kind], busy && 'opacity-60')}
          >
            <Text className="text-[28px] leading-[34px]">{QUIZ_INFO[kind].emoji}</Text>
            <View className="gap-0.5">
              <Display className="text-[17px] leading-[21px]" numberOfLines={1}>
                {kind === 'know_me' ? 'Know me?' : QUIZ_INFO[kind].title}
              </Display>
              <Text className="text-micro text-ink-soft" numberOfLines={1}>
                {QUIZ_INFO[kind].blurb}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      {error ? <Text className="text-small text-rose-700">{error}</Text> : null}

      <FormSheet open={knowMe} title="How well do you know me?" onClose={() => setKnowMe(false)} centered>
        <View className="gap-2.5">
          <Text className="text-small text-ink-soft">One of you answers about yourself, the other guesses. Ten questions.</Text>
          {[
            { title: 'About me', line: `I answer, ${partner.display_name} guesses`, subject: me.id },
            { title: `About ${partner.display_name}`, line: `${partner.display_name} answers, I guess`, subject: partner.id },
          ].map((o) => (
            <Pressable
              key={o.subject}
              accessibilityRole="button"
              onPress={() => {
                setKnowMe(false);
                void openQuiz('know_me', o.subject);
              }}
              className="rounded-[18px] border-2 border-paper-edge px-4 py-3 active:border-teal-400 active:bg-teal-50"
            >
              <Text className="font-sans-semibold text-body text-ink">{o.title}</Text>
              <Text className="text-small text-ink-soft">{o.line}</Text>
            </Pressable>
          ))}
        </View>
      </FormSheet>
    </View>
  );
}
