import { searchGifs, type Gif, type GifKind } from '@us/shared';
import { Image } from 'expo-image';
import { Search, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Platform, Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { env } from '@/lib/env';
import { IconButton } from '../ui/button';
import { usePalette } from '../ui/palette';
import { Chip } from '../ui/segmented';
import { Text } from '../ui/text';

const COLUMNS = 3;

/** GIFs and stickers from GIPHY: trending until you search. */
export function GifPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (kind: GifKind, gif: Gif) => void }) {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const { width } = useWindowDimensions();
  const [kind, setKind] = useState<GifKind>('gif');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const size = (width - 16 * 2 - 6 * (COLUMNS - 1)) / COLUMNS;

  async function load(reset: boolean) {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const next = await searchGifs(env.giphyKey, kind, query, reset ? 0 : items.length);
      if (mine !== seq.current) return;
      setItems((prev) => (reset ? next : [...prev, ...next.filter((g) => !prev.some((p) => p.id === g.id))]));
    } catch (e) {
      if (mine === seq.current) setError((e as Error).message);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(true), query ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, query]);

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-paper" style={{ paddingBottom: insets.bottom }}>
        {/* Android draws the sheet full screen, under the status bar: keep the header below it. */}
        <View className="flex-row items-center gap-2 px-4 pb-2" style={{ paddingTop: Platform.OS === 'android' ? insets.top + 10 : 16 }}>
          <View className="flex-1 flex-row gap-2">
            <Chip selected={kind === 'gif'} onPress={() => setKind('gif')}>
              GIFs
            </Chip>
            <Chip selected={kind === 'sticker'} onPress={() => setKind('sticker')}>
              Stickers
            </Chip>
          </View>
          <IconButton label="Close" size="sm" onPress={onClose}>
            <X size={20} color={c.inkSoft} />
          </IconButton>
        </View>
        <View className="mx-4 mb-3 h-11 flex-row items-center gap-2 rounded-control bg-paper-sunken px-3">
          <Search size={18} color={c.inkMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={kind === 'gif' ? 'Search GIFs' : 'Search stickers'}
            placeholderTextColor={c.placeholder}
            accessibilityLabel={kind === 'gif' ? 'Search GIFs' : 'Search stickers'}
            returnKeyType="search"
            className="flex-1 font-sans text-body text-ink"
          />
        </View>
        {error ? <Text className="px-4 pb-2 text-small text-rose-700">{error}</Text> : null}
        <FlatList
          data={items}
          key={kind}
          numColumns={COLUMNS}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}
          columnWrapperStyle={{ gap: 6 }}
          keyboardShouldPersistTaps="handled"
          // Every preview animates, so keep only about a screen of them alive.
          initialNumToRender={12}
          maxToRenderPerBatch={9}
          windowSize={3}
          removeClippedSubviews
          onEndReached={() => !loading && items.length && void load(false)}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loading ? <ActivityIndicator color={c.rose} style={{ marginVertical: 16 }} /> : undefined}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Send ${item.title}`}
              onPress={() => onPick(kind, item)}
              style={{ width: size, height: size }}
              className="overflow-hidden rounded-control bg-paper-sunken active:opacity-70"
            >
              <Image source={item.previewUrl} style={{ width: '100%', height: '100%' }} contentFit={kind === 'sticker' ? 'contain' : 'cover'} autoplay />
            </Pressable>
          )}
        />
        {/* GIPHY's attribution, as their terms ask. */}
        <Text className="py-2 text-center text-micro text-ink-muted">Powered by GIPHY</Text>
      </View>
    </Modal>
  );
}
