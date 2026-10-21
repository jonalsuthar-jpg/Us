import AsyncStorage from '@react-native-async-storage/async-storage';
import { CAN_COLORS, PLANT_STAGES, plantLine, plantScene, type PartnerSlot, type PlantState } from '@us/shared';
import { useCouple, usePlant } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { Check, Droplet } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';
import { cn } from '../ui/cn';
import { FormSheet } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';
import { PlantArt } from './plant-art';

const WATERS = ['📸 A snap', '💗 Thinking of you', '💬 A message', '❓ Today’s question', '📞 A call you both pick up'];

/** Our little plant: grows on days we both show up for each other. */
export function PlantCard() {
  const { couple, partner, mySlot, partnerSlot } = useCouple();
  const { state } = usePlant();
  const [open, setOpen] = useState(false);
  const grew = useStageUp(couple.id, state);

  const scene = useMemo(
    () =>
      state
        ? plantScene({
            stage: state.stage.key,
            drooping: state.drooping,
            daypart: state.daypart,
            fresh: state.grewToday,
            left: { ...CAN_COLORS[mySlot], watered: state.today.me },
            right: { ...CAN_COLORS[partnerSlot], watered: state.today.partner },
          })
        : null,
    [state, mySlot, partnerSlot],
  );
  if (!state || !scene) return null;
  const title = `Our plant, ${state.stage.name}`;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${plantLine(state, partner.display_name)}`}
        accessibilityHint="Opens the plant"
        onPress={() => setOpen(true)}
        className="overflow-hidden rounded-[28px] border border-paper-edge bg-paper-raised active:opacity-95"
      >
        <View>
          <PlantArt scene={scene} title={title} />
          {grew ? (
            <Animated.View entering={ZoomIn.springify()} exiting={FadeOut} className="absolute inset-0 items-center justify-center">
              <Text className="overflow-hidden rounded-full bg-paper-raised/90 px-4 py-1.5 font-sans-medium text-small">It grew! Now {state.stage.name} 🌸</Text>
            </Animated.View>
          ) : null}
        </View>
        <View className="gap-2.5 px-5 pb-5 pt-4">
          <Text className="font-sans-medium text-micro uppercase tracking-[1.5px] text-sage-600">Our little plant</Text>
          <View>
            <Display className="text-heading">{state.togetherDays === 0 ? 'A seed, waiting for you both' : `Day ${state.togetherDays} together`}</Display>
            {state.togetherDays > 0 ? (
              <Display italic className="text-lead text-ink-soft">
                {state.stage.name}
              </Display>
            ) : null}
          </View>
          <Text className="text-small text-ink-soft">{plantLine(state, partner.display_name)}</Text>
          <View className="flex-row flex-wrap gap-2">
            <Can who="You" slot={mySlot} watered={state.today.me} />
            <Can who={partner.display_name} slot={partnerSlot} watered={state.today.partner} />
          </View>
          {state.next ? (
            <Text className="text-micro text-ink-muted">
              {state.daysToNext} more {state.daysToNext === 1 ? 'day' : 'days'} together until it’s {state.next.name}
            </Text>
          ) : null}
        </View>
      </Pressable>

      <FormSheet open={open} title="Our little plant" onClose={() => setOpen(false)}>
        <Text className="text-small text-ink-soft">It grows one step on every day you both do something for each other.</Text>
        <View className="overflow-hidden rounded-sheet">
          <PlantArt scene={scene} title={title} />
        </View>
        <Stages state={state} />
        <Last30 state={state} />
        <View className="gap-1.5">
          <Text className="font-sans-medium text-small">What waters it</Text>
          <View className="flex-row flex-wrap">
            {WATERS.map((w) => (
              <Text key={w} className="w-1/2 py-0.5 text-small text-ink-soft">
                {w}
              </Text>
            ))}
          </View>
          <Text className="text-micro text-ink-muted">One from each of you on the same day. It never shrinks, and it perks up as soon as you’re back.</Text>
        </View>
      </FormSheet>
    </>
  );
}

function Can({ who, slot, watered }: { who: string; slot: PartnerSlot; watered: boolean }) {
  const c = usePalette();
  const tint = watered ? (slot === 'a' ? c.roseStrong : '#0A776D') : c.inkMuted;
  return (
    <View
      accessible
      accessibilityLabel={`${who}: ${watered ? 'watered today' : 'not yet today'}`}
      className={cn('flex-row items-center gap-1.5 rounded-full px-3 py-1.5', watered ? (slot === 'a' ? 'bg-rose-50' : 'bg-teal-50') : 'bg-paper-sunken')}
    >
      <Droplet size={14} color={tint} fill={watered ? tint : 'transparent'} />
      <Text className={cn('text-small', watered ? (slot === 'a' ? 'text-rose-700' : 'text-teal-700') : 'text-ink-muted')}>{who}</Text>
    </View>
  );
}

function Stages({ state }: { state: PlantState }) {
  return (
    <View className="flex-row justify-between gap-1" accessibilityLabel="Stages">
      {PLANT_STAGES.slice(1).map((s, i) => {
        const reached = state.level >= i + 1;
        return (
          <View key={s.key} className="flex-1 items-center gap-1">
            <View className={cn('h-7 w-7 items-center justify-center rounded-full', reached ? 'bg-sage-500' : 'border border-dashed border-plum-200')}>
              {reached ? <Check size={14} color="#fff" /> : <Text className="text-micro text-ink-muted">{s.at}</Text>}
            </View>
            <Text className={cn('text-center text-[10px] leading-[12px]', reached ? 'text-ink' : 'text-ink-muted')}>{s.name}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Last30({ state }: { state: PlantState }) {
  return (
    <View className="gap-2">
      <Text className="font-sans-medium text-small">The last 30 days</Text>
      <View
        className="flex-row flex-wrap gap-1.5"
        accessible
        accessibilityLabel={`${state.last30.filter((d) => d === 'both').length} of the last 30 days together`}
      >
        {state.last30.map((d, i) => (
          <View
            key={i}
            style={{ width: '5.5%', aspectRatio: 1 }}
            className={cn('rounded-full', d === 'both' ? 'bg-sage-400' : d === 'one' ? 'border border-sage-300 bg-sage-100' : 'bg-paper-sunken')}
          />
        ))}
      </View>
      <View className="flex-row gap-4">
        <View className="flex-row items-center gap-1">
          <View className="h-2.5 w-2.5 rounded-full bg-sage-400" />
          <Text className="text-micro text-ink-muted">both of you</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <View className="h-2.5 w-2.5 rounded-full border border-sage-300 bg-sage-100" />
          <Text className="text-micro text-ink-muted">one of you</Text>
        </View>
      </View>
    </View>
  );
}

/** True for a moment when the plant has grown since this device last saw it. */
function useStageUp(coupleId: string, state: PlantState | undefined) {
  const [grew, setGrew] = useState(false);
  const level = state?.level;
  useEffect(() => {
    if (level === undefined) return;
    const key = `us.plant.level.${coupleId}`;
    let t: ReturnType<typeof setTimeout> | undefined;
    let live = true;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        await AsyncStorage.setItem(key, String(level));
        // First sight on this device is not a "grew" moment.
        if (!live || raw === null || level <= Number(raw)) return;
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setGrew(true);
        t = setTimeout(() => setGrew(false), 2800);
      } catch {
        // Storage unavailable: skip the celebration.
      }
    })();
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [coupleId, level]);
  return grew;
}
