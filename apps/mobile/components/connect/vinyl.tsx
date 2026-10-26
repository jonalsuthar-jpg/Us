import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { cn } from '../ui/cn';

/** A record, turning while something plays. Pure decoration. */
export function Record({ playing, size }: { playing: boolean; size: number }) {
  const reduce = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (!playing || reduce) {
      cancelAnimation(turn);
      return;
    }
    // Carry on from where it stopped, one turn every 6 s.
    const from = turn.value % 360;
    turn.value = from;
    turn.value = withRepeat(withTiming(from + 360, { duration: 6000, easing: Easing.linear }), -1);
  }, [playing, reduce, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  const grooves = [0.92, 0.78, 0.64, 0.5];
  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
      className="items-center justify-center border-[5px] border-plum-900 bg-plum-950"
    >
      {grooves.map((g) => (
        <View
          key={g}
          className="absolute rounded-full border border-plum-700"
          style={{ width: size * g, height: size * g, borderRadius: (size * g) / 2 }}
        />
      ))}
      <View className="items-center justify-center rounded-full bg-rose-400" style={{ width: size * 0.34, height: size * 0.34 }}>
        <View className="absolute rounded-full bg-gold-400" style={{ width: size * 0.13, height: size * 0.13, left: size * 0.05, top: size * 0.055 }} />
        <View className="rounded-full bg-plum-950" style={{ width: size * 0.04, height: size * 0.04 }} />
      </View>
    </Animated.View>
  );
}

const DELAYS = [200, 600, 900, 400, 700, 100, 850, 300, 550, 150, 950, 450];

/** Sound bars, moving while something plays and resting when it's paused. */
export function SoundBars({ playing, count = 4, height = 20, className }: { playing: boolean; count?: number; height?: number; className?: string }) {
  return (
    <View importantForAccessibility="no-hide-descendants" className={cn('flex-row items-end gap-[3px]', className)} style={{ height }}>
      {DELAYS.slice(0, count).map((d, i) => (
        <Bar key={i} delay={d} playing={playing} height={height} />
      ))}
    </View>
  );
}

function Bar({ delay, playing, height }: { delay: number; playing: boolean; height: number }) {
  const reduce = useReducedMotion();
  const s = useSharedValue(0.3);
  useEffect(() => {
    if (!playing || reduce) {
      cancelAnimation(s);
      s.value = withTiming(0.3, { duration: 300 });
      return;
    }
    const half = { duration: 550, easing: Easing.inOut(Easing.ease) };
    s.value = withDelay(delay, withRepeat(withSequence(withTiming(1, half), withTiming(0.3, half)), -1));
  }, [playing, reduce, delay, s]);
  // Grow from the bottom: scale about the centre, then shift down by the shrink.
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: ((1 - s.value) * height) / 2 }, { scaleY: s.value }] }));
  return <Animated.View style={[{ width: 4, height, borderRadius: 2, opacity: playing ? 1 : 0.45 }, style]} className="bg-rose-300" />;
}
