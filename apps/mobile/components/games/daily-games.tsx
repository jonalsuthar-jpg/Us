import { QUIZ_INFO, QUIZ_KINDS, quizState, rateGap, roundScore, type QuizKind, type QuizRound } from '@us/shared';
import { useCouple, useFeature, useQuizzes } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ArrowLeftRight, Clock, Search, Star, Users } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';

const TILE: Record<QuizKind, { card: string; chip: string; Icon: typeof Star }> = {
  this_or_that: { card: 'border-sage-100 bg-sage-50', chip: 'bg-sage-400', Icon: ArrowLeftRight },
  know_me: { card: 'border-teal-100 bg-teal-50', chip: 'bg-teal-600', Icon: Search },
  most_likely: { card: 'border-plum-100 bg-plum-50', chip: 'bg-plum-500', Icon: Users },
  rate_it: { card: 'border-gold-100 bg-gold-50', chip: 'bg-gold-500', Icon: Star },
};

/** Today's round of each couple game, as cards like the Draw tiles. */
export function DailyGames() {
  const on = useFeature('quizzes');
  const c = usePalette();
  const quizzes = useQuizzes(on);
  if (!on) return null;

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Display className="text-heading">Daily games</Display>
        <View className="flex-row items-center gap-1.5">
          <Clock size={13} color={c.inkMuted} />
          <Text className="font-sans-semibold text-micro text-ink-muted">New ones every day</Text>
        </View>
      </View>
      <View className="flex-row flex-wrap justify-between gap-y-3">
        {QUIZ_KINDS.map((kind) => (
          <GameTile key={kind} kind={kind} round={quizzes.today[kind]} loading={quizzes.loading} />
        ))}
      </View>
      {quizzes.error && !quizzes.rounds.length ? <Text className="text-small text-rose-700">Couldn’t load today’s games. Pull to refresh.</Text> : null}
    </View>
  );
}

function GameTile({ kind, round, loading }: { kind: QuizKind; round: QuizRound | undefined; loading: boolean }) {
  const { me, partner } = useCouple();
  const t = TILE[kind];
  const name = partner.display_name;
  const state = round ? quizState(round) : null;
  const status =
    state === 'mine'
      ? { text: kind === 'know_me' && round!.subject_id === me.id ? 'Answer about you' : 'Your turn', dot: 'bg-rose-400', tone: 'text-rose-700' }
      : state === 'waiting'
        ? { text: `Waiting for ${name}`, dot: 'bg-plum-300', tone: 'text-ink-muted' }
        : state === 'revealed'
          ? { text: 'Done · see results', dot: 'bg-sage-400', tone: 'text-sage-700' }
          : { text: loading ? 'Shuffling…' : 'Not ready yet', dot: 'bg-paper-edge', tone: 'text-ink-muted' };
  const line =
    state === 'revealed'
      ? kind === 'rate_it'
        ? `${rateGap(round!.my_answers, round!.partner_answers)} apart on average`
        : `${roundScore(round!)} of ${round!.questions.length} matched`
      : kind === 'know_me' && round
        ? round.subject_id === me.id
          ? 'About you today'
          : `About ${name} today`
        : QUIZ_INFO[kind].blurb;
  const initial = (round?.subject_id === me.id ? me.display_name : name).slice(0, 1).toUpperCase();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${QUIZ_INFO[kind].title}. ${status.text}. ${line}`}
      disabled={!round}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        router.push(`/play/quiz/${round!.id}` as never);
      }}
      className={cn('h-[176px] w-[48.5%] justify-between overflow-hidden rounded-[24px] border p-4 active:opacity-90', t.card, !round && 'opacity-70')}
    >
      <TileArt kind={kind} initial={initial} />
      <View className={cn('h-10 w-10 items-center justify-center rounded-[14px]', t.chip)}>
        <t.Icon size={19} color="#fff" />
      </View>
      <View className="gap-1">
        <View className="flex-row items-center gap-1.5">
          <View className={cn('h-[7px] w-[7px] rounded-full', status.dot)} />
          <Text className={cn('flex-1 font-sans-semibold text-[12px] leading-[15px]', status.tone)} numberOfLines={1}>
            {status.text}
          </Text>
        </View>
        <Display className="text-[17px] leading-[21px]" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {QUIZ_INFO[kind].title}
        </Display>
        <Text className="text-micro leading-[17px] text-ink-soft" numberOfLines={1}>
          {line}
        </Text>
      </View>
    </Pressable>
  );
}

/** The little picture in each card's corner. */
function TileArt({ kind, initial }: { kind: QuizKind; initial: string }) {
  if (kind === 'this_or_that') {
    return (
      <View pointerEvents="none" className="absolute -right-3 top-3 h-[66px] w-[92px]">
        <View className="absolute left-0 top-1 h-9 w-[54px] items-center justify-center rounded-[11px] bg-rose-400" style={{ transform: [{ rotate: '-10deg' }] }}>
          <Text className="font-sans-bold text-[11px] text-white">Chai</Text>
        </View>
        <View className="absolute left-[34px] top-5 h-9 w-[58px] items-center justify-center rounded-[11px] bg-teal-500" style={{ transform: [{ rotate: '8deg' }] }}>
          <Text className="font-sans-bold text-[11px] text-white">Coffee</Text>
        </View>
      </View>
    );
  }
  if (kind === 'know_me') {
    return (
      <View pointerEvents="none" className="absolute right-3 top-3 h-[58px] w-[58px] items-center justify-center rounded-full border-2 border-dashed border-teal-300">
        <View className="h-[42px] w-[42px] items-center justify-center rounded-full bg-teal-500">
          <Text className="font-sans-bold text-[16px] text-white">{initial}</Text>
        </View>
        <View className="absolute -bottom-1 -right-1.5 h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-teal-50 bg-gold-400">
          <Text className="font-sans-bold text-[12px] leading-[15px] text-gold-900">?</Text>
        </View>
      </View>
    );
  }
  if (kind === 'most_likely') {
    return (
      <View pointerEvents="none" className="absolute right-3 top-4 flex-row">
        <View className="h-9 w-9 items-center justify-center rounded-full border-[3px] border-plum-50 bg-rose-400">
          <Text className="font-sans-bold text-[14px] text-white">?</Text>
        </View>
        <View className="-ml-2 h-9 w-9 items-center justify-center rounded-full border-[3px] border-plum-50 bg-teal-500">
          <Text className="font-sans-bold text-[14px] text-white">?</Text>
        </View>
      </View>
    );
  }
  return (
    <View pointerEvents="none" className="absolute right-3.5 top-5 h-[26px] w-[76px]">
      <View className="absolute inset-x-0 top-[11px] h-1 rounded-full bg-gold-100" />
      <View className="absolute left-3 top-0.5 h-[22px] w-[22px] items-center justify-center rounded-full bg-rose-400">
        <Text className="font-sans-bold text-[10px] text-white">7</Text>
      </View>
      <View className="absolute left-11 top-0.5 h-[22px] w-[22px] items-center justify-center rounded-full bg-teal-500">
        <Text className="font-sans-bold text-[10px] text-white">9</Text>
      </View>
    </View>
  );
}
