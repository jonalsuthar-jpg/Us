import AsyncStorage from '@react-native-async-storage/async-storage';
import { sparkNextLine, SPARK_DIVISIONS, type SparkDivision, type SparkState } from '@us/shared';
import { useCouple, useSpark } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { usePalette } from '../ui/palette';
import { Text } from '../ui/text';
import { Emblem } from './emblem';
import { RankSheet } from './rank-sheet';
import { RankUp } from './rank-up';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING = 32;
const R = 14;
const AROUND = 2 * Math.PI * R;

/** The border warms to gold with each step of a tier. */
const STEP_BORDER = ['transparent', '#FFD98A', '#F3A823'] as const;

/**
 * Our Spark Rank, in the Home header: the emblem in a ring that fills toward
 * the next step. Sparks float off it as we earn them; tap for the details.
 */
export function RankChip() {
  const { couple } = useCouple();
  const { state, gain } = useSpark();
  const c = usePalette();
  const [open, setOpen] = useState(false);
  const rankUp = useRankUp(couple.id, state);
  const [celebrating, setCelebrating] = useState<SparkDivision | null>(null);
  useEffect(() => {
    if (rankUp) setCelebrating(rankUp);
  }, [rankUp]);

  const progress = useSharedValue(0);
  useEffect(() => {
    if (state) progress.value = withTiming(state.rank.progress, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [state, progress]);
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: AROUND * (1 - progress.value) }));

  // "+8" floats up off the chip and fades.
  const float = useSharedValue(0);
  useEffect(() => {
    if (!gain) return;
    void (gain.firstMove ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)).catch(() => {});
    float.value = 0;
    float.value = withSequence(withTiming(1, { duration: 220 }), withDelay(800, withTiming(2, { duration: 450 })));
  }, [gain, float]);
  const floatStyle = useAnimatedStyle(() => ({
    opacity: float.value <= 1 ? float.value : 2 - float.value,
    transform: [{ translateY: 6 - float.value * 16 }, { scale: 0.9 + Math.min(float.value, 1) * 0.1 }],
  }));

  if (!state) return null;
  const { division } = state.rank;
  const border = division.step ? STEP_BORDER[division.step] : c.edge;

  return (
    <>
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Our rank: ${division.name}. ${sparkNextLine(state)}`}
          accessibilityHint="Opens Spark Rank"
          onPress={() => {
            void Haptics.selectionAsync().catch(() => {});
            setOpen(true);
          }}
          hitSlop={4}
          style={{ borderColor: border, borderWidth: division.step ? 1.5 : 1 }}
          className="h-10 flex-row items-center gap-1.5 rounded-full bg-paper-raised pl-1 pr-3.5 active:opacity-80"
        >
          <View className="h-8 w-8 items-center justify-center">
            <Svg width={RING} height={RING} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
              <Circle cx={RING / 2} cy={RING / 2} r={R} stroke={c.paperSunken} strokeWidth={3} fill="none" />
              <AnimatedCircle
                cx={RING / 2}
                cy={RING / 2}
                r={R}
                stroke={division.tier.colors[1]}
                strokeWidth={3}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={AROUND}
                animatedProps={ringProps}
              />
            </Svg>
            <Emblem division={division} size={19} />
          </View>
          <Text className="font-sans-semibold text-small" numberOfLines={1}>
            {division.name}
          </Text>
        </Pressable>
        {gain ? (
          <Animated.View pointerEvents="none" style={floatStyle} className="absolute -top-6 left-0 right-0 items-center">
            <Text className="overflow-hidden rounded-full border border-gold-200 bg-gold-50 px-2.5 py-0.5 font-sans-semibold text-micro text-gold-700">
              {gain.firstMove ? `+${gain.sparks} First move ✨` : `+${gain.sparks}`}
            </Text>
          </Animated.View>
        ) : null}
      </View>

      <RankSheet open={open} state={state} onClose={() => setOpen(false)} />
      <RankUp division={celebrating} state={state} onClose={() => setCelebrating(null)} />
    </>
  );
}

/**
 * A division we've reached since this device last looked, within the same
 * season (a new season starting lower is not a moment).
 */
function useRankUp(coupleId: string, state: SparkState | undefined): SparkDivision | null {
  const [up, setUp] = useState<SparkDivision | null>(null);
  const season = state?.season;
  const index = state?.rank.division.index;
  useEffect(() => {
    if (season === undefined || index === undefined) return;
    const key = `us.spark.rank.${coupleId}`;
    let live = true;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(key);
        await AsyncStorage.setItem(key, `${season}:${index}`);
        const [seen, seenIndex] = (raw ?? '').split(':');
        // First sight on this device is not a rank-up.
        if (!live || seen !== season || index <= Number(seenIndex)) return;
        setUp(SPARK_DIVISIONS[index]!);
      } catch {
        // Storage unavailable: skip the celebration.
      }
    })();
    return () => {
      live = false;
    };
  }, [coupleId, season, index]);
  return up;
}
