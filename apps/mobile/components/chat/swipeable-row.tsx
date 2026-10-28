import * as Haptics from 'expo-haptics';
import { Reply } from 'lucide-react-native';
import { memo, useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { usePalette } from '../ui/palette';

/** Past this, letting go replies. */
const THRESHOLD = 60;
/** How far the bubble follows the finger before it resists. */
const MAX = 84;

const tick = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

/**
 * Swipe a message to the right to reply to it, as in WhatsApp. The pan only
 * starts on a clearly sideways move, so scrolling the thread always wins, and
 * it all runs on the UI thread so the bubble tracks the finger exactly.
 */
export const SwipeableRow = memo(function SwipeableRow({
  enabled,
  onReply,
  children,
}: {
  enabled: boolean;
  onReply: () => void;
  children: ReactNode;
}) {
  const c = usePalette();
  const x = useSharedValue(0);
  const armed = useSharedValue(false);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX([-9999, 14])
        .failOffsetY([-12, 12])
        .onUpdate((e) => {
          const dx = Math.max(0, e.translationX);
          // Follows 1:1 up to the threshold, then eases off towards MAX.
          x.value = dx <= THRESHOLD ? dx : THRESHOLD + (MAX - THRESHOLD) * (1 - Math.exp(-(dx - THRESHOLD) / 60));
          const past = dx >= THRESHOLD;
          if (past !== armed.value) {
            armed.value = past;
            if (past) scheduleOnRN(tick);
          }
        })
        .onFinalize(() => {
          if (armed.value) scheduleOnRN(onReply);
          armed.value = false;
          x.value = withSpring(0, { damping: 20, stiffness: 260, mass: 0.6 });
        }),
    [enabled, onReply, x, armed],
  );

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const icon = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [12, THRESHOLD], [0, 1], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(x.value, [12, THRESHOLD], [0.5, 1], Extrapolation.CLAMP) }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View>
        <Animated.View pointerEvents="none" style={[styles.icon, icon]}>
          <View style={[styles.disc, { backgroundColor: c.paperRaised, borderColor: c.edge }]}>
            <Reply size={17} color={c.inkSoft} strokeWidth={2} />
          </View>
        </Animated.View>
        <Animated.View style={row}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  icon: { position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center' },
  disc: { height: 32, width: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
});
