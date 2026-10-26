import { answerDaily, dailyState, DAILY_ANSWER_MAX, fromDateKey, getDaily, type DailyEntry } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { router } from 'expo-router';
import { ChevronRight, Flame, Hourglass, Lock } from 'lucide-react-native';
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

  if (daily.error && !daily.data) return <ErrorNote>{daily.error}</ErrorNote>;
  if (!daily.data) return <Sheet tone="inset" className="h-48" />;

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
    <Sheet className="gap-4 rounded-[24px] p-5">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full bg-teal-500" />
          <Text className="font-sans-semibold text-small text-teal-700">Today’s question</Text>
        </View>
        {/* The short form of the privacy badge, so the row never wraps. */}
        <View
          accessible
          accessibilityLabel="Hidden until you’ve both answered"
          className="flex-row items-center gap-1.5 rounded-full bg-plum-50 py-1 pl-2 pr-2.5"
        >
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
        <Answers entry={today} myName={me.display_name} partnerName={partner.display_name} />
      )}
    </Sheet>
  );
}

/** How many we've answered together and the streak. Opens the archive. */
export function AnswersCard({ daily }: { daily: ReturnType<typeof useDaily> }) {
  const c = usePalette();
  if (!daily.data) return null;
  const { together, streak } = daily.data;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Our answers. ${together} answered together${streak > 1 ? `, ${streak} days in a row` : ''}`}
      onPress={() => router.push('/questions')}
      className="flex-row items-center gap-4 rounded-[24px] bg-gold-50 p-4 active:opacity-80"
    >
      <View className="h-14 w-14 items-center justify-center rounded-[18px] bg-paper-raised">
        <Display className="text-[26px] leading-[30px]">{String(together)}</Display>
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="font-sans-semibold text-lead">Our answers</Text>
        <View className="flex-row items-center gap-1.5">
          {streak > 1 ? <Flame size={13} color={c.gold} /> : null}
          <Text className="flex-1 text-micro text-gold-700" numberOfLines={1}>
            {streak > 1 ? `${together} together · ${streak} days in a row` : `${together} answered together`}
          </Text>
        </View>
      </View>
      <ChevronRight size={20} color={c.onGold} />
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
        {entry.my_answer !== null ? (
          <Text className={size}>{entry.my_answer}</Text>
        ) : (
          <Text className={`${size} italic text-ink-muted`}>Didn’t answer</Text>
        )}
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
