import { fromDateKey, knowMePrompt, mostLikelyPrompt, QUIZ_INFO, quizMatches, quizState, quizVerdict, rateGap, type QuizItem, type QuizRound } from '@us/shared';
import { useCouple, useQuizzes } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ArrowLeft, Check, Clock, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, SlideInRight, SlideOutLeft, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../ui/button';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';
import { Confetti } from './confetti';

const ACCENT: Record<QuizRound['kind'], { eyebrow: string; bar: string; next: string }> = {
  this_or_that: { eyebrow: 'text-sage-700', bar: 'bg-sage-400', next: 'bg-sage-200' },
  know_me: { eyebrow: 'text-teal-700', bar: 'bg-teal-500', next: 'bg-teal-200' },
  most_likely: { eyebrow: 'text-plum-600', bar: 'bg-plum-500', next: 'bg-plum-200' },
  rate_it: { eyebrow: 'text-gold-700', bar: 'bg-gold-500', next: 'bg-gold-200' },
};

/** A quiz round: answer card by card, wait for my partner, then the reveal. */
export function QuizScreen({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const { me, partner } = useCouple();
  const { rounds, loading, answer } = useQuizzes();
  const round = rounds.find((r) => r.id === id);
  const [picks, setPicks] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/connect'));

  const page = (children: React.ReactNode, celebrate = false) => (
    <View className="flex-1 bg-paper">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }} contentContainerClassName="gap-5 px-5">
        {children}
      </ScrollView>
      {celebrate ? <Confetti /> : null}
    </View>
  );
  const header = (eyebrow: string, title: string, eyebrowClass = 'text-teal-700', counter?: string) => (
    <View className="flex-row items-center gap-3">
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} className="h-11 w-11 items-center justify-center rounded-[14px] bg-paper-raised">
        <ArrowLeft size={20} color={c.inkSoft} />
      </Pressable>
      <View className="flex-1">
        <Text className={cn('font-sans-semibold text-micro uppercase tracking-[1px]', eyebrowClass)}>{eyebrow}</Text>
        <Display className="text-[22px] leading-[28px]" numberOfLines={1}>
          {title}
        </Display>
      </View>
      {counter ? (
        <View className="rounded-full bg-paper-sunken px-3 py-1.5">
          <Text className="font-sans-semibold text-micro text-ink-soft">{counter}</Text>
        </View>
      ) : null}
    </View>
  );

  if (!round) {
    return page(
      <>
        {header('Quiz', 'Daily games')}
        <Display light italic className="mt-10 text-center text-lead text-ink-soft">
          {loading ? 'Shuffling the questions…' : 'This quiz isn’t here any more.'}
        </Display>
      </>,
    );
  }

  const kind = round.kind;
  const accent = ACCENT[kind];
  const state = quizState(round);
  const items = round.items;
  const total = items.length;
  const iAmSubject = round.subject_id === me.id;
  const subjectName = iAmSubject ? me.display_name : partner.display_name;
  const prompt = (item: QuizItem, mine: boolean) =>
    kind === 'know_me'
      ? knowMePrompt(item.prompt ?? '', subjectName, mine && iAmSubject)
      : kind === 'most_likely'
        ? mostLikelyPrompt(item.prompt ?? '')
        : kind === 'rate_it'
          ? (item.prompt ?? '')
          : `${item.options[0]} or ${item.options[1]}?`;
  const eyebrow = round.for_date ? `Daily · ${fromDateKey(round.for_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}` : 'Quiz';
  const title = QUIZ_INFO[kind].title;
  const footer = (
    <View className="items-center gap-3 pt-1">
      <View className="flex-row items-center gap-1.5">
        <Clock size={15} color={c.inkSoft} />
        <Text className="text-small text-ink-soft">New questions tomorrow</Text>
      </View>
      <Pressable accessibilityRole="link" onPress={back} hitSlop={8}>
        <Text className="font-sans-semibold text-body text-rose-600">Back to Connect</Text>
      </Pressable>
    </View>
  );

  if (state === 'mine') {
    const done = picks.length >= total;
    const item = items[Math.min(picks.length, total - 1)]!;
    const pick = (k: number) => {
      void Haptics.selectionAsync().catch(() => {});
      setPicks((p) => (p.length < total ? [...p, k] : p));
    };
    const submit = async () => {
      setSending(true);
      setError(null);
      try {
        await answer(round.id, picks);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } catch {
        setError('Couldn’t send your answers. Try again.');
      } finally {
        setSending(false);
      }
    };
    return page(
      <>
        {header(eyebrow, title, accent.eyebrow, done ? 'Done' : `${picks.length + 1} of ${total}`)}
        {kind === 'know_me' ? (
          <View className="rounded-[18px] border border-teal-100 bg-teal-50 px-4 py-3">
            <Text className="text-small text-teal-800">
              {iAmSubject
                ? `Today is about you. Answer honestly; ${partner.display_name} will try to guess.`
                : `Today is about ${partner.display_name}. Guess what they said about themselves.`}
            </Text>
          </View>
        ) : null}
        <View className="flex-row gap-1.5">
          {items.map((_, k) => (
            <View key={k} className={cn('h-1.5 flex-1 rounded-full', k < picks.length ? accent.bar : k === picks.length ? accent.next : 'bg-paper-sunken')} />
          ))}
        </View>

        {!done ? (
          <Animated.View key={item.id} entering={SlideInRight.duration(220)} exiting={SlideOutLeft.duration(180)}>
            {kind === 'this_or_that' ? (
              <View className="gap-2.5">
                {item.options.map((o, k) => (
                  <Pressable
                    key={o}
                    accessibilityRole="button"
                    onPress={() => pick(k)}
                    className={cn('h-40 items-center justify-center rounded-[28px] px-5 active:scale-[0.97]', k === 0 ? 'bg-rose-500' : 'bg-teal-600')}
                  >
                    <Display className="text-center text-[28px] leading-[34px] text-white">{o}</Display>
                  </Pressable>
                ))}
                <View pointerEvents="none" className="absolute left-0 right-0 top-0 bottom-0 items-center justify-center">
                  <View className="h-14 w-14 items-center justify-center rounded-full border-[5px] border-paper bg-paper-raised">
                    <Display light italic className="text-[19px] leading-[24px]">
                      or
                    </Display>
                  </View>
                </View>
              </View>
            ) : (
              <View className="gap-5 rounded-[28px] border border-paper-edge bg-paper-raised p-5">
                <Display className="text-[23px] leading-[30px]">{prompt(item, true)}</Display>
                {kind === 'know_me' ? (
                  <View className="gap-2.5">
                    {item.options.map((o, k) => (
                      <Pressable
                        key={o}
                        accessibilityRole="button"
                        onPress={() => pick(k)}
                        className="min-h-[52px] flex-row items-center gap-3 rounded-[18px] border-2 border-paper-edge px-3.5 py-2.5 active:border-teal-400 active:bg-teal-50"
                      >
                        <View className="h-7 w-7 items-center justify-center rounded-[9px] bg-paper-sunken">
                          <Text className="font-sans-bold text-micro text-ink-soft">{'ABCDEF'[k]}</Text>
                        </View>
                        <Text className="flex-1 font-sans-semibold text-body text-ink">{o}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : kind === 'most_likely' ? (
                  <View className="flex-row gap-2.5">
                    {[
                      { label: 'Me', name: me.display_name, cls: 'bg-rose-500' },
                      { label: partner.display_name, name: partner.display_name, cls: 'bg-teal-600' },
                    ].map((p, k) => (
                      <Pressable
                        key={k}
                        accessibilityRole="button"
                        accessibilityLabel={p.label}
                        onPress={() => pick(k)}
                        className={cn('h-32 flex-1 items-center justify-center gap-2 rounded-[24px] active:scale-[0.97]', p.cls)}
                      >
                        <View className="h-11 w-11 items-center justify-center rounded-full bg-white/25">
                          <Text className="font-sans-bold text-[18px] text-white">{p.name.slice(0, 1).toUpperCase()}</Text>
                        </View>
                        <Display className="px-2 text-[18px] leading-[23px] text-white" numberOfLines={1}>
                          {p.label}
                        </Display>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <View className="gap-2">
                    <View className="flex-row flex-wrap justify-between gap-y-2">
                      {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
                        <Pressable
                          key={n}
                          accessibilityRole="button"
                          accessibilityLabel={`${n} out of 10`}
                          onPress={() => pick(n)}
                          className="h-12 w-[18.4%] items-center justify-center rounded-[14px] border-2 border-paper-edge active:border-gold-400 active:bg-gold-50"
                        >
                          <Text className="font-sans-bold text-lead text-ink">{String(n)}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <View className="flex-row justify-between">
                      <Text className="text-micro text-ink-muted">Not for me</Text>
                      <Text className="text-micro text-ink-muted">Love it</Text>
                    </View>
                  </View>
                )}
              </View>
            )}
          </Animated.View>
        ) : (
          <View className="items-center gap-2 rounded-[28px] border border-dashed border-paper-edge px-6 py-10">
            <Display light italic className="text-lead">
              All done. Send them off?
            </Display>
            <Text className="text-center text-small text-ink-soft">{`Sealed once sent. You’ll see ${partner.display_name}’s once they’ve played too.`}</Text>
            {error ? <Text className="text-small text-rose-700">{error}</Text> : null}
          </View>
        )}

        <View className="flex-row items-center justify-between gap-3">
          <Button variant="quiet" size="sm" disabled={!picks.length || sending} onPress={() => setPicks((p) => p.slice(0, -1))}>
            Back
          </Button>
          {done ? (
            <Button loading={sending} onPress={() => void submit()}>
              Send my answers
            </Button>
          ) : (
            <Text className="flex-1 text-right text-micro text-ink-muted">{`${partner.display_name}’s answers stay hidden until you finish.`}</Text>
          )}
        </View>
      </>,
    );
  }

  if (state === 'waiting') {
    return page(
      <>
        {header(eyebrow, title, accent.eyebrow)}
        <View className="items-center gap-2 rounded-[28px] border border-dashed border-paper-edge px-6 py-12">
          <Text className="text-[40px] leading-[48px]">⏳</Text>
          <Display light italic className="text-lead">
            Your answers are sealed.
          </Display>
          <Text className="text-center text-small text-ink-soft">{`We’ll show you both once ${partner.display_name} has played too.`}</Text>
        </View>
        {footer}
      </>,
    );
  }

  const mine = round.my_answers!;
  const theirs = round.partner_answers!;
  const matches = quizMatches(kind, mine, theirs);
  const score = matches.filter(Boolean).length;
  // Know me: the subject's picks are the truth; the other's are the guesses.
  const truth = iAmSubject ? mine : theirs;
  const guess = iAmSubject ? theirs : mine;
  const guesser = iAmSubject ? partner.display_name : 'You';
  const person = (p: number | undefined, fromMe: boolean) => ((p === 0) === fromMe ? 'You' : partner.display_name);
  const summary =
    kind === 'know_me'
      ? `${guesser} guessed ${score} right about ${iAmSubject ? 'you' : subjectName}`
      : kind === 'rate_it'
        ? `Within a point on ${score} of ${total} · ${rateGap(mine, theirs)} apart on average`
        : `You agreed on ${score} of ${total}`;
  const detail = (item: QuizItem, k: number) =>
    kind === 'know_me'
      ? `${iAmSubject ? 'You' : subjectName}: ${item.options[truth[k]!]}${matches[k] ? '' : `  ·  ${guesser} guessed: ${item.options[guess[k]!]}`}`
      : kind === 'most_likely'
        ? `You said ${person(mine[k], true)}  ·  ${partner.display_name} said ${person(theirs[k], false)}`
        : kind === 'rate_it'
          ? `You: ${mine[k]}  ·  ${partner.display_name}: ${theirs[k]}`
          : `You: ${item.options[mine[k]!]}  ·  ${partner.display_name}: ${item.options[theirs[k]!]}`;

  return page(
    <>
      {header(eyebrow, title, accent.eyebrow)}
      <Animated.View entering={ZoomIn.springify().damping(14)} className="flex-row items-center gap-5 rounded-[28px] bg-teal-600 px-6 py-6">
        <Display className="text-[50px] leading-[56px] text-white">{`${score}/${total}`}</Display>
        <View className="flex-1">
          <Text className="font-sans-semibold text-lead text-white">{quizVerdict(kind, score, total)}</Text>
          <Text className="mt-0.5 text-small text-white/85">{summary}</Text>
        </View>
      </Animated.View>
      <View className="gap-2.5">
        {items.map((item, k) => (
          <Animated.View
            key={item.id}
            entering={FadeInDown.delay(150 + k * 110).duration(300)}
            className={cn('flex-row items-start gap-3 rounded-[20px] border px-4 py-3', matches[k] ? 'border-sage-200 bg-sage-50' : 'border-paper-edge bg-paper-raised')}
          >
            <View className={cn('mt-0.5 h-6 w-6 items-center justify-center rounded-full', matches[k] ? 'bg-sage-500' : 'bg-rose-400')}>
              {matches[k] ? <Check size={14} color="#fff" /> : <X size={14} color="#fff" />}
            </View>
            <View className="flex-1 gap-1">
              <Text className="font-sans-semibold text-small text-ink">{prompt(item, false)}</Text>
              <Text className="text-small text-ink-soft">{detail(item, k)}</Text>
            </View>
          </Animated.View>
        ))}
      </View>
      {footer}
    </>,
    score / total >= 0.7,
  );
}
