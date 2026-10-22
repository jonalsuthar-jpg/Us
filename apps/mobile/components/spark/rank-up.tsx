import { sparkNextLine, type SparkDivision, type SparkState } from '@us/shared';
import * as Haptics from 'expo-haptics';
import { Sparkles } from 'lucide-react-native';
import { useEffect } from 'react';
import { Modal, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../ui/button';
import { Display, Text } from '../ui/text';
import { Emblem } from './emblem';

const TWINKLES = [
  { left: '16%', top: '20%', size: 18, color: '#FCC24F', delay: 0 },
  { right: '18%', top: '26%', size: 12, color: '#FF86A3', delay: 600 },
  { right: '24%', top: '50%', size: 14, color: '#91E3D5', delay: 1100 },
  { left: '22%', top: '53%', size: 10, color: '#FFD98A', delay: 300 },
] as const;

/** The moment we reach a new rank: full screen, for both of us. */
export function RankUp({ division, state, onClose }: { division: SparkDivision | null; state: SparkState; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (division) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [division]);
  return (
    <Modal visible={!!division} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {division ? (
        <View className="flex-1 items-center justify-center bg-plum-900 px-8" style={{ paddingBottom: insets.bottom + 24, paddingTop: insets.top }}>
          {TWINKLES.map((t, i) => (
            <Twinkle key={i} {...t} />
          ))}
          <View className="h-64 w-64 items-center justify-center">
            <Glow color={division.tier.colors[1]} />
            <Animated.View entering={ZoomIn.springify().damping(9)}>
              <Emblem division={division} size={150} />
            </Animated.View>
          </View>
          <Animated.View entering={FadeInDown.delay(350).duration(500)} className="w-full items-center">
            <Text className="mt-2 font-sans-semibold text-micro uppercase tracking-[2.5px] text-gold-300">New rank</Text>
            <Display className="mt-1 text-center text-[42px] leading-[48px] text-paper">{division.name}</Display>
            <Display light italic className="mt-1.5 text-center text-lead text-plum-200">
              You two climbed together.
            </Display>
            <Text className="mt-4 text-small text-plum-300">{state.rank.division.index === division.index ? sparkNextLine(state) : ' '}</Text>
            <Button size="lg" className="mt-10 w-full" onPress={onClose}>
              Keep going
            </Button>
          </Animated.View>
        </View>
      ) : null}
    </Modal>
  );
}

function Glow({ color }: { color: string }) {
  const reduce = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!reduce) pulse.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [reduce, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: 0.35 + pulse.value * 0.25, transform: [{ scale: 0.92 + pulse.value * 0.16 }] }));
  return <Animated.View style={[{ position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: color }, style]} />;
}

function Twinkle({ size, color, delay, ...at }: { size: number; color: string; delay: number; left?: string; right?: string; top: string }) {
  const reduce = useReducedMotion();
  const v = useSharedValue(reduce ? 1 : 0.2);
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => {
      v.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    }, delay);
    return () => clearTimeout(t);
  }, [reduce, delay, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.6 + v.value * 0.4 }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', ...at } as object, style]}>
      <Sparkles size={size} color={color} fill={color} />
    </Animated.View>
  );
}
