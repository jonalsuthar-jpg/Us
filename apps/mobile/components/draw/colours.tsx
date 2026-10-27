import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorOf, DRAW_COLORS, hslToHex, isDrawColor, isLight, normalizeColor, type DrawColor } from '@us/shared';
import { Check, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';
import { Slider } from './slider';

const RECENT_KEY = 'us.draw.recent-colours';
const START: DrawColor[] = [1, 0, 6, 4, 2, 8];
let shared: DrawColor[] | null = null;
const listeners = new Set<(c: DrawColor[]) => void>();

/** The last six colours I drew with, kept on this phone. */
export function useRecentColours(): [DrawColor[], (c: DrawColor) => void] {
  const [recent, setRecent] = useState<DrawColor[]>(shared ?? START);
  useEffect(() => {
    listeners.add(setRecent);
    if (!shared) {
      void AsyncStorage.getItem(RECENT_KEY)
        .then((raw) => {
          const list = raw ? (JSON.parse(raw) as unknown[]).filter(isDrawColor) : [];
          shared = list.length ? list.slice(0, 6) : START;
          listeners.forEach((fn) => fn(shared!));
        })
        .catch(() => {});
    }
    return () => void listeners.delete(setRecent);
  }, []);
  const push = useCallback((c: DrawColor) => {
    const n = normalizeColor(c);
    const next = [n, ...(shared ?? START).filter((x) => colorOf(x) !== colorOf(n))].slice(0, 6);
    shared = next;
    listeners.forEach((fn) => fn(next));
    void AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
  }, []);
  return [recent, push];
}

/** A colour dot; light colours get a hairline so white shows on white. */
export function Swatch({ c, size, selected }: { c: DrawColor; size: number; selected?: boolean }) {
  const hex = colorOf(c);
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: hex,
        borderWidth: isLight(hex) ? 1 : 0,
        borderColor: '#E9E2E8',
      }}
    >
      {selected ? <Check size={size * 0.45} color={isLight(hex) ? '#241933' : '#FFFFFF'} strokeWidth={3} /> : null}
    </View>
  );
}

/** The palette, a custom colour (hue and lightness), and recent colours. */
export function ColourSheet({ open, onClose, value, onPick }: { open: boolean; onClose: () => void; value: DrawColor; onPick: (c: DrawColor) => void }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const [recent] = useRecentColours();
  const [hue, setHue] = useState(0.72);
  const [light, setLight] = useState(0.55);
  const custom = hslToHex(hue * 360, 0.8, light);
  const current = colorOf(value);
  const pick = (col: DrawColor) => {
    onPick(col);
    onClose();
  };

  return (
    <Modal visible={open} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 justify-end bg-plum-900/45">
          <Pressable accessibilityLabel="Close" className="flex-1" onPress={onClose} />
          <View className="gap-3.5 rounded-t-[26px] bg-paper px-5 pt-2.5" style={{ paddingBottom: insets.bottom + 24 }}>
            <View className="h-[5px] w-10 self-center rounded-full bg-plum-200" />
            <View className="flex-row items-center">
              <Display className="flex-1 text-heading">Colours</Display>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} className="h-11 w-11 items-center justify-center rounded-[14px] bg-paper-sunken">
                <X size={18} color={c.inkSoft} />
              </Pressable>
            </View>
            <View accessibilityRole="radiogroup" accessibilityLabel="Palette" className="flex-row flex-wrap justify-between gap-y-3">
              {DRAW_COLORS.map((col, i) => (
                <Pressable
                  key={col.hex}
                  accessibilityRole="radio"
                  accessibilityLabel={col.name}
                  accessibilityState={{ checked: current === col.hex }}
                  onPress={() => pick(i)}
                  className="w-[20%] items-center"
                >
                  <Swatch c={i} size={52} selected={current === col.hex} />
                </Pressable>
              ))}
            </View>
            <View className="gap-2.5 rounded-[18px] bg-paper-sunken p-3.5">
              <Text className="font-sans-bold text-micro uppercase tracking-[0.5px] text-ink-muted">Custom</Text>
              <View className="flex-row">
                <Slider label="Hue" value={hue} onChange={setHue} thumb={hslToHex(hue * 360, 0.8, 0.5)} stops={['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000']} />
              </View>
              <View className="flex-row">
                <Slider label="Lightness" value={light} onChange={setLight} thumb={custom} stops={['#000000', hslToHex(hue * 360, 0.8, 0.5), '#FFFFFF']} />
              </View>
              <View className="flex-row items-center gap-2.5">
                <Swatch c={custom} size={40} />
                <Text className="flex-1 font-sans-semibold text-body" style={{ fontFamily: 'monospace' }}>
                  {custom}
                </Text>
                <Pressable accessibilityRole="button" onPress={() => pick(custom)} className="h-10 justify-center rounded-control bg-rose-600 px-3.5 active:bg-rose-700">
                  <Text className="font-sans-semibold text-body text-white">Use this colour</Text>
                </Pressable>
              </View>
            </View>
            <View className="gap-2">
              <Text className="font-sans-bold text-micro uppercase tracking-[0.5px] text-ink-muted">Recent</Text>
              <View className="flex-row gap-2.5">
                {recent.map((r, i) => (
                  <Pressable key={`${String(r)}-${i}`} accessibilityRole="button" accessibilityLabel={`Recent colour ${colorOf(r)}`} onPress={() => pick(r)}>
                    <Swatch c={r} size={34} />
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
