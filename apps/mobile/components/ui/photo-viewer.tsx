import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './button';
import { cn } from './cn';

/** The whole photo at its own shape (never cropped); tap to open it full screen. */
export function Photo({ uri, label, className }: { uri: string; label: string; className?: string }) {
  const [ratio, setRatio] = useState(4 / 3);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel={`${label}. Open full screen`} onPress={() => setOpen(true)}>
        <Image
          source={{ uri }}
          onLoad={(e) => {
            const { width, height } = e.nativeEvent.source;
            if (width && height) setRatio(width / height);
          }}
          // Very tall photos are capped and letterboxed rather than filling the sheet.
          style={{ aspectRatio: Math.max(ratio, 3 / 4) }}
          className={cn('w-full rounded-control bg-paper-sunken', className)}
          resizeMode="contain"
        />
      </Pressable>
      <PhotoViewer uri={open ? uri : null} label={label} onClose={() => setOpen(false)} />
    </>
  );
}

/**
 * Black full-screen viewer. Pinch to zoom (where your fingers are), drag
 * while zoomed, double-tap to zoom in or out, swipe down to close.
 */
export function PhotoViewer({ uri, label, onClose }: { uri: string | null; label: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!uri} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {/* A Modal is its own window on Android: gestures need their own root inside it. */}
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        {uri ? <ZoomableImage key={uri} uri={uri} label={label} onClose={onClose} /> : null}
        <IconButton label="Close photo" tone="night" onPress={onClose} className="absolute right-4" style={{ top: insets.top + 8 }}>
          <X size={22} color="#fff" />
        </IconButton>
      </GestureHandlerRootView>
    </Modal>
  );
}

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

function ZoomableImage({ uri, label, onClose }: { uri: string; label: string; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    scale.value = 1;
    x.value = y.value = 0;
  }, [uri, scale, x, y]);

  // Keep the zoomed photo covering the screen: no panning past its edges.
  const clamp = (v: number, s: number, size: number) => {
    'worklet';
    const max = (size * (s - 1)) / 2;
    return Math.min(max, Math.max(-max, v));
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = scale.value;
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      const next = Math.min(MAX_SCALE, Math.max(1, startScale.value * e.scale));
      // Zoom towards the point between the fingers.
      const fx = e.focalX - width / 2;
      const fy = e.focalY - height / 2;
      const k = next / startScale.value;
      x.value = clamp(fx - (fx - startX.value) * k, next, width);
      y.value = clamp(fy - (fy - startY.value) * k, next, height);
      scale.value = next;
    })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withSpring(1);
        x.value = withSpring(0);
        y.value = withSpring(0);
      }
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate((e) => {
      if (scale.value > 1) {
        x.value = clamp(startX.value + e.translationX, scale.value, width);
        y.value = clamp(startY.value + e.translationY, scale.value, height);
      } else {
        // Not zoomed: drag down to dismiss.
        y.value = Math.max(0, e.translationY);
        fade.value = 1 - Math.min(0.6, y.value / height);
      }
    })
    .onEnd((e) => {
      if (scale.value > 1) return;
      if (y.value > 120 || e.velocityY > 900) {
        fade.value = withTiming(0, { duration: 150 }, () => runOnJS(onClose)());
      } else {
        y.value = withSpring(0);
        fade.value = withTiming(1);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        x.value = withTiming(0);
        y.value = withTiming(0);
      } else {
        const fx = e.x - width / 2;
        const fy = e.y - height / 2;
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        x.value = withTiming(clamp(-fx * (DOUBLE_TAP_SCALE - 1), DOUBLE_TAP_SCALE, width));
        y.value = withTiming(clamp(-fy * (DOUBLE_TAP_SCALE - 1), DOUBLE_TAP_SCALE, height));
      }
    });

  const style = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan))}>
      <Animated.View style={[{ flex: 1 }, style]} accessible accessibilityLabel={label} accessibilityHint="Pinch or double-tap to zoom">
        <Image source={{ uri }} style={{ width, height }} resizeMode="contain" />
      </Animated.View>
    </GestureDetector>
  );
}
