import {
  ideaOfTheDay,
  LOVE_LANGUAGE_QUIZ,
  LOVE_LANGUAGES,
  loveLanguageResults,
  rankedLanguages,
  saveLoveLanguage,
  scoreLoveLanguages,
  setLoveLanguageShared,
  type LoveLanguage,
  type LoveLanguageResult,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { Lightbulb } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { ErrorNote } from '../module-screen';
import { Button } from '../ui/button';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { PrivacyBadge } from '../ui/privacy';
import { Sheet } from '../ui/sheet';
import { Display, Text } from '../ui/text';

export function GrowthLoveLanguages() {
  const { sb, me, partner } = useCouple();
  const results = useCoupleData('growth:love-languages', () => loveLanguageResults(sb, me.id), [sb, me.id]);
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = results.data?.mine ?? null;
  const theirs = results.data?.partner ?? null;

  if (taking || (!results.loading && !mine)) {
    return (
      <Quiz
        partnerName={partner.display_name}
        onCancel={mine ? () => setTaking(false) : undefined}
        onDone={async (answers, share) => {
          const { scores, primary } = scoreLoveLanguages(answers);
          await results.mutate(() => saveLoveLanguage(sb, { owner_id: me.id, scores, primary_language: primary, shared: share }));
          setTaking(false);
        }}
      />
    );
  }

  return (
    <View className="gap-6">
      <View className="gap-3">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Display className="text-heading">How you feel loved</Display>
          <PrivacyBadge privacy={mine?.shared ? 'shared' : 'private'} partnerName={partner.display_name} />
        </View>
        {mine ? <Result result={mine} /> : null}
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {mine ? (
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onPress={() => void results.mutate(() => setLoveLanguageShared(sb, me.id, !mine.shared)).catch((e: Error) => setError(e.message))}
          >
            {mine.shared ? `Stop sharing with ${partner.display_name}` : `Share with ${partner.display_name}`}
          </Button>
        ) : null}
        <Button variant="quiet" size="sm" className="self-start px-0" onPress={() => setTaking(true)}>
          Retake the quiz
        </Button>
      </View>

      <View className="gap-3">
        <Display className="text-heading">How {partner.display_name} feels loved</Display>
        {theirs ? (
          <>
            <Result result={theirs} />
            <Sheet tone="note" accent="sage" pad="sm" className="flex-row gap-3">
              <Lightbulb size={20} color="#3F4838" />
              <View className="flex-1">
                <Text className="font-sans-medium text-micro text-sage-700">A gentle idea for today</Text>
                <Text className="mt-1">{ideaOfTheDay(theirs.primary_language)}</Text>
              </View>
            </Sheet>
          </>
        ) : (
          <Sheet tone="inset">
            <Display italic className="text-lead">
              Not shared yet.
            </Display>
            <Text className="mt-1 text-small text-ink-soft">
              If {partner.display_name} takes the quiz and chooses to share, you’ll see what helps them feel loved — and an idea now and then.
            </Text>
          </Sheet>
        )}
      </View>
    </View>
  );
}

function Result({ result }: { result: LoveLanguageResult }) {
  const ranked = rankedLanguages(result.scores);
  const scores = (result.scores ?? {}) as Partial<Record<LoveLanguage, number>>;
  const max = Math.max(1, ...Object.values(scores).map((n) => n ?? 0));
  const top = LOVE_LANGUAGES[result.primary_language];
  return (
    <Sheet className="gap-4">
      <View>
        <Display italic className="text-[30px] leading-[36px]">
          {top.title}
        </Display>
        <Text className="mt-1 text-small text-ink-soft">{top.blurb}</Text>
      </View>
      {ranked.map((l) => (
        <View key={l} className="flex-row items-center gap-3">
          <Text className="w-16 text-small text-ink-soft">{LOVE_LANGUAGES[l].title}</Text>
          <View className="h-2 flex-1 overflow-hidden rounded-full bg-paper-sunken">
            <View className={cn('h-full rounded-full', l === result.primary_language ? 'bg-rose-400' : 'bg-plum-200')} style={{ width: `${((scores[l] ?? 0) / max) * 100}%` }} />
          </View>
        </View>
      ))}
    </Sheet>
  );
}

function Quiz({
  onDone,
  onCancel,
  partnerName,
}: {
  onDone: (answers: ('a' | 'b')[], share: boolean) => Promise<void>;
  onCancel?: () => void;
  partnerName: string;
}) {
  const c = usePalette();
  const [answers, setAnswers] = useState<('a' | 'b')[]>([]);
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const i = answers.length;
  const q = LOVE_LANGUAGE_QUIZ[i];
  const total = LOVE_LANGUAGE_QUIZ.length;

  return (
    <Sheet className="gap-5">
      <View className="flex-row items-center justify-between">
        <Text className="text-small text-ink-muted">{q ? `${i + 1} of ${total}` : 'All done'}</Text>
        <PrivacyBadge privacy="private" partnerName={partnerName} />
      </View>
      <View className="h-1 overflow-hidden rounded-full bg-paper-sunken">
        <View className="h-full bg-rose-400" style={{ width: `${(i / total) * 100}%` }} />
      </View>
      {q ? (
        <>
          <Display className="text-heading">Which would mean more to you?</Display>
          {(['a', 'b'] as const).map((side) => (
            <Pressable
              key={side}
              accessibilityRole="button"
              onPress={() => setAnswers([...answers, side])}
              className="rounded-control border border-paper-edge bg-paper-raised px-5 py-4 active:border-rose-300 active:bg-rose-50"
            >
              <Text>{q[side].text}</Text>
            </Pressable>
          ))}
          <View className="flex-row justify-between">
            <Button variant="quiet" size="sm" disabled={i === 0} onPress={() => setAnswers(answers.slice(0, -1))}>
              Back
            </Button>
            {onCancel ? (
              <Button variant="quiet" size="sm" onPress={onCancel}>
                Cancel
              </Button>
            ) : null}
          </View>
        </>
      ) : (
        <>
          <Display className="text-heading">That’s everything.</Display>
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <Text className="text-small">Share my result with {partnerName}</Text>
              <Text className="text-micro text-ink-soft">You can change this any time.</Text>
            </View>
            <Switch value={share} onValueChange={setShare} trackColor={{ true: c.roseStrong, false: c.edge }} accessibilityLabel="Share my result" />
          </View>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <Button
            loading={busy}
            onPress={async () => {
              setBusy(true);
              try {
                await onDone(answers, share);
              } catch (e) {
                setError((e as Error).message);
                setBusy(false);
              }
            }}
          >
            See my result
          </Button>
          <Button variant="quiet" onPress={() => setAnswers(answers.slice(0, -1))}>
            Back
          </Button>
        </>
      )}
    </Sheet>
  );
}
