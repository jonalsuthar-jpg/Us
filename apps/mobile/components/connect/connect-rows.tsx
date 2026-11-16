import { dailyState, quizState, quizVerdict, rateGap, roundScore, type QuizKind, type QuizRound } from '@us/shared';
import { useCouple, useDailyDoodle, useDrawGames, useDrawings, useFeature, usePartnerDrawing, useQuizzes } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Mail, Plus } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Image, Pressable, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Text as SvgText } from 'react-native-svg';
import { cn } from '../ui/cn';
import { FormSheet } from '../ui/form-sheet';
import { Display, Text } from '../ui/text';
import { TodayQuestion, useDaily } from './daily-question';

const QUIZ_ORDER: QuizKind[] = ['this_or_that', 'know_me', 'most_likely', 'rate_it'];

/**
 * Connect, as rows: one wide, short card per thing to do. Each activity has
 * its own solid colour; today's doodle and question are light, so they read
 * as "our moment" rather than a game.
 */
export function ConnectRows({ daily, settings }: { daily: ReturnType<typeof useDaily>; settings?: ReactNode }) {
  const draw = useFeature('draw');
  const quizzesOn = useFeature('quizzes');
  const dailyOn = useFeature('daily_question');
  const quizzes = useQuizzes(quizzesOn);
  const doodle = useDailyDoodle(draw);
  const { drawings } = useDrawings();

  const today = daily.data?.today;
  const steps = [
    ...(quizzesOn ? QUIZ_ORDER.map((k) => !!quizzes.today[k] && quizState(quizzes.today[k]!) !== 'mine') : []),
    ...(draw ? [doodle.mine] : []),
    ...(dailyOn ? [!!today && today.my_answer !== null] : []),
  ];
  const streak = daily.data?.streak ?? 0;

  return (
    <View className="gap-7">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <Display className="text-[32px] leading-[38px]" numberOfLines={1}>
            Connect
          </Display>
          <Text className="mt-1 text-small text-ink-soft">
            <Text className="font-sans-bold text-small text-ink">{`${steps.filter(Boolean).length} of ${steps.length}`}</Text>
            {` done today${streak > 1 ? ` · ${streak}-day streak` : ''}`}
          </Text>
        </View>
        <Mascots />
        {settings}
      </View>

      {draw ? (
        <Section title="Play anytime">
          <DrawTogetherRow />
          <DrawGuessRow />
        </Section>
      ) : null}

      {quizzesOn ? (
        <Section title="Daily games" aside="New at midnight">
          {QUIZ_ORDER.map((kind) => (
            <GameRow key={kind} kind={kind} round={quizzes.today[kind]} loading={quizzes.loading} />
          ))}
        </Section>
      ) : null}

      {draw || dailyOn ? (
        <Section title="Today’s moments">
          {draw ? <DoodleRow doodle={doodle} /> : null}
          {dailyOn ? <QuestionRow daily={daily} /> : null}
        </Section>
      ) : null}

      {draw || dailyOn ? (
        <Section title="Ours">
          <View className="flex-row gap-2.5">
            {draw ? <OursLink onPress={() => router.push('/draw/gallery')} count={drawings.length} label="Our drawings" tone="text-rose-600" /> : null}
            {dailyOn ? <OursLink onPress={() => router.push('/questions')} count={daily.data?.together ?? 0} label="Our answers" tone="text-teal-700" /> : null}
          </View>
        </Section>
      ) : null}
    </View>
  );
}

function Section({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <View className="gap-2.5">
      <View className="flex-row items-baseline justify-between">
        <Text className="font-sans-bold text-[13px] uppercase tracking-[1px] text-ink-muted">{title}</Text>
        {aside ? <Text className="text-micro text-ink-muted">{aside}</Text> : null}
      </View>
      {children}
    </View>
  );
}

interface RowProps {
  onPress?: () => void;
  /** Card background (and border), e.g. bg-rose-500. */
  tone: string;
  /** Title and line colour. */
  ink: string;
  art: ReactNode;
  artTone?: string;
  eyebrow?: ReactNode;
  title?: string;
  titleSerif?: boolean;
  line: string;
  lineClass?: string;
  action: string;
  actionTone: string;
  actionText: string;
  tall?: boolean;
}

function Row({ onPress, tone, ink, art, artTone = 'bg-white', eyebrow, title, titleSerif, line, lineClass, action, actionTone, actionText, tall }: RowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title ?? ''}. ${line}. ${action}`}
      disabled={!onPress}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      className={cn('flex-row items-center gap-3.5 overflow-hidden rounded-[22px] pl-3 pr-3.5 active:scale-[0.98] active:opacity-90', tall ? 'h-24' : 'h-[84px]', tone)}
    >
      <View className={cn('h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-[18px]', artTone)}>{art}</View>
      <View className="flex-1 gap-0.5">
        {eyebrow}
        {title ? (
          titleSerif ? (
            <Display light className={cn('text-[17px] leading-[21px]', ink)} numberOfLines={1}>
              {title}
            </Display>
          ) : (
            <Text className={cn('font-sans-bold text-[17px] leading-[21px]', ink)} numberOfLines={1}>
              {title}
            </Text>
          )
        ) : null}
        <Text className={cn('text-[12.5px] leading-4', lineClass ?? ink, !lineClass && 'opacity-90')} numberOfLines={2}>
          {line}
        </Text>
      </View>
      <View className={cn('rounded-full px-3 py-1.5', actionTone)}>
        <Text className={cn('font-sans-bold text-micro', actionText)}>{action}</Text>
      </View>
    </Pressable>
  );
}

function DrawTogetherRow() {
  const { partner, partnerOnline } = useCouple();
  const drawing = usePartnerDrawing();
  const name = partner.display_name;
  return (
    <Row
      onPress={() => router.push('/draw')}
      tone="bg-rose-500"
      ink="text-white"
      art={
        <Svg width={44} height={44} viewBox="0 0 44 44" fill="none">
          <Path d="M6 32 c6 -14 12 -16 16 -8 s9 6 14 -12" stroke="#E2336A" strokeWidth={3.5} strokeLinecap="round" />
          <Path d="M30 38 l9 -9 l-3 -3 l-9 9 l-1 4z" fill="#F3A823" stroke="#AE6F08" strokeWidth={1.5} strokeLinejoin="round" />
        </Svg>
      }
      title="Draw together"
      line={drawing ? `${name} is drawing now` : partnerOnline ? `${name} is online · one canvas, live` : 'One canvas, live'}
      action={drawing ? 'Join' : 'Open'}
      actionTone="bg-white"
      actionText="text-rose-600"
    />
  );
}

function DrawGuessRow() {
  const { partner } = useCouple();
  const { stats, toGuess, myTurnToDraw } = useDrawGames();
  return (
    <Row
      onPress={() => router.push('/draw/guess')}
      tone="bg-gold-400"
      ink="text-plum-800"
      art={
        <Svg width={44} height={44} viewBox="0 0 44 44" fill="none">
          <Path d="M6 6 h32 a6 6 0 0 1 6 6 v14 a6 6 0 0 1 -6 6 h-18 l-8 7 v-7 h-6 a6 6 0 0 1 -6 -6 v-14 a6 6 0 0 1 6 -6z" fill="#241933" />
          <SvgText x={22} y={26} textAnchor="middle" fontWeight="800" fontSize={16} fill="#F3A823">
            ?
          </SvgText>
        </Svg>
      }
      title="Draw & Guess"
      line={toGuess ? `${partner.display_name} drew one for you` : myTurnToDraw ? 'Your turn to draw' : stats.best ? `Best team score ${stats.best}` : 'Six rounds, one team'}
      action={toGuess ? 'Guess' : myTurnToDraw ? 'Draw' : 'Play'}
      actionTone="bg-plum-800"
      actionText="text-gold-300"
    />
  );
}

const GAME: Record<QuizKind, { title: string; tone: string; pill: string; artTone?: string; art: ReactNode }> = {
  this_or_that: {
    title: 'This or that',
    tone: 'bg-sage-600',
    pill: 'text-sage-700',
    artTone: 'bg-transparent',
    art: (
      <View className="h-full w-full flex-row">
        <View className="flex-1 items-center justify-center bg-rose-300">
          <Text className="font-sans-bold text-[10px] text-white">A</Text>
        </View>
        <View className="flex-1 items-center justify-center bg-teal-300">
          <Text className="font-sans-bold text-[10px] text-white">B</Text>
        </View>
      </View>
    ),
  },
  know_me: {
    title: 'Know me',
    tone: 'bg-teal-600',
    pill: 'text-teal-700',
    art: (
      <Svg width={46} height={46} viewBox="0 0 60 60" fill="none">
        <Path d="M28 10 C42 10 50 21 50 35 C50 48 41 55 28 55 C15 55 6 48 6 35 C6 21 14 10 28 10Z" fill="#50CBB9" />
        <Circle cx={21} cy={33} r={3.5} fill="#241933" />
        <Circle cx={35} cy={33} r={3.5} fill="#241933" />
        <Ellipse cx={15} cy={41} rx={4} ry={2.5} fill="#FF86A3" opacity={0.6} />
        <Path d="M24 42 q4 3.5 8 0" stroke="#241933" strokeWidth={2.4} strokeLinecap="round" />
        <Circle cx={50} cy={12} r={9} fill="#F3A823" />
        <SvgText x={50} y={17} textAnchor="middle" fontWeight="800" fontSize={13} fill="#241933">
          ?
        </SvgText>
      </Svg>
    ),
  },
  most_likely: {
    title: 'Who’s more likely',
    tone: 'bg-plum-600',
    pill: 'text-plum-600',
    art: (
      <Svg width={48} height={40} viewBox="0 0 48 40" fill="none">
        <Path d="M14 8 C22 8 26 14 26 22 C26 30 21 34 14 34 C7 34 2 30 2 22 C2 14 6 8 14 8Z" fill="#FF86A3" />
        <Circle cx={10} cy={21} r={2.2} fill="#241933" />
        <Circle cx={18} cy={21} r={2.2} fill="#241933" />
        <Path d="M34 6 C42 6 46 12 46 20 C46 28 41 32 34 32 C27 32 22 28 22 20 C22 12 26 6 34 6Z" fill="#50CBB9" />
        <Circle cx={30} cy={19} r={2.2} fill="#241933" />
        <Circle cx={38} cy={19} r={2.2} fill="#241933" />
        <Path d="M18 2 q6 -3 12 0" stroke="#634882" strokeWidth={2} strokeLinecap="round" strokeDasharray="2 3" />
      </Svg>
    ),
  },
  rate_it: {
    title: 'Rate it together',
    tone: 'bg-plum-800',
    pill: 'text-plum-800',
    artTone: 'bg-gold-50',
    art: (
      <Svg width={44} height={44} viewBox="0 0 24 24">
        <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" fill="#F3A823" stroke="#D88C0C" strokeWidth={1} strokeLinejoin="round" />
      </Svg>
    ),
  },
};

/** One daily game: what today's first question is, or where we've got to. */
function GameRow({ kind, round, loading }: { kind: QuizKind; round: QuizRound | undefined; loading: boolean }) {
  const { me, partner } = useCouple();
  const g = GAME[kind];
  const name = partner.display_name;
  const state = round ? quizState(round) : null;
  const first = round?.items[0];
  const total = round?.questions.length ?? 8;

  let line: string;
  let action: string;
  let actionTone = 'bg-white';
  let actionText = g.pill;
  if (!round) {
    line = loading ? 'Shuffling today’s questions…' : 'Not ready yet';
    action = '…';
  } else if (state === 'mine') {
    action = 'Play';
    line =
      kind === 'this_or_that' && first
        ? `${first.options[0]} or ${first.options[1]}? ${total} quick picks`
        : kind === 'know_me'
          ? round.subject_id === me.id
            ? 'About you today · answer, they guess'
            : `Guess ${name}’s answers today`
          : kind === 'most_likely' && first?.prompt
            ? `…to ${first.prompt}?`
            : first?.prompt
              ? `“${first.prompt}” and ${total - 1} more`
              : `${total} to play`;
  } else if (state === 'waiting') {
    action = 'Waiting';
    actionTone = 'bg-white/20';
    actionText = 'text-white';
    line = `You’re done · ${name}’s turn`;
  } else {
    const score = roundScore(round);
    action = `${score}/${total}`;
    line = kind === 'rate_it' ? `Done · ${rateGap(round.my_answers, round.partner_answers)} apart on average` : `Done · ${quizVerdict(kind, score, total).replace(/\s\S+$/u, '')}`;
  }

  return (
    <Row
      onPress={round ? () => router.push(`/play/quiz/${round.id}` as never) : undefined}
      tone={g.tone}
      ink="text-white"
      art={g.art}
      artTone={g.artTone}
      title={g.title}
      line={line}
      action={action}
      actionTone={actionTone}
      actionText={actionText}
    />
  );
}

function DoodleRow({ doodle }: { doodle: ReturnType<typeof useDailyDoodle> }) {
  const { me, partner } = useCouple();
  const name = partner.display_name;
  const mine = doodle.drawings.find((d) => d.created_by === me.id);
  const theirs = doodle.drawings.find((d) => d.created_by !== me.id);
  const both = doodle.mine && doodle.partner;
  const line = both
    ? 'You both drew it · see side by side'
    : doodle.mine
      ? `Yours is in · waiting for ${name}`
      : doodle.partner
        ? `${name} drew it · draw yours to see`
        : `Draw it, then see ${name}’s`;
  const action = both ? 'See' : doodle.mine ? 'Waiting' : 'Draw';
  return (
    <Row
      onPress={() => router.push('/draw/daily')}
      tall
      tone="border border-paper-edge bg-rose-50"
      ink="text-ink"
      artTone="bg-transparent"
      art={
        <View className="flex-row">
          <Polaroid rotate="-6deg" url={mine ? doodle.urls[mine.png_path] : undefined} empty={!doodle.mine} />
          <Polaroid rotate="6deg" url={both && theirs ? doodle.urls[theirs.png_path] : undefined} hidden={doodle.partner && !doodle.mine} overlap />
        </View>
      }
      eyebrow={<Text className="font-sans-bold text-micro text-rose-700">Today’s doodle</Text>}
      title={`“${doodle.prompt}”`}
      titleSerif
      line={line}
      lineClass="text-ink-soft"
      action={action}
      actionTone={action === 'Waiting' ? 'bg-paper-sunken' : 'bg-rose-600'}
      actionText={action === 'Waiting' ? 'text-ink-muted' : 'text-white'}
    />
  );
}

function Polaroid({ rotate, url, empty, hidden, overlap }: { rotate: string; url?: string; empty?: boolean; hidden?: boolean; overlap?: boolean }) {
  return (
    <View
      className={cn('h-[52px] w-10 items-center justify-center overflow-hidden rounded-md bg-white', empty && 'border-2 border-dashed border-rose-300', overlap && '-ml-2.5')}
      style={{ transform: [{ rotate }] }}
    >
      {url ? (
        <Image source={{ uri: url }} style={{ width: 40, height: 52 }} />
      ) : empty ? (
        <Plus size={16} color="#E2336A" />
      ) : (
        <Svg width={28} height={28} viewBox="0 0 40 40" fill="none" opacity={hidden ? 0.35 : 1}>
          <Path d="M8 32V16l12-9 12 9v16Z" stroke="#0C8F82" strokeWidth={2.6} strokeLinecap="round" />
        </Svg>
      )}
    </View>
  );
}

function QuestionRow({ daily }: { daily: ReturnType<typeof useDaily> }) {
  const [open, setOpen] = useState(false);
  const today = daily.data?.today;
  const state = today ? dailyState(today) : null;
  const action = state === 'revealed' ? 'Read' : state === 'waiting' ? 'Waiting' : 'Answer';
  return (
    <>
      <Row
        onPress={() => setOpen(true)}
        tall
        tone="border border-paper-edge bg-teal-50"
        ink="text-ink"
        artTone="bg-teal-600"
        art={<Mail size={30} color="#fff" />}
        eyebrow={<Text className="font-sans-bold text-micro text-teal-700">Today’s question</Text>}
        line={today?.prompt ?? 'Loading today’s question…'}
        lineClass="font-display-light text-[15px] leading-[19px] text-ink"
        action={action}
        actionTone={action === 'Waiting' ? 'bg-paper-sunken' : 'bg-teal-600'}
        actionText={action === 'Waiting' ? 'text-ink-muted' : 'text-white'}
      />
      <FormSheet open={open} title="Today’s question" onClose={() => setOpen(false)}>
        <TodayQuestion daily={daily} />
      </FormSheet>
    </>
  );
}

function OursLink({ onPress, count, label, tone }: { onPress: () => void; count: number; label: string; tone: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} className="flex-1 flex-row items-center gap-3 rounded-[18px] border border-paper-edge bg-paper-raised p-3 active:opacity-80">
      <Text className={cn('font-sans-bold text-[20px]', tone)}>{String(count)}</Text>
      <Text className="font-sans-bold text-small leading-4 text-ink">{label}</Text>
    </Pressable>
  );
}

/** The two of us: a pink one and a teal one, and a heart. */
function Mascots() {
  return (
    <Svg width={86} height={54} viewBox="0 0 86 54" fill="none" accessibilityLabel="The two of you">
      <G>
        <Path d="M24 8 C36 8 42 17 42 29 C42 41 34 48 24 48 C14 48 6 41 6 29 C6 17 12 8 24 8Z" fill="#FF86A3" />
        <Circle cx={18} cy={27} r={2.8} fill="#241933" />
        <Circle cx={30} cy={27} r={2.8} fill="#241933" />
        <Ellipse cx={13} cy={34} rx={3.4} ry={2} fill="#F5547C" opacity={0.6} />
        <Path d="M21 34 q3 3 6 0" stroke="#241933" strokeWidth={2} strokeLinecap="round" />
      </G>
      <G>
        <Path d="M62 10 C74 10 80 19 80 30 C80 42 72 48 62 48 C52 48 44 42 44 30 C44 19 50 10 62 10Z" fill="#50CBB9" />
        <Circle cx={56} cy={28} r={2.8} fill="#241933" />
        <Circle cx={68} cy={28} r={2.8} fill="#241933" />
        <Ellipse cx={73} cy={35} rx={3.4} ry={2} fill="#FF86A3" opacity={0.6} />
        <Path d="M59 35 q3 3 6 0" stroke="#241933" strokeWidth={2} strokeLinecap="round" />
      </G>
      <Path d="M43 6 c-2 -4 -8 -2 -5 2 l5 5 l5 -5 c3 -4 -3 -6 -5 -2z" fill="#F5547C" />
    </Svg>
  );
}
