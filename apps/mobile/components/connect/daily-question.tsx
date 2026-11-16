import { answerDaily, dailyState, DAILY_ANSWER_MAX, fromDateKey, getDaily, type DailyEntry } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { router } from 'expo-router';
import { Flame, Hourglass, Lock } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { ErrorNote } from '../module-screen';
import { Avatar } from '../ui/avatar';
import { Button } from '../ui/button';
import { Field } from '../ui/field';
import { usePalette } from '../ui/palette';
import { Sheet } from '../ui/sheet';
import { Display, Text } from '../ui/text';

export const dayLabel = (key: string, long = false) =>
  fromDateKey(key).toLocaleDateString(undefined, long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });

/** Today's prompt, a sealed answer and the reveal. Earlier days live in Our answers. */
export function DailyQuestion({ daily }: { daily: ReturnType<typeof useDaily> }) {
  const { sb, me, partner, partnerSlot } = useCouple();
  const c = usePalette();
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const header = (
    <View className="flex-row items-baseline justify-between gap-3">
      <Display className="text-heading">Today’s question</Display>
      {daily.data ? <AnswersLink together={daily.data.together} streak={daily.data.streak} /> : null}
    </View>
  );
  if (daily.error && !daily.data)
    return (
      <View className="gap-3">
        {header}
        <ErrorNote>{daily.error}</ErrorNote>
      </View>
    );
  if (!daily.data)
    return (
      <View className="gap-3">
        {header}
        <Sheet tone="inset" className="h-48" />
      </View>
    );

  const { today } = daily.data;
  const state = dailyState(today);

  function send() {
    Alert.alert('Send your answer?', `Answers are sealed once sent. ${partner.display_name} sees yours once they’ve answered too.`, [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Send',
        onPress: async () => {
          setError(null);
          setSending(true);
          try {
            await daily.mutate(() => answerDaily(sb, { question_id: today.question_id, owner_id: me.id, answer }));
            setAnswer('');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSending(false);
          }
        },
      },
    ]);
  }

  return (
    <View className="gap-3">
      {header}
      <Sheet className="gap-4 rounded-[26px] p-5">
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-row items-center gap-2">
            <View className="h-2 w-2 rounded-full bg-teal-500" />
            <Text className="font-sans-semibold text-small text-teal-700">{dayLabel(today.for_date)}</Text>
          </View>
          {/* The short form of the privacy badge, so the row never wraps. */}
          <View accessible accessibilityLabel="Hidden until you’ve both answered" className="flex-row items-center gap-1.5 rounded-full bg-plum-50 py-1 pl-2 pr-2.5">
            <Lock size={12} color={c.onPlum} strokeWidth={2.25} />
            <Text className="font-sans-medium text-micro text-plum-600">Hidden until both</Text>
          </View>
        </View>
        <Display light className="text-[25px] leading-[32px]">
          {today.prompt}
        </Display>

        {state === 'ask' || state === 'nudge' ? (
          <View className="gap-3">
            {state === 'nudge' ? (
              <View className="flex-row items-center gap-2.5 rounded-control bg-teal-50 px-3 py-2.5">
                <Avatar name={partner.display_name} slot={partnerSlot} size="sm" />
                <Text className="flex-1 text-small text-teal-800">{`${partner.display_name} has answered. Yours unlocks theirs.`}</Text>
              </View>
            ) : null}
            <Field
              label="Your answer"
              value={answer}
              onChangeText={setAnswer}
              multiline
              inputClassName="h-28 py-3"
              maxLength={DAILY_ANSWER_MAX}
              placeholder="Take your time…"
              hint="Hidden until you’ve both answered. Sealed once sent."
            />
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <Button disabled={!answer.trim()} loading={sending} onPress={send} className="bg-teal-600 active:bg-teal-700">
              Send my answer
            </Button>
          </View>
        ) : (
          <AnswerBubbles entry={today} partnerName={partner.display_name} />
        )}
      </Sheet>
    </View>
  );
}

/** Today, once mine is in: my answer, and theirs beside it when they have answered too. */
function AnswerBubbles({ entry, partnerName }: { entry: DailyEntry; partnerName: string }) {
  const c = usePalette();
  return (
    <View className="gap-2">
      <View className="max-w-[88%] self-start rounded-[18px] rounded-bl-md bg-rose-50 px-4 py-2.5">
        <Text className="font-sans-bold text-micro text-rose-700">You</Text>
        <Text className="text-body">{entry.my_answer}</Text>
      </View>
      {entry.partner_answer !== null ? (
        <View className="max-w-[88%] self-end rounded-[18px] rounded-br-md bg-teal-50 px-4 py-2.5">
          <Text className="font-sans-bold text-micro text-teal-700">{partnerName}</Text>
          <Text className="text-body">{entry.partner_answer}</Text>
        </View>
      ) : (
        <View className="flex-row items-center gap-2">
          <Hourglass size={14} color={c.inkMuted} />
          <Text className="flex-1 text-small text-ink-muted">{`You’ll see ${partnerName}’s when they answer.`}</Text>
        </View>
      )}
    </View>
  );
}

/** "Our answers · 47" with the streak, beside the heading. Opens the archive. */
function AnswersLink({ together, streak }: { together: number; streak: number }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Our answers. ${together} answered together${streak > 1 ? `, ${streak} days in a row` : ''}`}
      onPress={() => router.push('/questions')}
      hitSlop={8}
      className="flex-row items-center gap-1.5 active:opacity-70"
    >
      <Text className="font-sans-semibold text-small text-teal-700">{`Our answers · ${together}`}</Text>
      {streak > 1 ? (
        <View className="flex-row items-center gap-0.5 rounded-full bg-gold-50 px-2 py-0.5">
          <Flame size={11} color={c.gold} />
          <Text className="font-sans-bold text-micro text-gold-700">{String(streak)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Loads today's question; the screen owns it so pull-to-refresh can reload it. */
export function useDaily() {
  const { sb } = useCouple();
  return useCoupleData('connect:daily', () => getDaily(sb), [sb]);
}

export function Answers({ entry, myName, partnerName, compact }: { entry: DailyEntry; myName: string; partnerName: string; compact?: boolean }) {
  const c = usePalette();
  const size = compact ? 'text-small' : 'text-body';
  const pending = entry.partner_answered
    ? compact
      ? 'Answered. It stays hidden, since you didn’t.'
      : 'Answered. Answer yours to see it.'
    : compact
      ? 'Didn’t answer'
      : 'Not yet. You’ll see it here once they answer.';
  return (
    <View className={compact ? 'gap-2' : 'gap-4'}>
      <View>
        <Text className="font-sans-medium text-micro text-ink-muted">{myName}</Text>
        {entry.my_answer !== null ? <Text className={size}>{entry.my_answer}</Text> : <Text className={`${size} italic text-ink-muted`}>Didn’t answer</Text>}
      </View>
      <View>
        <Text className="font-sans-medium text-micro text-ink-muted">{partnerName}</Text>
        {entry.partner_answer !== null ? (
          <Text className={size}>{entry.partner_answer}</Text>
        ) : (
          <View className="flex-row items-center gap-1.5">
            <Hourglass size={13} color={c.inkMuted} />
            <Text className={`${size} flex-1 italic text-ink-muted`}>{pending}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
