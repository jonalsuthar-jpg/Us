import { SPARK_DIVISIONS, SPARK_KIND_LABEL, SPARK_RULES, SPARK_TIERS, sparkNextLine, togetherStreak, type SparkKind, type SparkState } from '@us/shared';
import { usePlant } from '@us/shared/react';
import { Camera, Check, CircleHelp, HeartPulse, Image, Lock, MessageCircle, Phone, PhoneIncoming, Smile, Sparkles, Users } from 'lucide-react-native';
import { useState, type ComponentType } from 'react';
import { View } from 'react-native';
import { cn } from '../ui/cn';
import { FormSheet } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { Segmented } from '../ui/segmented';
import { Display, Text } from '../ui/text';
import { Emblem } from './emblem';

type Tab = 'today' | 'mine' | 'ladder';

const ICON: Partial<Record<SparkKind, ComponentType<{ size: number; color: string }>>> = {
  first_move: Sparkles,
  snap: Camera,
  call_start: Phone,
  call_pickup: PhoneIncoming,
  question: CircleHelp,
  media: Image,
  tap: HeartPulse,
  status: Smile,
  message: MessageCircle,
};

/** Spark Rank in full: where we are, what's left to earn today, my own effort, the ladder. */
export function RankSheet({ open, state, onClose }: { open: boolean; state: SparkState; onClose: () => void }) {
  return (
    <FormSheet open={open} title="Spark Rank" onClose={onClose}>
      {open ? <Body state={state} /> : null}
    </FormSheet>
  );
}

function Body({ state }: { state: SparkState }) {
  const [tab, setTab] = useState<Tab>('today');
  const plant = usePlant();
  const streak = plant.state ? togetherStreak(plant.state.last30) : 0;
  const { division, next, progress } = state.rank;

  return (
    <>
      <View className="items-center">
        <View className="h-32 w-32 items-center justify-center">
          <View className="absolute h-28 w-28 rounded-full opacity-30" style={{ backgroundColor: division.tier.colors[0] }} />
          <Emblem division={division} size={92} />
        </View>
        <Display className="text-title">{division.name}</Display>
        <Text className="text-small text-ink-muted">
          Climbing together · {state.daysLeft === 0 ? 'last day' : `${state.daysLeft} ${state.daysLeft === 1 ? 'day' : 'days'} left`} in {state.month}
        </Text>
      </View>

      <View className="gap-1.5">
        <View className="flex-row justify-between">
          <Text className="text-micro text-ink-muted">{division.name}</Text>
          <Text className="text-micro text-ink-muted">{next?.name ?? ''}</Text>
        </View>
        <View className="h-2.5 overflow-hidden rounded-full bg-paper-sunken">
          <View className="h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: division.tier.colors[1] }} />
        </View>
        <Text className="text-center text-small text-ink-soft">{sparkNextLine(state)}</Text>
      </View>

      <View className="flex-row gap-2">
        <Stat value={`+${state.today}`} label="Today, together" />
        <Stat value={`${streak} ${streak === 1 ? 'day' : 'days'}`} label="Together streak" />
        <Stat value={state.sparks.toLocaleString()} label="Season Sparks" />
      </View>

      <Segmented
        label="Show"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'mine', label: 'My effort' },
          { value: 'ladder', label: 'Ladder' },
        ]}
      />

      {tab === 'today' ? <Today state={state} streak={streak} together={!!plant.state?.grewToday} /> : null}
      {tab === 'mine' ? <Mine state={state} /> : null}
      {tab === 'ladder' ? <Ladder state={state} /> : null}
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 rounded-[16px] border border-paper-edge px-3 py-2.5">
      <Text className="font-sans-bold text-lead" numberOfLines={1}>
        {value}
      </Text>
      <Text className="text-micro text-ink-muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Eyebrow({ children }: { children: string }) {
  return <Text className="mt-1 font-sans-semibold text-micro uppercase tracking-[1.5px] text-ink-muted">{children}</Text>;
}

function Today({ state, streak, together }: { state: SparkState; streak: number; together: boolean }) {
  const c = usePalette();
  // Mirrors the bonus in spark_award(): more on a streak of three, then seven.
  const bonus = streak >= 6 ? 30 : streak >= 2 ? 25 : 20;
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-3 rounded-[18px] bg-sage-50 p-3.5">
        <View className="h-10 w-10 items-center justify-center rounded-[12px] bg-paper-raised">
          <Users size={18} color={c.onSage} />
        </View>
        <View className="flex-1">
          <Text className="font-sans-semibold text-small text-sage-700">{together ? 'Together day bonus' : 'Both of you, today'}</Text>
          <Text className="text-micro text-sage-700">
            {together ? `You both showed up today${streak >= 3 ? ` · ${streak}-day streak` : ''}` : 'When you both do something for each other, you both earn it'}
          </Text>
        </View>
        {together ? <Check size={18} color={c.onSage} /> : <Text className="font-sans-bold text-small text-sage-700">+{bonus}</Text>}
      </View>

      <Eyebrow>Ways to earn today</Eyebrow>
      {SPARK_RULES.map((r) => {
        const used = state.mine.usedToday[r.kind] ?? 0;
        const done = used >= r.cap;
        const Icon = ICON[r.kind] ?? Sparkles;
        const gold = r.kind === 'first_move';
        return (
          <View key={r.kind} className="flex-row items-center gap-3 border-b border-paper-sunken py-3">
            <View className={cn('h-10 w-10 items-center justify-center rounded-[12px]', gold ? 'bg-gold-50' : 'bg-rose-50')}>
              <Icon size={18} color={gold ? c.onGold : c.onRose} />
            </View>
            <View className="flex-1 gap-1.5">
              <Text className="font-sans-semibold text-small">{r.label}</Text>
              <View className="flex-row items-center gap-2">
                <View className="h-1 flex-1 overflow-hidden rounded-full bg-paper-sunken">
                  <View className={cn('h-full rounded-full', gold ? 'bg-gold-400' : 'bg-rose-400')} style={{ width: `${Math.min(100, (used / r.cap) * 100)}%` }} />
                </View>
                <Text className="text-micro text-ink-muted">
                  {Math.min(used, r.cap)} of {r.cap}
                </Text>
              </View>
            </View>
            {done ? (
              <View className="flex-row items-center gap-1 rounded-full bg-sage-50 px-2.5 py-1">
                <Check size={12} color={c.onSage} />
                <Text className="font-sans-semibold text-micro text-sage-700">Done</Text>
              </View>
            ) : (
              <Text className="overflow-hidden rounded-full bg-gold-50 px-2.5 py-1 font-sans-semibold text-micro text-gold-700">
                +{r.sparks}
                {r.kind === 'message' ? ' each' : ''}
              </Text>
            )}
          </View>
        );
      })}
      <Text className="mt-2 text-micro text-ink-muted">A first move is the first message, snap, tap or call after four quiet hours. Calls also earn a Spark for every two minutes you talk.</Text>
    </View>
  );
}

function Mine({ state }: { state: SparkState }) {
  const c = usePalette();
  const max = Math.max(1, ...state.mine.byKind.map((k) => k.sparks));
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Lock size={13} color={c.inkSoft} />
        <Text className="flex-1 text-micro text-ink-soft">Only you can see this. Your partner just sees the rank you share.</Text>
      </View>
      <View className="rounded-[20px] bg-plum-800 p-5">
        <Text className="text-micro text-plum-200">Your Sparks this season</Text>
        <Text className="font-sans-bold text-[36px] leading-[42px] text-paper">{state.mine.season.toLocaleString()}</Text>
        <Text className="text-small text-plum-200">+{state.mine.today} today</Text>
      </View>
      <View className="flex-row items-center gap-3 rounded-[20px] border border-gold-100 bg-gold-50 p-4">
        <View className="h-11 w-11 items-center justify-center rounded-[14px] bg-paper-raised">
          <Sparkles size={22} color={c.gold} fill={c.gold} />
        </View>
        <View className="flex-1">
          <Text className="font-sans-bold text-gold-800">
            {state.mine.firstMoves} {state.mine.firstMoves === 1 ? 'first move' : 'first moves'}
          </Text>
          <Text className="text-small text-gold-700">
            {state.mine.firstMoves ? `You reached out first ${state.mine.firstMoves === 1 ? 'once' : `${state.mine.firstMoves} times`} this season.` : 'Be the one who reaches out first.'}
          </Text>
        </View>
      </View>
      {state.mine.byKind.length ? (
        <View>
          <Eyebrow>Where your Sparks came from</Eyebrow>
          {state.mine.byKind.map((k) => (
            <View key={k.kind} className="flex-row items-center gap-3 py-2">
              <Text className="w-32 text-small text-ink-soft" numberOfLines={1}>
                {SPARK_KIND_LABEL[k.kind]}
              </Text>
              <View className="h-2 flex-1 overflow-hidden rounded-full bg-paper-sunken">
                <View className={cn('h-full rounded-full', k.kind === 'first_move' ? 'bg-gold-400' : 'bg-rose-400')} style={{ width: `${(k.sparks / max) * 100}%` }} />
              </View>
              <Text className="w-10 text-right font-sans-semibold text-small">{k.sparks}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Ladder({ state }: { state: SparkState }) {
  const current = state.rank.division;
  return (
    <View className="gap-1">
      <Text className="text-small text-ink-soft">Every tier has I, II and III, each with more gold. Eternal is the top.</Text>
      {SPARK_TIERS.map((t, i) => {
        const here = i === current.tierIndex;
        const reached = i < current.tierIndex;
        const shown = here ? current : SPARK_DIVISIONS[i * 3 + (reached ? 2 : 0)]!;
        return (
          <View
            key={t.key}
            className={cn('flex-row items-center gap-3 rounded-[16px] border px-2.5 py-2', here ? 'border-rose-200 bg-rose-50' : 'border-transparent')}
            style={{ opacity: i > current.tierIndex ? 0.5 : 1 }}
          >
            <Emblem division={shown} size={38} />
            <View className="flex-1">
              <Text className="font-sans-semibold">{t.name}</Text>
              <Text className="text-micro text-ink-muted">From {SPARK_DIVISIONS[i * 3]!.at.toLocaleString()} Sparks</Text>
            </View>
            {here ? <Text className="font-sans-semibold text-micro text-rose-700">You’re here</Text> : reached ? <Text className="font-sans-semibold text-micro text-sage-700">Reached</Text> : null}
          </View>
        );
      })}
      <Eyebrow>Season peaks</Eyebrow>
      {state.peaks.length ? (
        <View className="flex-row flex-wrap gap-2">
          {state.peaks.map((p) => (
            <View key={p.season} className="w-[31%] items-center gap-1 rounded-[16px] border border-paper-edge px-2 py-3">
              <Emblem division={p.division} size={40} />
              <Text className="font-sans-semibold text-small" numberOfLines={1}>
                {p.division.name}
              </Text>
              <Text className="text-micro text-ink-muted">{p.month}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-small text-ink-soft">This is your first season. Where you end up is kept here.</Text>
      )}
      <Text className="mt-2 text-micro text-ink-muted">A new season starts on the 1st. You keep 40% of your Sparks and climb again.</Text>
    </View>
  );
}
