import { removeSticker, STICKERS_TOPIC, type Sticker } from '@us/shared';
import { useCouple, useStickers } from '@us/shared/react';
import { Image } from 'expo-image';
import { Plus, X } from 'lucide-react-native';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../ui/button';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';

const COLUMNS = 3;
type Item = { make: true } | Sticker;

/** Our stickers: make a new one, or tap one to send it. Long-press your own to take it out. */
export function StickerPicker({
  open,
  onClose,
  onMake,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onMake: () => void;
  onSend: (s: Sticker, url: string | undefined) => void;
}) {
  const { sb, me, channel } = useCouple();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { stickers, urls, loading, reload } = useStickers(open);
  const size = (width - 16 * 2 - 10 * (COLUMNS - 1)) / COLUMNS;
  const data: Item[] = [{ make: true }, ...stickers];

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-paper" style={{ paddingBottom: insets.bottom }}>
        <View className="flex-row items-center gap-2 px-4 pb-3" style={{ paddingTop: Platform.OS === 'android' ? insets.top + 10 : 16 }}>
          <Display className="flex-1 text-heading">Our stickers</Display>
          <IconButton label="Close" size="sm" onPress={onClose}>
            <X size={20} color={c.inkSoft} />
          </IconButton>
        </View>
        <FlatList
          data={data}
          numColumns={COLUMNS}
          keyExtractor={(s) => ('make' in s ? 'make' : s.id)}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 24 }}
          columnWrapperStyle={{ gap: 10 }}
          ListFooterComponent={
            loading ? (
              <ActivityIndicator color={c.rose} style={{ marginVertical: 16 }} />
            ) : !stickers.length ? (
              <Text className="px-2 pt-4 text-center text-small text-ink-soft">Make one from a photo: the person or thing is lifted out, then add text or a doodle.</Text>
            ) : undefined
          }
          renderItem={({ item }) =>
            'make' in item ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Make a sticker from a photo"
                onPress={onMake}
                style={{ width: size, height: size }}
                className="items-center justify-center gap-1.5 rounded-[18px] border-2 border-dashed border-rose-300 active:opacity-70"
              >
                <Plus size={24} color={c.onRose} />
                <Text className="text-center font-sans-semibold text-small text-rose-600">{'Make a\nsticker'}</Text>
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send sticker"
                accessibilityHint={item.created_by === me.id ? 'Long press to remove it from our stickers' : undefined}
                onPress={() => onSend(item, urls[item.path])}
                onLongPress={() => {
                  if (item.created_by !== me.id) return;
                  Alert.alert('Remove this sticker?', 'It leaves Our stickers. Messages you’ve sent with it stay.', [
                    { text: 'Keep it', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () =>
                        void removeSticker(sb, item.id)
                          .then(() => {
                            channel.sendChanged(STICKERS_TOPIC);
                            reload();
                          })
                          .catch(() => {}),
                    },
                  ]);
                }}
                style={{ width: size, height: size }}
                className="items-center justify-center rounded-[18px] bg-paper-sunken p-2 active:opacity-70"
              >
                {urls[item.path] ? <Image source={urls[item.path]} style={{ width: '100%', height: '100%' }} contentFit="contain" /> : null}
              </Pressable>
            )
          }
        />
      </View>
    </Modal>
  );
}
