import type { PartnerSlot } from '@us/shared';
import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { cn } from '../ui/cn';

function Dot({ delay, color }: { delay: number; color: string }) {
  const reduce = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    y.value = withDelay(delay, withRepeat(withSequence(withTiming(-3, { duration: 360 }), withTiming(0, { duration: 360 })), -1));
  }, [delay, reduce, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={style} className={cn('h-1.5 w-1.5 rounded-full', color)} />;
}

export function TypingBubble({ visible, name, slot }: { visible: boolean; name: string; slot: PartnerSlot }) {
  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(`${name} is typing`);
  }, [visible, name]);
  return (
    <View className="min-h-[44px] pt-2">
      {visible && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(140)}
          className={cn(
            'flex-row items-center gap-1 self-start rounded-bubble rounded-bl-hair border px-4 py-3',
            slot === 'a' ? 'border-rose-200 bg-rose-50' : 'border-teal-200 bg-teal-50',
          )}
        >
          {[0, 160, 320].map((d) => (
            <Dot key={d} delay={d} color={slot === 'a' ? 'bg-rose-500' : 'bg-teal-600'} />
          ))}
        </Animated.View>
      )}
    </View>
  );
}
