import { dailyState, QUIZ_INFO, quizState, quizVerdict, rateGap, roundScore, type QuizKind, type QuizRound } from '@us/shared';
import { useCouple, useCoupleLive, useDailyDoodle, useDrawGames, useDrawings, useFeature, usePartnerDrawing, useQuizzes } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Check, Lock, Play, Plus } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { Photo } from '../ui/photo';
import { GradientView } from '../plan/art';
import { Initial } from '../plan/bits';
import { cn } from '../ui/cn';
import { FormSheet } from '../ui/form-sheet';
import { Text } from '../ui/text';
import { Blob, CanvasArt, GuessArt, ME, StarsArt, THEM } from './art';
import { TodayQuestion, useDaily } from './daily-question';

const QUIZ_ORDER: QuizKind[] = ['know_me', 'this_or_that', 'most_likely', 'rate_it'];

/** Each game's tint, edge, title colour and the fill of its Play button. */
const GAME_TONE: Record<QuizKind, { bg: string; edge: string; title: string; fill: string }> = {
  know_me: { bg: '#D3F4EB', edge: '#91E3D5', title: 'text-teal-700', fill: 'bg-teal-700' },
  this_or_that: { bg: '#FFE1E9', edge: '#FFB8C9', title: 'text-rose-700', fill: 'bg-rose-600' },
  most_likely: { bg: '#E8E0F8', edge: '#C9B8EC', title: 'text-plum-600', fill: 'bg-plum-600' },
  rate_it: { bg: '#FFEDC6', edge: '#FCC24F', title: 'text-gold-700', fill: 'bg-gold-700' },
};

const lift = (color = '#3F2C66', opacity = 0.14): ViewStyle => ({ shadowColor: color, shadowOpacity: opacity, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 });

const tap = (go: () => void) => () => {
  void Haptics.selectionAsync().catch(() => {});
  go();
};

/**
 * Connect: drawing together up top, today's four games as a 2×2, then
 * drawings, and today's question in the plum card.
 */
export function ConnectCorner({ daily, settings }: { daily: ReturnType<typeof useDaily>; settings?: ReactNode }) {
  const draw = useFeature('draw');
  const quizzesOn = useFeature('quizzes');
  const dailyOn = useFeature('daily_question');
  const quizzes = useQuizzes(quizzesOn);
  const { partner } = useCouple();
  const { partnerOnline } = useCoupleLive();
  const streak = daily.data?.streak ?? 0;
  const done = QUIZ_ORDER.filter((k) => quizzes.today[k] && quizState(quizzes.today[k]!) !== 'mine').length;
  const upNext = QUIZ_ORDER.find((k) => quizzes.today[k] && quizState(quizzes.today[k]!) === 'mine');

  return (
    <View className="gap-7">
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-[17px] text-plum-500">Your little corner,</Text>
          <Text className="font-sans-bold text-[40px] leading-[46px] tracking-[-1px]">Connect</Text>
          {partnerOnline || streak > 0 ? (
            <View className="mt-1.5 flex-row items-center gap-2">
              {partnerOnline ? <View className="h-2 w-2 rounded-full bg-sage-400" /> : null}
              <Text className="text-small text-plum-500">
                {partnerOnline ? `${partner.display_name}’s here` : ''}
                {partnerOnline && streak > 0 ? ' · ' : ''}
                {streak > 0 ? (
                  <Text className="text-small text-plum-500">
                    <Text className="font-sans-bold text-small text-rose-600">{String(streak)}</Text>
                    {'-day streak'}
                  </Text>
                ) : null}
              </Text>
            </View>
          ) : null}
        </View>
        {settings}
      </View>

      {draw ? (
        <Section title="Draw" bar="bg-rose-400">
          <View className="flex-row gap-3">
            <DrawTogetherCard />
            <DrawGuessCard />
          </View>
        </Section>
      ) : null}

      {quizzesOn ? (
        <Section title="Daily games" bar="bg-teal-500" aside={`${done} of 4 done`}>
          <View className="flex-row flex-wrap justify-between gap-y-3">
            {QUIZ_ORDER.map((kind) => (
              <View key={kind} className="w-[48.3%]">
                <GameTile kind={kind} round={quizzes.today[kind]} loading={quizzes.loading} upNext={kind === upNext} />
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {draw ? <Drawings /> : null}

      {dailyOn ? (
        <Section title="Today’s question" bar="bg-plum-500">
          <QuestionCard daily={daily} />
        </Section>
      ) : null}
    </View>
  );
}

function Section({ title, bar, aside, right, children }: { title: string; bar: string; aside?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2.5">
          <View className={cn('h-[22px] w-1 rounded-full', bar)} />
          <Text className="font-sans-bold text-[22px]">{title}</Text>
        </View>
        {aside ? <Text className="text-small text-plum-400">{aside}</Text> : right}
      </View>
      {children}
    </View>
  );
}

/** A pill-shaped label at the bottom of a card. */
function Pill({ label, className, textClass }: { label: string; className: string; textClass: string }) {
  return (
    <View className={cn('mt-1.5 self-start rounded-full px-3.5 py-[7px]', className)}>
      <Text className={cn('font-sans-bold text-[13px]', textClass)}>{label}</Text>
    </View>
  );
}

function DrawTogetherCard() {
  const { partner } = useCouple();
  const { partnerOnline } = useCoupleLive();
  const drawing = usePartnerDrawing();
  const name = partner.display_name;
  const line = drawing ? `${name} is drawing now` : partnerOnline ? `${name} is online` : 'Paint on the same page';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Draw together. ${line}`}
      onPress={tap(() => router.push('/draw'))}
      className="flex-1"
      style={({ pressed }) => [{ borderRadius: 26, backgroundColor: '#D42A5E' }, lift('#C41D55', 0.4), pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <GradientView from="#F7709A" to="#D42A5E" radius={26} className="min-h-[200px] gap-1.5 p-4">
        <CanvasArt />
        <View className="flex-1" />
        <Text className="font-sans-bold text-[18px] text-white">Draw together</Text>
        <Text className="text-[13px] text-white/90" numberOfLines={2}>
          {line}
        </Text>
        <Pill label={drawing ? 'Join' : 'Open'} className="bg-white" textClass="text-rose-600" />
      </GradientView>
    </Pressable>
  );
}

function DrawGuessCard() {
  const { partner } = useCouple();
  const { stats, toGuess, myTurnToDraw } = useDrawGames();
  const line = toGuess ? `${partner.display_name} drew one for you` : myTurnToDraw ? 'Your turn to draw' : stats.best ? `Best team score ${stats.best}` : 'Draw it, they guess it';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Draw & Guess. ${line}`}
      onPress={tap(() => router.push('/draw/guess'))}
      className="flex-1"
      style={({ pressed }) => [{ borderRadius: 26, backgroundColor: '#F3A823' }, lift('#AE6F08', 0.4), pressed && { transform: [{ scale: 0.98 }] }]}
    >
      <GradientView from="#FFD36B" to="#F3A823" radius={26} className="min-h-[200px] gap-1.5 p-4">
        <GuessArt />
        {toGuess || myTurnToDraw ? (
          <View className="absolute right-3 top-3 rounded-full bg-rose-500 px-2.5 py-1">
            <Text className="font-sans-bold text-[11px] text-white">Your turn</Text>
          </View>
        ) : null}
        <View className="flex-1" />
        <Text className="font-sans-bold text-[18px] text-plum-800">Draw & Guess</Text>
        <Text className="text-[13px] text-gold-800" numberOfLines={2}>
          {line}
        </Text>
        <Pill label={toGuess ? 'Guess' : myTurnToDraw ? 'Draw' : 'Play'} className="bg-plum-800" textClass="text-white" />
      </GradientView>
    </Pressable>
  );
}

/** One of today's games: its own tint, edge and title colour. */
function GameTile({ kind, round, loading, upNext }: { kind: QuizKind; round: QuizRound | undefined; loading: boolean; upNext: boolean }) {
  const { me, partner } = useCouple();
  const name = partner.display_name;
  const tone = GAME_TONE[kind];
  const state = round ? quizState(round) : null;
  const first = round?.items[0];
  const total = round?.questions.length ?? 8;
  const score = round && state === 'revealed' ? roundScore(round) : 0;

  let line: string;
  if (!round) line = loading ? 'Shuffling…' : 'Not ready yet';
  else if (state === 'waiting') line = 'You answered · waiting';
  else if (state === 'revealed')
    line =
      kind === 'this_or_that'
        ? `You matched ${score} of ${total}`
        : kind === 'rate_it'
          ? `${rateGap(round.my_answers, round.partner_answers)} apart on average`
          : `${score} of ${total} · ${quizVerdict(kind, score, total).replace(/\s\S+$/u, '')}`;
  else
    line =
      kind === 'know_me'
        ? round.subject_id === me.id
          ? `All about you. ${name} guesses.`
          : `Guess ${name}’s answers`
        : kind === 'this_or_that'
          ? `${total} quick picks`
          : kind === 'most_likely' && first?.prompt
            ? `…to ${first.prompt}?`
            : first?.prompt
              ? `“${first.prompt}”`
              : `${total} to play`;

  const art =
    kind === 'know_me' ? (
      <Blob {...THEM} size={44} mood="o" />
    ) : kind === 'this_or_that' ? (
      <View className="items-start gap-1">
        <View className="rounded-full bg-white px-2.5 py-0.5">
          <Text className="font-sans-bold text-[12px] text-rose-600" numberOfLines={1}>
            {first?.options[0] ?? 'This'}
          </Text>
        </View>
        <View className="rounded-full bg-teal-700 px-2.5 py-0.5">
          <Text className="font-sans-bold text-[12px] text-white" numberOfLines={1}>
            {first?.options[1] ?? 'That'}
          </Text>
        </View>
      </View>
    ) : kind === 'most_likely' ? (
      <View className="flex-row">
        <Blob {...ME} size={32} />
        <View className="-ml-1">
          <Blob {...THEM} size={32} />
        </View>
      </View>
    ) : (
      <StarsArt />
    );

  const badge =
    state === 'revealed' ? (
      <View className="h-[26px] w-[26px] items-center justify-center rounded-full bg-white">
        <Check size={14} color="#E2336A" strokeWidth={3} />
      </View>
    ) : state === 'waiting' ? (
      <View className="rounded-full bg-white px-2 py-0.5">
        <Text className="font-sans-semibold text-[11px]">{`${name}’s turn`}</Text>
      </View>
    ) : upNext ? (
      <View className={cn('rounded-full px-2 py-0.5', tone.fill)}>
        <Text className="font-sans-bold text-[10px] tracking-[0.5px] text-white">UP NEXT</Text>
      </View>
    ) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${QUIZ_INFO[kind].title}. ${line}`}
      disabled={!round}
      onPress={round ? tap(() => router.push(`/play/quiz/${round.id}` as never)) : undefined}
      className="min-h-[170px] gap-1 rounded-[24px] border-2 p-3.5 active:opacity-90"
      style={{ backgroundColor: tone.bg, borderColor: tone.edge }}
    >
      <View className="flex-row items-start justify-between gap-1">
        <View className="flex-1">{art}</View>
        {badge}
      </View>
      <View className="flex-1" />
      <Text className={cn('font-sans-bold text-[17px] leading-[21px]', tone.title)} numberOfLines={2}>
        {QUIZ_INFO[kind].title}
      </Text>
      <Text className="text-[13px] leading-[17px] text-plum-500" numberOfLines={2}>
        {line}
      </Text>
      {state === 'mine' ? (
        <View className={cn('mt-1.5 h-[34px] flex-row items-center justify-center gap-1.5 rounded-full', upNext ? tone.fill : 'bg-white')}>
          {upNext ? <Play size={11} color="#fff" fill="#fff" /> : null}
          <Text className={cn('font-sans-bold text-[13px]', upNext ? 'text-white' : tone.title)}>Play</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Today's doodle, then our latest drawings as polaroids. */
function Drawings() {
  const { me, partner } = useCouple();
  const doodle = useDailyDoodle(true);
  const { drawings, urls } = useDrawings();
  const name = partner.display_name;
  const mine = doodle.drawings.find((d) => d.created_by === me.id);
  const theirs = doodle.drawings.find((d) => d.created_by !== me.id);
  const both = doodle.mine && doodle.partner;
  const line = both ? 'You both drew it. See them side by side.' : doodle.mine ? `Yours is in. Waiting for ${name}.` : doodle.partner ? `${name} drew theirs. Draw yours to swap.` : `Draw it, then see ${name}’s.`;
  const action = both ? 'See both' : doodle.mine ? 'Look again' : 'Start drawing';
  const recent = drawings.filter((d) => urls[d.png_path]).slice(0, 3);
  const tilt = ['-3deg', '2deg', '-2deg'];

  return (
    <Section
      title="Drawings"
      bar="bg-gold-400"
      right={
        drawings.length ? (
          <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push('/draw/gallery')}>
            <Text className="font-sans-bold text-small text-rose-600">{`See all ${drawings.length}`}</Text>
          </Pressable>
        ) : undefined
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Today’s doodle. ${doodle.prompt}. ${line}`}
        onPress={tap(() => router.push('/draw/daily'))}
        className="flex-row items-center gap-3.5 rounded-[26px] border border-paper-edge bg-paper-raised p-4 active:opacity-90"
      >
        <View className="flex-1 gap-0.5">
          <Text className="font-sans-bold text-[12px] tracking-[1px] text-rose-700">TODAY’S DOODLE</Text>
          <Text className="font-sans-bold text-[18px]" numberOfLines={2}>
            {doodle.prompt}
          </Text>
          <Text className="text-[13px] text-plum-500">{line}</Text>
          <Pill label={action} className="mt-2 bg-rose-50" textClass="text-rose-600" />
        </View>
        <View className="flex-row">
          <Polaroid rotate="-6deg" url={both && theirs ? doodle.urls[theirs.png_path] : undefined} tint="#C8F2EA" locked={doodle.partner && !both} />
          <View className="-ml-2 mt-3">
            <Polaroid rotate="6deg" url={mine ? doodle.urls[mine.png_path] : undefined} dashed={!doodle.mine} />
          </View>
        </View>
      </Pressable>
      {recent.length ? (
        <View className="flex-row gap-2.5">
          {recent.map((d, i) => (
            <Pressable
              key={d.id}
              accessibilityRole="button"
              accessibilityLabel="Open our drawings"
              onPress={tap(() => router.push('/draw/gallery'))}
              className="h-24 flex-1 rounded-[6px] bg-white p-1.5 pb-4"
              style={[{ transform: [{ rotate: tilt[i]! }] }, lift()]}
            >
              {urls[d.png_path] ? <Photo uri={urls[d.png_path]!} cacheKey={d.png_path} fit="contain" style={{ flex: 1, borderRadius: 3 }} /> : null}
            </Pressable>
          ))}
          {Array.from({ length: 3 - recent.length }, (_, i) => (
            <View key={`gap-${i}`} className="flex-1" />
          ))}
        </View>
      ) : null}
    </Section>
  );
}

function Polaroid({ rotate, url, tint = '#fff', locked, dashed }: { rotate: string; url?: string; tint?: string; locked?: boolean; dashed?: boolean }) {
  return (
    <View className="w-14 rounded-[6px] bg-white p-1 pb-3" style={[{ transform: [{ rotate }] }, lift()]}>
      <View className={cn('h-12 items-center justify-center overflow-hidden rounded-[3px]', dashed && 'border-2 border-dashed border-rose-300')} style={{ backgroundColor: dashed ? '#fff' : tint }}>
        {url ? <Photo uri={url} style={{ width: 48, height: 48 }} /> : dashed ? <Plus size={20} color="#E2336A" /> : locked ? <Lock size={16} color="#095F58" /> : null}
      </View>
    </View>
  );
}

/** Today's question in the plum card. */
function QuestionCard({ daily }: { daily: ReturnType<typeof useDaily> }) {
  const { partner, partnerSlot } = useCouple();
  const [open, setOpen] = useState(false);
  const today = daily.data?.today;
  const state = today ? dailyState(today) : null;
  const name = partner.display_name;
  const status =
    state === 'nudge'
      ? `${name} has answered. Theirs opens once you write yours.`
      : state === 'waiting'
        ? `Yours is in. You’ll see ${name}’s when they answer.`
        : state === 'revealed'
          ? 'You both answered. Read them side by side.'
          : `Neither of you has answered yet. It stays hidden till ${name} answers too.`;
  const action = state === 'revealed' ? 'Read both answers' : state === 'waiting' ? 'Read yours' : 'Write your answer';

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`Today’s question. ${today?.prompt ?? ''}. ${action}`} onPress={tap(() => setOpen(true))} style={[{ borderRadius: 26, backgroundColor: '#4B3468' }, lift('#241933', 0.35)]}>
        <GradientView from="#3A2A5E" to="#4B3468" radius={26} className="gap-3.5 p-5">
          <Text className="font-sans-bold text-[12px] tracking-[1px] text-gold-300">ASKED TO YOU BOTH</Text>
          <Text className="font-sans-semibold text-[21px] leading-[28px] text-white">{today?.prompt ?? 'Loading today’s question…'}</Text>
          <View className="flex-row items-center gap-3 rounded-[16px] bg-white/10 px-3 py-2.5">
            <Initial slot={partnerSlot} name={name} size={30} />
            <Text className="flex-1 text-[13px] leading-[18px] text-white/85">{status}</Text>
          </View>
          <View className="h-[50px] items-center justify-center rounded-full bg-rose-600">
            <Text className="font-sans-bold text-[16px] text-white">{action}</Text>
          </View>
        </GradientView>
      </Pressable>
      <FormSheet open={open} title="Today’s question" onClose={() => setOpen(false)}>
        <TodayQuestion daily={daily} />
      </FormSheet>
    </>
  );
}
