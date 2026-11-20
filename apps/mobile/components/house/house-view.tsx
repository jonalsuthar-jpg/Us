import AsyncStorage from '@react-native-async-storage/async-storage';
import { Canvas, events as touchEvents } from '@react-three/fiber/native';
import { createControls, HouseWorld, LOOKS, orbitBy, QUALITIES, tapAt, useHousePresence, zoomBy, type Emote, type Quality } from '@us/shared/house';
import { useCouple } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Gauge, Hand, Heart, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, PixelRatio, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../ui/text';

const QUALITY_KEY = 'us.house.quality';
const QUALITY_LABEL: Record<Quality, string> = { low: 'Smooth', medium: 'Balanced', high: 'Best looking' };
const DPR: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };

/** Taps and drags reach the scene through our gestures, not R3F's own raycasting on every move. */
const noEvents: typeof touchEvents = (store) => ({ ...touchEvents(store), enabled: false });

/**
 * Inside Our House, full screen in landscape. Tap the floor to walk there,
 * drag to look around, pinch to zoom. Loaded only when the house opens
 * (see app/(app)/house.tsx), so three.js stays out of app start.
 */
export function HouseView() {
  const insets = useSafeAreaInsets();
  const { partner, mySlot } = useCouple();
  const { presence } = useHousePresence();
  const controls = useMemo(createControls, []);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [quality, setQuality] = useState<Quality | null>(null);
  const [place, setPlace] = useState('');
  const [partnerPlace, setPartnerPlace] = useState<string | null>(null);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [fps, setFps] = useState(0);
  const stepped = useRef(false);

  useEffect(() => {
    void AsyncStorage.getItem(QUALITY_KEY)
      .catch(() => null)
      .then((q) => setQuality(QUALITIES.includes(q as Quality) ? (q as Quality) : 'medium'));
  }, []);

  // Nothing draws while the app is in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  const chooseQuality = (q: Quality) => {
    setQuality(q);
    stepped.current = true;
    void AsyncStorage.setItem(QUALITY_KEY, q).catch(() => {});
  };

  // The first few seconds decide: a phone that can't keep up steps down once.
  const onFps = useCallback(
    (f: number) => {
      setFps(Math.round(f));
      if (stepped.current || !quality) return;
      stepped.current = true;
      if (f < 22 && quality !== 'low') chooseQuality(quality === 'high' ? 'medium' : 'low');
    },
    [quality],
  );

  const gesture = useMemo(() => {
    let lastScale = 1;
    const pan = Gesture.Pan()
      .minDistance(8)
      .maxPointers(1)
      .runOnJS(true)
      .onChange((e) => orbitBy(controls, e.changeX, e.changeY, size.w));
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onBegin(() => {
        lastScale = 1;
      })
      .onChange((e) => {
        zoomBy(controls, e.scale / lastScale);
        lastScale = e.scale;
      });
    const tap = Gesture.Tap()
      .maxDistance(10)
      .runOnJS(true)
      .onEnd((e, ok) => {
        if (ok) tapAt(controls, e.x, e.y, size.w, size.h);
      });
    return Gesture.Race(tap, Gesture.Simultaneous(pan, pinch));
  }, [controls, size]);

  const emote = (e: Emote) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    controls.emotes.push(e);
  };

  // expo-gl always draws at the screen's full density, so the canvas is laid
  // out smaller and scaled up: the quality setting decides the pixel count.
  const scale = quality ? Math.min(1, DPR[quality] / PixelRatio.get()) : 1;
  const mine = LOOKS[mySlot === 'a' ? 0 : 1]!;
  const theirs = LOOKS[mySlot === 'a' ? 1 : 0]!;
  const name = partner.display_name;
  const pad = { left: Math.max(insets.left, 16), right: Math.max(insets.right, 16), top: Math.max(insets.top, 12), bottom: Math.max(insets.bottom, 12) };

  return (
    <View className="flex-1 bg-[#BFDDF2]" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {quality && size.w > 0 ? (
        <GestureDetector gesture={gesture}>
          <View className="flex-1 overflow-hidden" collapsable={false}>
            <View
              pointerEvents="none"
              style={{ position: 'absolute', width: size.w * scale, height: size.h * scale, left: (size.w * (1 - scale)) / 2, top: (size.h * (1 - scale)) / 2, transform: [{ scale: 1 / scale }] }}
            >
              <Canvas
                key={quality}
                shadows={quality !== 'low'}
                frameloop={!active ? 'never' : quality === 'low' ? 'demand' : 'always'}
                camera={{ fov: 50, near: 0.1, far: 200 }}
                events={noEvents}
              >
                <HouseWorld quality={quality} controls={controls} presence={presence} mine={mine} theirs={theirs} onPlace={setPlace} onPartnerPlace={setPartnerPlace} onFps={onFps} />
              </Canvas>
            </View>
          </View>
        </GestureDetector>
      ) : null}

      {/* Top left: out, and where I am. */}
      <View className="absolute flex-row items-center gap-3" style={{ left: pad.left, top: pad.top }} pointerEvents="box-none">
        <Pressable accessibilityRole="button" accessibilityLabel="Leave the house" onPress={() => router.back()} hitSlop={8} className="h-11 w-11 items-center justify-center rounded-full bg-black/35 active:bg-black/50">
          <X size={22} color="#fff" />
        </Pressable>
        {place ? (
          <View className="rounded-full bg-black/35 px-3.5 py-2">
            <Text className="font-sans-medium text-small text-white">{place}</Text>
          </View>
        ) : null}
      </View>

      {/* Top middle: where my partner is. */}
      <View className="absolute left-0 right-0 items-center" style={{ top: pad.top }} pointerEvents="none">
        <View className="flex-row items-center gap-2 rounded-full bg-black/35 px-3.5 py-2">
          <View className={partnerPlace ? 'h-2 w-2 rounded-full bg-sage-400' : 'h-2 w-2 rounded-full bg-white/50'} />
          <Text className="text-small text-white">{partnerPlace ? `${name} · ${partnerPlace}` : `${name} isn’t in the house`}</Text>
        </View>
      </View>

      {/* Right edge: wave, heart, picture quality. */}
      <View className="absolute gap-3" style={{ right: pad.right, bottom: pad.bottom }} pointerEvents="box-none">
        <RoundButton label="Wave" onPress={() => emote('wave')}>
          <Hand size={22} color="#fff" />
        </RoundButton>
        <RoundButton label="Send a heart" onPress={() => emote('heart')}>
          <Heart size={22} color="#fff" fill="#FF4D7D" />
        </RoundButton>
        {quality ? (
          <RoundButton label={`Picture: ${QUALITY_LABEL[quality]}. Tap to change`} onPress={() => chooseQuality(QUALITIES[(QUALITIES.indexOf(quality) + 1) % QUALITIES.length]!)}>
            <Gauge size={20} color="#fff" />
            <Text className="text-[9px] text-white">{quality === 'low' ? 'Smooth' : quality === 'medium' ? 'Balanced' : 'Best'}</Text>
          </RoundButton>
        ) : null}
      </View>

      {__DEV__ && fps ? (
        <View className="absolute rounded bg-black/50 px-2 py-0.5" style={{ left: pad.left, bottom: pad.bottom }} pointerEvents="none">
          <Text className="text-[11px] text-white">{`${fps} fps`}</Text>
        </View>
      ) : null}
    </View>
  );
}

function RoundButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} className="h-14 w-14 items-center justify-center rounded-full bg-black/35 active:bg-black/50">
      {children}
    </Pressable>
  );
}
