import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

const COLOURS = ['#E46B8A', '#3FA6A0', '#F3B33D', '#8E6BB8', '#7FB069'];

/** A short burst of paper confetti over the screen, for wins. */
export function Confetti({ pieces = 50 }: { pieces?: number }) {
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        id: i,
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * width * 0.4,
        delay: Math.random() * 350,
        spin: (Math.random() - 0.5) * 720,
        size: 6 + Math.random() * 7,
        colour: COLOURS[i % COLOURS.length]!,
        round: Math.random() > 0.6,
        duration: 2000 + Math.random() * 1000,
      })),
    [pieces, width],
  );
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {bits.map((b) => (
        <Piece key={b.id} bit={b} fall={height + 40} />
      ))}
    </View>
  );
}

function Piece({ bit, fall }: { bit: { x: number; drift: number; delay: number; spin: number; size: number; colour: string; round: boolean; duration: number }; fall: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(bit.delay, withTiming(1, { duration: bit.duration, easing: Easing.bezier(0.2, 0.6, 0.4, 1) }));
  }, [t, bit.delay, bit.duration]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value > 0.85 ? (1 - t.value) / 0.15 : 1,
    transform: [{ translateY: -20 + t.value * fall }, { translateX: t.value * bit.drift }, { rotate: `${t.value * bit.spin}deg` }],
  }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', top: 0, left: bit.x, width: bit.size, height: bit.round ? bit.size : bit.size * 0.45, backgroundColor: bit.colour, borderRadius: bit.round ? 99 : 2 },
        style,
      ]}
    />
  );
}
