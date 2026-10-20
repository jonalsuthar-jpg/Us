import { TAP_TOPIC } from '@us/shared';
import { useCouple } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, { FadeOutUp, useReducedMotion, ZoomIn } from 'react-native-reanimated';
import { Text } from './ui/text';

/**
 * Anywhere in the app: when my partner taps "thinking of you", the phone
 * gives a soft double pulse and a heart rises over the screen.
 */
export function TapHeart() {
  const { channel, me, partner } = useCouple();
  const [shown, setShown] = useState(0);
  const reduced = useReducedMotion();

  useEffect(
    () =>
      channel.changes.on((e) => {
        if (e.topic !== TAP_TOPIC || e.from === me.id) return;
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), 220);
        AccessibilityInfo.announceForAccessibility(`${partner.display_name} is thinking of you`);
        setShown((n) => n + 1);
      }),
    [channel, me.id, partner.display_name],
  );

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(0), 2400);
    return () => clearTimeout(t);
  }, [shown]);

  if (!shown) return null;
  return (
    <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
      <Animated.View key={shown} entering={reduced ? undefined : ZoomIn.springify()} exiting={reduced ? undefined : FadeOutUp.duration(600)} className="items-center">
        <Text className="text-[110px] leading-[130px]">💗</Text>
        <Text className="mt-2 rounded-full bg-paper-raised px-4 py-1.5 font-sans-medium text-small">{`${partner.display_name} is thinking of you`}</Text>
      </Animated.View>
    </View>
  );
}
