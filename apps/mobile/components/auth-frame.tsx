import type { ReactNode } from 'react';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated, { Easing, FadeIn, SlideInLeft, SlideInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from './ui/palette';
import { Display, Text } from './ui/text';

const ease = Easing.bezier(0.22, 1, 0.36, 1);

/** Mobile counterpart of the web AuthHero: the two circles meet, then the form. */
export function AuthFrame({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  return (
    <KeyboardAwareScrollView
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
      style={{ flex: 1, backgroundColor: c.paper }}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <View style={{ paddingTop: insets.top + 24 }} className="h-72 justify-between overflow-hidden bg-plum-800 px-6 pb-8">
        <Display italic className="text-heading text-paper/90">
          Us
        </Display>
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          <Animated.View
            entering={SlideInLeft.duration(1400).easing(ease)}
            className="absolute h-48 w-48 rounded-full bg-rose-400"
            style={{ transform: [{ translateX: -44 }] }}
          />
          <Animated.View
            entering={SlideInRight.duration(1400).easing(ease)}
            className="absolute h-48 w-48 rounded-full bg-teal-500 opacity-90"
            style={{ transform: [{ translateX: 44 }] }}
          />
        </View>
        <Animated.View entering={FadeIn.delay(900).duration(800)}>
          <Display light className="text-[36px] leading-[40px] text-paper">
            Just the two of you.
          </Display>
          <Text className="mt-2 text-small text-plum-200">A space nobody else can enter.</Text>
        </Animated.View>
      </View>
      <View style={{ paddingBottom: insets.bottom + 24 }} className="flex-1 px-6 pt-8">
        {children}
      </View>
    </KeyboardAwareScrollView>
  );
}
