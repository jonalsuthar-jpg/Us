import { answerDaily, dailyState, DAILY_ANSWER_MAX, fromDateKey, getDaily, type DailyEntry } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { Flame, Hourglass } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { EmptyNote, ErrorNote, SectionTitle } from '../module-screen';
import { Button } from '../ui/button';
import { Field } from '../ui/field';
import { usePalette } from '../ui/palette';
import { PrivacyBadge } from '../ui/privacy';
import { Sheet } from '../ui/sheet';
import { Display, Text } from '../ui/text';

const day = (key: string) => fromDateKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** Same flow as web: today's prompt, a sealed answer, the reveal, and earlier days. */
export function DailyQuestion({ daily }: { daily: ReturnType<typeof useDaily> }) {
  const { sb, me, partner } = useCouple();
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (daily.error && !daily.data) return <ErrorNote>{daily.error}</ErrorNote>;
  if (!daily.data) return <Sheet tone="inset" className="h-48" />;

  const { today, past, streak } = daily.data;
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
    <View className="gap-6">
      <Sheet tone="note" accent="teal" className="gap-4">
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text className="font-sans-medium text-small text-teal-700">Today’s question</Text>
          <PrivacyBadge privacy="private-until-reveal" partnerName={partner.display_name} />
        </View>
        <Display className="text-[24px] leading-[30px]">{today.prompt}</Display>

        {state === 'ask' || state === 'nudge' ? (
          <View className="gap-3">
            {state === 'nudge' ? (
              <Text className="text-small text-ink-soft">{partner.display_name} has answered. Answer yours to see what they said.</Text>
            ) : null}
            <Field
              label="Your answer"
              value={answer}
              onChangeText={setAnswer}
              multiline
              inputClassName="h-28 py-3"
              maxLength={DAILY_ANSWER_MAX}
              hint="Hidden until you’ve both answered. Sealed once sent."
            />
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <Button disabled={!answer.trim()} loading={sending} onPress={send}>
              Send my answer
            </Button>
          </View>
        ) : (
          <Answers entry={today} myName={me.display_name} partnerName={partner.display_name} />
        )}
      </Sheet>

      {streak > 1 ? <Streak days={streak} /> : null}

      <View className="gap-3">
        <SectionTitle>Earlier days</SectionTitle>
        {past.length === 0 ? (
          <EmptyNote title="Just getting started">Your answers collect here, a little archive of the two of you.</EmptyNote>
        ) : (
          past.slice(0, 14).map((e) => (
            <Sheet key={e.question_id} tone="inset" pad="sm" className="gap-2">
              <Text className="text-micro text-ink-muted">{day(e.for_date)}</Text>
              <Display className="text-body">{e.prompt}</Display>
              <Answers entry={e} myName={me.display_name} partnerName={partner.display_name} compact />
            </Sheet>
          ))
        )}
      </View>
    </View>
  );
}

/** Loads today's question; the screen owns it so pull-to-refresh can reload it. */
export function useDaily() {
  const { sb } = useCouple();
  return useCoupleData('connect:daily', () => getDaily(sb), [sb]);
}

function Streak({ days }: { days: number }) {
  const c = usePalette();
  return (
    <Sheet tone="inset" pad="sm" className="flex-row items-center gap-3">
      <Flame size={18} color={c.onGold} />
      <Text className="text-small">{`${days} days in a row, both of you.`}</Text>
    </Sheet>
  );
}

function Answers({ entry, myName, partnerName, compact }: { entry: DailyEntry; myName: string; partnerName: string; compact?: boolean }) {
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
