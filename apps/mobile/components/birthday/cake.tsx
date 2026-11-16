import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming, ZoomIn } from 'react-native-reanimated';
import { Text } from '../ui/text';

const CANDLES = ['#F3B33D', '#3FA6A0', '#E46B8A', '#8E6BB8', '#7FB069'];

/**
 * The birthday cake, with candles that blow out. Drawn with plain views so it scales.
 */
export function Cake({ size, lit }: { size: number; lit: boolean }) {
  const u = size / 100;
  const tierTop = 34 * u;
  const cakeHeight = 52 * u;
  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={lit ? 'A birthday cake with lit candles' : 'A birthday cake'}>
      {/* plate */}
      <View style={{ position: 'absolute', left: 4 * u, right: 4 * u, bottom: 6 * u, height: 9 * u, borderRadius: 99, backgroundColor: '#F2E9EF' }} />
      {/* bottom tier */}
      <View style={{ position: 'absolute', left: 12 * u, right: 12 * u, bottom: 10 * u, height: 30 * u, borderRadius: 6 * u, backgroundColor: '#F7B9C8', overflow: 'hidden' }}>
        <View style={{ height: 7 * u, backgroundColor: '#FFF6F0' }} />
        <Drips u={u} count={7} colour="#FFF6F0" />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 7 * u, height: 2.5 * u, backgroundColor: '#E46B8A', opacity: 0.6 }} />
      </View>
      {/* top tier */}
      <View style={{ position: 'absolute', left: 24 * u, right: 24 * u, top: tierTop, height: 22 * u, borderRadius: 5 * u, backgroundColor: '#F3D9A4', overflow: 'hidden' }}>
        <View style={{ height: 5.5 * u, backgroundColor: '#FFF6F0' }} />
        <Drips u={u} count={5} colour="#FFF6F0" />
        {[0.2, 0.5, 0.8].map((x) => (
          <View key={x} style={{ position: 'absolute', left: `${x * 100}%`, top: 12 * u, width: 2.4 * u, height: 2.4 * u, borderRadius: 99, backgroundColor: '#E46B8A' }} />
        ))}
      </View>
      {/* candles */}
      {CANDLES.map((colour, i) => {
        const left = 30 * u + i * 9.6 * u;
        return (
          <View key={colour} style={{ position: 'absolute', left, top: tierTop - 13 * u, width: 3 * u, alignItems: 'center' }}>
            <View style={{ height: 6 * u, justifyContent: 'flex-end' }}>{lit ? <Flame u={u} delay={i * 90} /> : <Smoke u={u} />}</View>
            <View style={{ width: 3 * u, height: 13 * u, borderRadius: u, backgroundColor: colour }} />
          </View>
        );
      })}
    </View>
  );
}

function Drips({ u, count, colour }: { u: number; count: number; colour: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: -1 }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: 4 * u, height: (i % 2 ? 3 : 5) * u, borderBottomLeftRadius: 99, borderBottomRightRadius: 99, backgroundColor: colour }} />
      ))}
    </View>
  );
}

function Flame({ u, delay }: { u: number; delay: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    const flick = withSequence(withTiming(1, { duration: 180 + delay / 3, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 220, easing: Easing.inOut(Easing.quad) }));
    t.value = withRepeat(flick, -1, true);
  }, [t, delay, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.85 + t.value * 0.3 }, { scaleX: 1 - t.value * 0.12 }, { rotate: '-45deg' }] }));
  return (
    <Animated.View exiting={FadeOut.duration(250)} style={[{ width: 4 * u, height: 4 * u, marginBottom: 0.6 * u, borderTopLeftRadius: 99, borderBottomLeftRadius: 99, borderBottomRightRadius: 99, backgroundColor: '#FFB547', shadowColor: '#FFB547', shadowOpacity: 0.9, shadowRadius: 6 }, style]}>
      <View style={{ position: 'absolute', right: 0.7 * u, bottom: 0.7 * u, width: 2 * u, height: 2 * u, borderRadius: 99, backgroundColor: '#FFF3C4' }} />
    </Animated.View>
  );
}

function Smoke({ u }: { u: number }) {
  return (
    <Animated.View entering={ZoomIn.duration(300)} style={{ width: 1.4 * u, height: 4 * u, borderRadius: 99, backgroundColor: '#C9BED3', opacity: 0.7 }} />
  );
}
