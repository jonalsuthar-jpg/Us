import type { BirthdayView } from '@us/shared/react';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Confetti } from '../games/confetti';
import { usePalette } from '../ui/palette';
import { Sheet } from '../ui/sheet';
import { Display, Text } from '../ui/text';

const open = () => router.push('/birthday');

/**
 * The birthday on Home: a preview card for the maker before the day, the
 * festive banner on the day, and a way back into the room after.
 */
export function BirthdayBanner({ b }: { b: BirthdayView }) {
  const c = usePalette();
  const { room, phase, maker } = b;
  if (!room || !phase) return null;

  if (phase === 'before') {
    if (!maker) return null;
    const drafts = room.content.drafts.length;
    const day = new Date(room.unlock_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return (
      <Pressable accessibilityRole="button" onPress={open}>
        <Sheet tone="note" accent="gold" pad="sm" className="flex-row items-center gap-3">
          <Text className="text-[28px] leading-[34px]">🎂</Text>
          <View className="flex-1 gap-0.5">
            <Text className="font-sans-semibold text-body">{`Preview ${room.name}’s birthday`}</Text>
            <Text className="text-small text-ink-soft">
              {`Only you can see this. She gets it at midnight on ${day}.${drafts ? ` ${drafts} ${drafts === 1 ? 'part is' : 'parts are'} still drafts.` : ''}`}
            </Text>
          </View>
          <ChevronRight size={20} color={c.inkMuted} />
        </Sheet>
      </Pressable>
    );
  }

  if (phase === 'after') {
    if (!maker && !room.memory_id) return null;
    return (
      <Pressable accessibilityRole="button" onPress={open} className="flex-row items-center gap-2 self-start rounded-full bg-paper-raised px-4 py-2 active:opacity-80">
        <Text className="text-small">🎂</Text>
        <Text className="font-sans-medium text-small">{maker ? `${room.name}’s birthday room` : 'Your birthday room'}</Text>
      </Pressable>
    );
  }

  // The day itself.
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={maker ? 'Open the birthday room' : 'Open your celebration'} onPress={open}>
        <View className="overflow-hidden rounded-[28px] bg-plum-900 px-6 pb-6 pt-7">
          <View pointerEvents="none" className="absolute -left-10 -top-12 h-44 w-44 rounded-full bg-rose-500 opacity-40" />
          <View pointerEvents="none" className="absolute -bottom-16 -right-8 h-48 w-48 rounded-full bg-teal-500 opacity-30" />
          <Balloon emoji="🎈" left="72%" delay={0} />
          <Balloon emoji="🎈" left="86%" delay={700} />
          <Balloon emoji="🎉" left="60%" delay={1300} />
          <Display className="text-[30px] leading-[37px] text-paper">{maker ? `It’s ${room.name}’s birthday 🎂` : `Happy Birthday, ${room.name} ✨`}</Display>
          <Text className="mt-1 text-small text-plum-200">
            {maker ? (room.opened_at ? 'She’s opened her celebration 💛' : 'She hasn’t opened it yet') : 'Something’s waiting for you…'}
          </Text>
          <Glow>
            <View className="mt-5 flex-row items-center justify-center gap-2 self-start rounded-full bg-gold-300 px-5 py-3">
              <Text className="font-sans-semibold text-body text-plum-900">{maker ? 'Open the room' : 'Open your celebration'}</Text>
              <ChevronRight size={18} color="#241933" />
            </View>
          </Glow>
        </View>
      </Pressable>
      {!maker ? <Confetti pieces={40} /> : null}
    </>
  );
}

function Balloon({ emoji, left, delay }: { emoji: string; left: `${number}%`; delay: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) })), -1));
  }, [t, delay, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -t.value * 10 }, { rotate: `${(t.value - 0.5) * 8}deg` }] }));
  return (
    <Animated.Text pointerEvents="none" entering={FadeIn.delay(delay)} style={[{ position: 'absolute', top: 14, left, fontSize: 30, lineHeight: 36 }, style]}>
      {emoji}
    </Animated.Text>
  );
}

function Glow({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withSequence(withTiming(1, { duration: 1100 }), withTiming(0, { duration: 1100 })), -1);
  }, [t, reduced]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 + t.value * 0.04 }], shadowOpacity: 0.35 + t.value * 0.45 }));
  return <Animated.View style={[{ shadowColor: '#FCC24F', shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, alignSelf: 'flex-start' }, style]}>{children}</Animated.View>;
}
