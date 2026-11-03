import { knowMePrompt, knowMeQuestion, QUIZ_INFO, quizOptions, quizScore, quizState, quizVerdict } from '@us/shared';
import { useCouple, useQuizzes } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ArrowLeft, Check, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, SlideInRight, SlideOutLeft, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../ui/button';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';
import { Confetti } from './confetti';

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

  const header = (title: string) => (
    <View className="flex-row items-center gap-3">
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} className="h-11 w-11 items-center justify-center rounded-[14px] bg-paper-raised">
        <ArrowLeft size={20} color={c.inkSoft} />
      </Pressable>
      <View className="flex-1">
        <Text className="font-sans-semibold text-micro uppercase tracking-[1px] text-teal-700">Quiz</Text>
        <Display className="text-[22px] leading-[28px]" numberOfLines={1}>
          {title}
        </Display>
      </View>
    </View>
  );
  const page = (children: React.ReactNode, celebrate = false) => (
    <View className="flex-1 bg-paper">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }} contentContainerClassName="gap-5 px-5">
        {children}
      </ScrollView>
      {celebrate ? <Confetti /> : null}
    </View>
  );

  if (!round) {
    return page(
      <>
        {header('Quiz')}
        <Display light italic className="mt-10 text-center text-lead text-ink-soft">
          {loading ? 'Shuffling the questions…' : 'This quiz isn’t here any more.'}
        </Display>
      </>,
    );
  }

  const info = QUIZ_INFO[round.kind];
  const title = `${info.emoji} ${info.title}`;
  const state = quizState(round);
  const iAmSubject = round.subject_id === me.id;
  const subjectName = iAmSubject ? me.display_name : partner.display_name;
  const prompt = (qid: string, mine: boolean) => {
    if (round.kind === 'this_or_that') return 'This or that?';
    const q = knowMeQuestion(qid);
    return q ? knowMePrompt(q, subjectName, mine && iAmSubject) : '';
  };

  if (state === 'mine') {
    const i = picks.length;
    const done = i >= round.questions.length;
    const qid = round.questions[Math.min(i, round.questions.length - 1)]!;
    const options = quizOptions(round.kind, qid);
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
        {header(title)}
        {round.kind === 'know_me' ? (
          <View className="rounded-[18px] bg-teal-50 px-4 py-3">
            <Text className="text-small text-teal-800">
              {iAmSubject ? `Answer honestly about yourself. ${partner.display_name} will try to guess.` : `Guess what ${partner.display_name} will say about themselves.`}
            </Text>
          </View>
        ) : null}
        <View className="flex-row gap-1">
          {round.questions.map((_, k) => (
            <View key={k} className={cn('h-1.5 flex-1 rounded-full', k < i ? 'bg-teal-500' : k === i ? 'bg-teal-300' : 'bg-paper-sunken')} />
          ))}
        </View>
        {!done ? (
          <Animated.View key={qid} entering={SlideInRight.duration(220)} exiting={SlideOutLeft.duration(180)} className="gap-4 rounded-[28px] border border-paper-edge bg-paper-raised p-5">
            <Display className="text-[22px] leading-[29px]">{prompt(qid, true)}</Display>
            <View className={cn('gap-2.5', round.kind === 'this_or_that' && 'flex-row')}>
              {options.map((o, k) => (
                <Pressable
                  key={o}
                  accessibilityRole="button"
                  onPress={() => {
                    void Haptics.selectionAsync().catch(() => {});
                    setPicks((p) => [...p, k]);
                  }}
                  className={cn(
                    'rounded-[18px] border-2 border-paper-edge px-4 active:border-teal-400 active:bg-teal-50',
                    round.kind === 'this_or_that' ? 'h-28 flex-1 items-center justify-center' : 'py-3.5',
                  )}
                >
                  <Text className={cn('font-sans-semibold text-ink', round.kind === 'this_or_that' ? 'text-center text-lead' : 'text-body')}>{o}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        ) : (
          <View className="items-center gap-2">
            <Display light italic className="text-lead text-ink-soft">
              All done. Send them off?
            </Display>
            {error ? <Text className="text-small text-rose-700">{error}</Text> : null}
          </View>
        )}
        <View className="flex-row items-center justify-between">
          <Button variant="quiet" size="sm" disabled={!i || sending} onPress={() => setPicks((p) => p.slice(0, -1))}>
            Back
          </Button>
          {done ? (
            <Button loading={sending} onPress={() => void submit()}>
              Send my answers
            </Button>
          ) : null}
        </View>
      </>,
    );
  }

  if (state === 'waiting') {
    return page(
      <>
        {header(title)}
        <View className="items-center gap-2 rounded-[28px] border border-dashed border-paper-edge px-6 py-12">
          <Text className="text-[40px] leading-[48px]">⏳</Text>
          <Display light italic className="text-lead">
            Your answers are sealed.
          </Display>
          <Text className="text-center text-small text-ink-soft">{`We’ll show you both once ${partner.display_name} has answered too.`}</Text>
        </View>
      </>,
    );
  }

  const score = quizScore(round.my_answers, round.partner_answers);
  const total = round.questions.length;
  const truth = iAmSubject ? round.my_answers! : round.partner_answers!;
  const guess = iAmSubject ? round.partner_answers! : round.my_answers!;
  const guesser = iAmSubject ? partner.display_name : 'You';
  const subjectLabel = iAmSubject ? 'You' : subjectName;

  return page(
    <>
      {header(title)}
      <Animated.View entering={ZoomIn.springify().damping(14)} className="items-center rounded-[28px] bg-teal-600 px-6 py-8">
        <Display className="text-[56px] leading-[62px] text-white">{`${score}/${total}`}</Display>
        <Text className="mt-1 font-sans-semibold text-lead text-white">{quizVerdict(round.kind, score, total)}</Text>
        <Text className="mt-1 text-small text-white/80">
          {round.kind === 'know_me' ? `${guesser} guessed ${score} right about ${iAmSubject ? 'you' : subjectName}` : `You agreed on ${score} of ${total}`}
        </Text>
      </Animated.View>
      <View className="gap-2.5">
        {round.questions.map((qid, k) => {
          const options = quizOptions(round.kind, qid);
          const match = round.kind === 'know_me' ? truth[k] === guess[k] : round.my_answers![k] === round.partner_answers![k];
          return (
            <Animated.View
              key={qid}
              entering={FadeInDown.delay(150 + k * 110).duration(300)}
              className={cn('flex-row items-start gap-3 rounded-[20px] border px-4 py-3', match ? 'border-sage-200 bg-sage-50' : 'border-paper-edge bg-paper-raised')}
            >
              <View className={cn('mt-0.5 h-6 w-6 items-center justify-center rounded-full', match ? 'bg-sage-500' : 'bg-rose-400')}>
                {match ? <Check size={14} color="#fff" /> : <X size={14} color="#fff" />}
              </View>
              <View className="flex-1 gap-1">
                <Text className="font-sans-semibold text-small text-ink">{round.kind === 'know_me' ? prompt(qid, false) : `${options[0]} or ${options[1]}?`}</Text>
                {round.kind === 'know_me' ? (
                  <Text className="text-small text-ink-soft">
                    {`${subjectLabel}: `}
                    <Text className="font-sans-bold text-small text-ink">{options[truth[k]!]}</Text>
                    {!match ? `  ·  ${guesser} guessed: ${options[guess[k]!]}` : ''}
                  </Text>
                ) : (
                  <Text className="text-small text-ink-soft">{`You: ${options[round.my_answers![k]!]}  ·  ${partner.display_name}: ${options[round.partner_answers![k]!]}`}</Text>
                )}
              </View>
            </Animated.View>
          );
        })}
      </View>
    </>,
    score / total >= 0.7,
  );
}
