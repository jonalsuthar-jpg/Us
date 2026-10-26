import { markDoodleSeen, type Drawing } from '@us/shared';
import { useCouple, useDrawings, usePartnerDrawing, useUnseenDoodles } from '@us/shared/react';
import { router } from 'expo-router';
import { PenLine, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';
import { DoodleSheet } from './doodle-sheet';

/** "{name} is drawing · Join", while my partner has the live canvas open. */
export function DrawingBanner() {
  const { partner } = useCouple();
  const drawing = usePartnerDrawing();
  if (!drawing) return null;
  return (
    <View accessibilityRole="alert" className="flex-row items-center gap-3 rounded-[18px] bg-teal-900 py-3 pl-3.5 pr-3">
      <View className="h-[38px] w-[38px] items-center justify-center rounded-xl bg-teal-500">
        <PenLine size={18} color="#fff" />
      </View>
      <View className="flex-1">
        <Text className="font-sans-semibold text-body text-paper">{`${partner.display_name} is drawing`}</Text>
        <Text className="text-micro text-teal-200">Draw on the same canvas</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.push('/draw')} className="h-10 justify-center rounded-xl bg-paper px-4">
        <Text className="font-sans-semibold text-body text-teal-900">Join</Text>
      </Pressable>
    </View>
  );
}

/** The doodle my partner left me, as a sticky note until I open it; then "Doodle back". */
export function DoodleNote() {
  const { sb, partner } = useCouple();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { doodles, reload } = useUnseenDoodles();
  const { urls, reload: reloadUrls } = useDrawings();
  const [open, setOpen] = useState<Drawing | null>(null);
  const [back, setBack] = useState(false);
  const doodle = doodles[0];
  const name = partner.display_name;

  useEffect(() => {
    if (doodle && !urls[doodle.png_path]) reloadUrls();
  }, [doodle, urls, reloadUrls]);

  if (!doodle) return <DoodleSheet open={back} onClose={() => setBack(false)} />;
  const url = urls[doodle.png_path];
  const noteW = Math.min(300, width - 64);

  return (
    <View className="gap-4">
      <View className="items-center px-2 pt-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${name}’s doodle`}
          onPress={() => {
            setOpen(doodle);
            void markDoodleSeen(sb, doodle.id).catch(() => {});
          }}
          style={{
            width: noteW,
            transform: [{ rotate: '-2.5deg' }],
            backgroundColor: '#FFEDC0',
            borderTopLeftRadius: 6,
            borderTopRightRadius: 6,
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 22,
            elevation: 8,
            shadowColor: '#7C5006',
            shadowOpacity: 0.18,
            shadowRadius: 15,
            shadowOffset: { width: 0, height: 16 },
          }}
          className="px-[18px] pb-4 pt-[18px]"
        >
          <View pointerEvents="none" className="absolute -top-3 h-6 w-[86px] rounded-[3px] bg-white/65" style={{ left: noteW / 2 - 43, transform: [{ rotate: '3deg' }] }} />
          <View className="flex-row items-center justify-between">
            <Text className="font-sans-bold text-micro uppercase tracking-[0.5px] text-gold-700">A doodle for you</Text>
            <View className="rounded-full bg-rose-600 px-2 py-0.5">
              <Text className="font-sans-bold text-[12px] leading-[15px] text-white">New</Text>
            </View>
          </View>
          <View className="my-1.5 overflow-hidden" style={{ height: ((noteW - 36) * 230) / 264 }}>
            {url ? <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
          </View>
          <Display light italic className="text-lead text-gold-800">
            {doodle.note ? `“${doodle.note}” — ${name}` : `— ${name}`}
          </Display>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" onPress={() => setBack(true)} className="flex-row items-center gap-3 rounded-[20px] bg-paper-sunken px-4 py-3.5">
        <View className="h-11 w-11 items-center justify-center rounded-[14px] bg-rose-100">
          <PenLine size={20} color={c.onRose} />
        </View>
        <View className="flex-1">
          <Text className="font-sans-semibold text-body">Doodle back</Text>
          <Text className="text-micro text-ink-soft">{`Leave ${name} one in return`}</Text>
        </View>
      </Pressable>

      <Modal visible={!!open} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setOpen(null)}>
        <View className="flex-1 justify-center bg-plum-900/80 px-5" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <View className="gap-4 rounded-[26px] bg-paper p-5">
            <View className="flex-row items-center">
              <Display className="flex-1 text-heading">{`From ${name}`}</Display>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => {
                  setOpen(null);
                  reload();
                }}
                className="h-11 w-11 items-center justify-center rounded-[14px] bg-paper-sunken"
              >
                <X size={18} color={c.inkSoft} />
              </Pressable>
            </View>
            {open?.note ? <Text className="text-body text-ink-soft">{open.note}</Text> : null}
            {open && urls[open.png_path] ? (
              <Image source={{ uri: urls[open.png_path] }} className="w-full rounded-[18px] border border-paper-edge bg-white" style={{ aspectRatio: 3 / 4 }} />
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setOpen(null);
                reload();
                setBack(true);
              }}
              className="h-[52px] flex-row items-center justify-center gap-2 rounded-control bg-rose-600"
            >
              <PenLine size={18} color="#fff" />
              <Text className="font-sans-semibold text-body text-white">Doodle back</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <DoodleSheet open={back} onClose={() => setBack(false)} />
    </View>
  );
}
