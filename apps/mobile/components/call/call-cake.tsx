import type { useCallCake } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CakeCutter } from '../birthday/birthday-room';
import { Confetti } from '../games/confetti';
import { Display, Text } from '../ui/text';

type CallCakeState = ReturnType<typeof useCallCake>;

/** The birthday cake over the call: the same knife on both screens, confetti on both when it's cut. */
export function CallCake({ cake, name }: { cake: CallCakeState; name: string }) {
  const insets = useSafeAreaInsets();
  const state = cake.cake;
  const wasCut = useRef(false);
  useEffect(() => {
    if (state?.cut && !wasCut.current) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    wasCut.current = !!state?.cut;
  }, [state?.cut]);
  if (!state) return null;
  return (
    <>
      <Animated.View entering={FadeInDown.duration(240)} className="absolute inset-x-4 items-center rounded-[26px] bg-plum-900/95 px-4 pb-5 pt-3" style={{ top: insets.top + 64, elevation: 16 }}>
        <View className="w-full flex-row items-center justify-between">
          <Text className="font-sans-semibold text-small text-gold-300">🎂 Cut the cake together</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Put the cake away" hitSlop={8} onPress={cake.putAway} className="h-8 w-8 items-center justify-center rounded-full active:bg-white/10">
            <X size={16} color="#fff" />
          </Pressable>
        </View>
        <CakeCutter size={220} knife={state.knife} cut={state.cut} onMove={cake.move} />
        <Display className="text-center text-lead text-paper">{state.cut ? `Happy birthday, ${name}! 🎉` : 'Drag the knife down through the cake'}</Display>
      </Animated.View>
      {state.cut ? <Confetti pieces={70} /> : null}
    </>
  );
}
