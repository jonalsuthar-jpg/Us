import { dailyState, quizState, quizVerdict, rateGap, roundScore, type QuizKind, type QuizRound } from '@us/shared';
import { useCouple, useDailyDoodle, useDrawGames, useDrawings, useFeature, usePartnerDrawing, useQuizzes } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronRight, CircleCheck, Images, Mail, Plus } from 'lucide-react-native';
import { useId, useState, type ReactNode } from 'react';
import { Image, Pressable, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { cn } from '../ui/cn';
import { FormSheet } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';
import { TodayQuestion, useDaily } from './daily-question';

const QUIZ_ORDER: QuizKind[] = ['this_or_that', 'know_me', 'most_likely', 'rate_it'];

/**
 * Connect, as rows: one wide, glossy card per thing to do, each activity in
 * its own colour. Today's doodle and question are pastel, so they read as
 * "our moment" rather than a game.
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
    <View className="gap-8">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1">
          <View className="flex-row items-start">
            <Display className="text-[36px] leading-[42px] text-plum-800 dark:text-ink">Connect</Display>
            <Svg width={18} height={18} viewBox="0 0 20 20" fill="none" style={{ marginLeft: 2, marginTop: 2 }}>
              <Path d="M4 12 L8 4" stroke="#F5547C" strokeWidth={3} strokeLinecap="round" />
              <Path d="M10 14 L16 10" stroke="#F5547C" strokeWidth={3} strokeLinecap="round" />
            </Svg>
          </View>
          <Text className="text-body text-ink-soft">Tell · Play · Draw · Together</Text>
          <Text className="mt-0.5 text-micro text-ink-muted">
            <Text className="font-sans-bold text-micro text-ink-soft">{`${steps.filter(Boolean).length} of ${steps.length}`}</Text>
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
          <View className="flex-row gap-3">
            {draw ? <OursLink onPress={() => router.push('/draw/gallery')} count={drawings.length} label={'Our\ndrawings'} tone="text-rose-600" icon={<Images size={24} color="#F5547C" />} /> : null}
            {dailyOn ? (
              <OursLink onPress={() => router.push('/questions')} count={daily.data?.together ?? 0} label={'Our\nanswers'} tone="text-teal-700" icon={<CircleCheck size={24} color="#0C8F82" />} />
            ) : null}
          </View>
        </Section>
      ) : null}
    </View>
  );
}

function Section({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <View className="gap-3.5">
      <View className="flex-row items-end justify-between">
        <View>
          <Text className="font-sans-bold text-[15px] uppercase tracking-[1.2px] text-plum-700 dark:text-ink-soft">{title}</Text>
          <View className="mt-1.5 h-[3px] w-8 rounded-full bg-rose-400" />
        </View>
        {aside ? <Text className="pb-1 text-small text-ink-muted">{aside}</Text> : null}
      </View>
      <View className="gap-3">{children}</View>
    </View>
  );
}

interface Theme {
  /** Gradient, top-left to bottom-right. */
  from: string;
  to: string;
  /** Coloured drop shadow. */
  glow: string;
  /** Title and line colour. */
  ink: string;
  /** Pill behind the action, and its text. */
  pill: string;
  pillText: string;
  /** Hairline between the picture and the words. */
  rule: string;
  /** Pastel rows get a white edge. */
  edge?: boolean;
}

const THEME = {
  draw: { from: '#F7709A', to: '#E2336A', glow: '#E2336A', ink: 'text-white', pill: 'bg-white', pillText: 'text-rose-600', rule: 'bg-white/35' },
  guess: { from: '#FCCB5A', to: '#F0A01A', glow: '#D88C0C', ink: 'text-plum-800', pill: 'bg-[#FFF4DA]', pillText: 'text-gold-700', rule: 'bg-plum-800/15' },
  this_or_that: { from: '#36B36B', to: '#1D743E', glow: '#1D743E', ink: 'text-white', pill: 'bg-white', pillText: 'text-sage-700', rule: 'bg-white/30' },
  know_me: { from: '#22B8A6', to: '#0A776D', glow: '#0A776D', ink: 'text-white', pill: 'bg-white', pillText: 'text-teal-700', rule: 'bg-white/30' },
  most_likely: { from: '#8A6BB8', to: '#4B3468', glow: '#4B3468', ink: 'text-white', pill: 'bg-white', pillText: 'text-plum-600', rule: 'bg-white/30' },
  rate_it: { from: '#40357A', to: '#241933', glow: '#241933', ink: 'text-white', pill: 'bg-gold-300', pillText: 'text-plum-800', rule: 'bg-white/25' },
  doodle: { from: '#FFE3EC', to: '#FFF4F7', glow: '#E2336A', ink: 'text-plum-800', pill: 'bg-rose-600', pillText: 'text-white', rule: 'bg-rose-200', edge: true },
  question: { from: '#D8F5EE', to: '#F1FCF9', glow: '#0A776D', ink: 'text-plum-800', pill: 'bg-teal-600', pillText: 'text-white', rule: 'bg-teal-200', edge: true },
} satisfies Record<string, Theme>;

const WAITING = { pill: 'bg-white/25', pillText: 'text-white' };
const QUIET = { pill: 'bg-white/70', pillText: 'text-plum-500' };

interface RowProps {
  onPress?: () => void;
  theme: Theme;
  art: ReactNode;
  /** The white tile behind the picture; false for a picture that sits on the card. */
  tile?: boolean;
  eyebrow?: ReactNode;
  title?: string;
  titleSerif?: boolean;
  line: string;
  lineClass?: string;
  action: string;
  tall?: boolean;
}

function Row({ onPress, theme, art, tile = true, eyebrow, title, titleSerif, line, lineClass, action, tall }: RowProps) {
  const id = useId().replace(/:/g, '');
  const glow: ViewStyle = { shadowColor: theme.glow, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 10 }, elevation: 6 };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title ?? ''}. ${line}. ${action}`}
      disabled={!onPress}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      className="active:scale-[0.98]"
      style={glow}
    >
      <View className={cn('flex-row items-center gap-3.5 overflow-hidden rounded-[26px] px-3.5', tall ? 'h-[104px]' : 'h-[92px]', theme.edge && 'border-2 border-white')}>
        <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%">
          <Defs>
            <LinearGradient id={`bg${id}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={theme.from} />
              <Stop offset="1" stopColor={theme.to} />
            </LinearGradient>
            <LinearGradient id={`gl${id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#fff" stopOpacity={0.2} />
              <Stop offset="0.5" stopColor="#fff" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#bg${id})`} />
          <Rect width="100%" height="100%" fill={`url(#gl${id})`} />
        </Svg>
        <View>
          {tile ? <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-[20px] bg-white">{art}</View> : <View className="h-16 w-16 items-center justify-center">{art}</View>}
          {tile ? <Sparks /> : null}
        </View>
        <View className={cn('h-12 w-px', theme.rule)} />
        <View className="flex-1 gap-0.5">
          {eyebrow}
          {title ? (
            titleSerif ? (
              <Display light className={cn('text-[18px] leading-[23px]', theme.ink)} numberOfLines={1}>
                {title}
              </Display>
            ) : (
              <Text className={cn('font-sans-bold text-[19px] leading-6', theme.ink)} numberOfLines={1}>
                {title}
              </Text>
            )
          ) : null}
          <Text className={cn('text-[13px] leading-[17px]', lineClass ?? theme.ink, !lineClass && 'opacity-90')} numberOfLines={2}>
            {line}
          </Text>
        </View>
        <View className={cn('flex-row items-center gap-0.5 rounded-full py-2 pl-3.5 pr-2', theme.pill)}>
          <Text className={cn('font-sans-bold text-small', theme.pillText)}>{action}</Text>
          <PillChevron tone={theme.pillText} />
        </View>
      </View>
    </Pressable>
  );
}

/** Chevron in the pill's text colour. */
function PillChevron({ tone }: { tone: string }) {
  const c = usePalette();
  const color = tone.includes('white') ? '#fff' : tone.includes('rose') ? c.roseStrong : tone.includes('gold') ? '#7C5006' : tone.includes('sage') ? '#185B32' : tone.includes('teal') ? '#095F58' : '#4B3468';
  return <ChevronRight size={16} color={color} strokeWidth={2.6} />;
}

/** The little burst of lines at a tile's corner. */
function Sparks() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none" style={{ position: 'absolute', right: -8, top: -8 }}>
      <Path d="M8 1 v4 M13 4 l-3 3 M15 10 h-4" stroke="#FCC24F" strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

function DrawTogetherRow() {
  const { partner, partnerOnline } = useCouple();
  const drawing = usePartnerDrawing();
  const name = partner.display_name;
  return (
    <Row
      onPress={() => router.push('/draw')}
      theme={THEME.draw}
      art={
        <Svg width={44} height={44} viewBox="0 0 44 44" fill="none">
          <Path d="M6 30 c6 -14 12 -16 16 -8 s9 6 14 -12" stroke="#E2336A" strokeWidth={3.5} strokeLinecap="round" />
          <Path d="M28 38 l10 -10 l-3 -3 l-10 10 l-1 4z" fill="#F3A823" stroke="#AE6F08" strokeWidth={1.5} strokeLinejoin="round" />
        </Svg>
      }
      title="Draw together"
      line={drawing ? `${name} is drawing now` : partnerOnline ? `${name} is online · paint & doodle in sync` : 'Paint & doodle in sync'}
      action={drawing ? 'Join' : 'Open'}
    />
  );
}

function DrawGuessRow() {
  const { partner } = useCouple();
  const { stats, toGuess, myTurnToDraw } = useDrawGames();
  return (
    <Row
      onPress={() => router.push('/draw/guess')}
      theme={THEME.guess}
      art={
        <Svg width={44} height={44} viewBox="0 0 44 44" fill="none">
          <Path d="M6 7 h32 a6 6 0 0 1 6 6 v14 a6 6 0 0 1 -6 6 h-18 l-8 7 v-7 h-6 a6 6 0 0 1 -6 -6 v-14 a6 6 0 0 1 6 -6z" fill="#241933" />
          <Path d="M24 11 l-7 11 h6 l-3 8 l8 -12 h-6z" fill="#F3A823" />
        </Svg>
      }
      title="Draw & Guess"
      line={toGuess ? `${partner.display_name} drew one for you` : myTurnToDraw ? 'Your turn to draw' : stats.best ? `Best team score ${stats.best}` : 'A fun drawing challenge'}
      action={toGuess ? 'Guess' : myTurnToDraw ? 'Draw' : 'Play'}
    />
  );
}

/** The pink one (me) and the teal one (my partner). */
function Blob({ fill, blush, size }: { fill: string; blush: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 60 60" fill="none">
      <Circle cx={30} cy={30} r={26} fill={fill} />
      <Ellipse cx={22} cy={16} rx={9} ry={5} fill="#fff" opacity={0.35} />
      <Circle cx={22} cy={30} r={3.4} fill="#241933" />
      <Circle cx={38} cy={30} r={3.4} fill="#241933" />
      <Ellipse cx={15} cy={38} rx={4.5} ry={2.6} fill={blush} opacity={0.55} />
      <Ellipse cx={45} cy={38} rx={4.5} ry={2.6} fill={blush} opacity={0.55} />
      <Path d="M25 39 q5 5 10 0" stroke="#241933" strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

const GAME_ART: Record<QuizKind, { art: ReactNode; tile?: boolean }> = {
  this_or_that: {
    tile: false,
    art: (
      <View className="flex-row">
        <View className="h-12 w-8 items-center justify-center rounded-l-[12px] rounded-r-[4px] bg-rose-400" style={{ transform: [{ rotate: '-6deg' }] }}>
          <Text className="font-sans-bold text-[17px] text-white">A</Text>
        </View>
        <View className="-ml-0.5 h-12 w-8 items-center justify-center rounded-l-[4px] rounded-r-[12px] bg-teal-500" style={{ transform: [{ rotate: '6deg' }] }}>
          <Text className="font-sans-bold text-[17px] text-white">B</Text>
        </View>
      </View>
    ),
  },
  know_me: { art: <Blob fill="#50CBB9" blush="#FF86A3" size={48} /> },
  most_likely: {
    art: (
      <View className="flex-row">
        <Blob fill="#FF86A3" blush="#F5547C" size={32} />
        <View className="-ml-1.5">
          <Blob fill="#50CBB9" blush="#FF86A3" size={32} />
        </View>
      </View>
    ),
  },
  rate_it: {
    tile: false,
    art: (
      <Svg width={56} height={56} viewBox="0 0 24 24">
        <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" fill="#FCC24F" stroke="#F3A823" strokeWidth={1} strokeLinejoin="round" />
      </Svg>
    ),
  },
};

const GAME_TITLE: Record<QuizKind, string> = {
  this_or_that: 'This or that',
  know_me: 'Know me',
  most_likely: 'Who’s more likely',
  rate_it: 'Rate it together',
};

/** One daily game: today's first question, or where we've got to. */
function GameRow({ kind, round, loading }: { kind: QuizKind; round: QuizRound | undefined; loading: boolean }) {
  const { me, partner } = useCouple();
  const name = partner.display_name;
  const state = round ? quizState(round) : null;
  const first = round?.items[0];
  const total = round?.questions.length ?? 8;
  let theme: Theme = THEME[kind];

  let line: string;
  let action: string;
  if (!round) {
    line = loading ? 'Shuffling today’s questions…' : 'Not ready yet';
    action = '…';
  } else if (state === 'mine') {
    action = 'Play';
    line =
      kind === 'this_or_that' && first
        ? `${first.options[0]} or ${first.options[1]}? Pick & know each other`
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
    theme = { ...theme, ...WAITING };
    line = `You’re done · ${name}’s turn`;
  } else {
    const score = roundScore(round);
    action = `${score}/${total}`;
    line = kind === 'rate_it' ? `Done · ${rateGap(round.my_answers, round.partner_answers)} apart on average` : `Done · ${quizVerdict(kind, score, total).replace(/\s\S+$/u, '')}`;
  }

  return (
    <Row
      onPress={round ? () => router.push(`/play/quiz/${round.id}` as never) : undefined}
      theme={theme}
      art={GAME_ART[kind].art}
      tile={GAME_ART[kind].tile}
      title={GAME_TITLE[kind]}
      line={line}
      action={action}
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
      tile={false}
      theme={action === 'Waiting' ? { ...THEME.doodle, ...QUIET } : THEME.doodle}
      art={
        <View className="flex-row">
          <Polaroid rotate="-8deg" url={mine ? doodle.urls[mine.png_path] : undefined} empty={!doodle.mine} />
          <Polaroid rotate="8deg" url={both && theirs ? doodle.urls[theirs.png_path] : undefined} hidden={doodle.partner && !doodle.mine} overlap />
        </View>
      }
      eyebrow={<Text className="font-sans-bold text-small text-rose-700">Today’s doodle</Text>}
      title={`“${doodle.prompt}”`}
      titleSerif
      line={line}
      lineClass="text-plum-500"
      action={action}
    />
  );
}

function Polaroid({ rotate, url, empty, hidden, overlap }: { rotate: string; url?: string; empty?: boolean; hidden?: boolean; overlap?: boolean }) {
  return (
    <View className={cn('h-[56px] w-11 items-center justify-center overflow-hidden rounded-lg bg-white', overlap && '-ml-3')} style={{ transform: [{ rotate }] }}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: 44, height: 56 }} />
      ) : empty ? (
        <Plus size={20} color="#E2336A" />
      ) : (
        <Svg width={30} height={30} viewBox="0 0 40 40" fill="none" opacity={hidden ? 0.35 : 1}>
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
        tile={false}
        theme={action === 'Waiting' ? { ...THEME.question, ...QUIET } : THEME.question}
        art={
          <View className="h-16 w-16 items-center justify-center rounded-[20px] bg-teal-600">
            <Mail size={32} color="#fff" />
          </View>
        }
        eyebrow={<Text className="font-sans-bold text-small text-teal-700">Today’s question</Text>}
        line={today?.prompt ?? 'Loading today’s question…'}
        lineClass="font-display-light text-[15px] leading-[19px] text-plum-800"
        action={action}
      />
      <FormSheet open={open} title="Today’s question" onClose={() => setOpen(false)}>
        <TodayQuestion daily={daily} />
      </FormSheet>
    </>
  );
}

function OursLink({ onPress, count, label, tone, icon }: { onPress: () => void; count: number; label: string; tone: string; icon: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      className="flex-1 flex-row items-center gap-3 rounded-[22px] border border-paper-edge bg-paper-raised px-4 py-3.5 active:opacity-80"
      style={{ shadowColor: '#241933', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2 }}
    >
      <Text className={cn('font-sans-bold text-[30px] leading-[34px]', tone)}>{String(count)}</Text>
      <Text className="flex-1 text-small leading-[18px] text-ink">{label}</Text>
      {icon}
    </Pressable>
  );
}

/** The two of us, cheek to cheek, a heart above. */
function Mascots() {
  return (
    <View
      className="h-[72px] w-[104px] flex-row items-center justify-center rounded-[28px] bg-white/80 dark:bg-paper-raised"
      style={{ shadowColor: '#241933', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 }}
    >
      <Blob fill="#FF86A3" blush="#F5547C" size={48} />
      <View className="-ml-3">
        <Blob fill="#50CBB9" blush="#FF86A3" size={48} />
      </View>
      <View className="absolute -top-1.5">
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="#F5547C">
          <Path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" />
        </Svg>
      </View>
    </View>
  );
}

