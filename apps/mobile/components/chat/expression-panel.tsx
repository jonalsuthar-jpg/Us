import { rememberGif, saveSticker, searchGifs, STICKERS_TOPIC, type Gif, type GifKind, type Sticker } from '@us/shared';
import { cacheKey, readCache, useChatKey, useCouple, writeCache } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Search, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Platform, Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OurStickersGrid } from '../stickers/picker';
import { IconButton } from '../ui/button';
import { usePalette } from '../ui/palette';
import { Chip } from '../ui/segmented';
import { Text } from '../ui/text';

const COLUMNS = 3;
export type ExpressionTab = GifKind | 'ours';

/**
 * Stickers and GIFs, like WhatsApp's tray: GIPHY stickers and GIFs (what I
 * sent lately first, then trending, or a search), and Ours. Works on any
 * phone, whatever its keyboard. Long-press a GIPHY one to keep it in Ours.
 */
export function ExpressionPanel({
  open,
  initialTab = 'sticker',
  stickers,
  onClose,
  onPick,
  onSendOurs,
  onMake,
}: {
  open: boolean;
  initialTab?: ExpressionTab;
  /** Whether our stickers are on for this couple (the Ours tab). */
  stickers: boolean;
  onClose: () => void;
  onPick: (kind: GifKind, gif: Gif) => void;
  onSendOurs: (s: Sticker, url: string | undefined) => void;
  onMake: () => void;
}) {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const [tab, setTab] = useState<ExpressionTab>(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab === 'ours' && !stickers ? 'sticker' : initialTab);
  }, [open, initialTab, stickers]);

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-paper" style={{ paddingBottom: insets.bottom }}>
        {/* Android draws the sheet full screen, under the status bar: keep the header below it. */}
        <View className="flex-row items-center gap-2 px-4 pb-2" style={{ paddingTop: Platform.OS === 'android' ? insets.top + 10 : 16 }}>
          <View className="flex-1 flex-row gap-2">
            <Chip selected={tab === 'sticker'} onPress={() => setTab('sticker')}>
              Stickers
            </Chip>
            <Chip selected={tab === 'gif'} onPress={() => setTab('gif')}>
              GIFs
            </Chip>
            {stickers ? (
              <Chip selected={tab === 'ours'} onPress={() => setTab('ours')}>
                Ours
              </Chip>
            ) : null}
          </View>
          <IconButton label="Close" size="sm" onPress={onClose}>
            <X size={20} color={c.inkSoft} />
          </IconButton>
        </View>
        {tab === 'ours' ? (
          <OurStickersGrid active={open} onMake={onMake} onSend={onSendOurs} />
        ) : (
          <GiphyGrid key={tab} kind={tab} open={open} stickers={stickers} onPick={(g) => onPick(tab, g)} />
        )}
      </View>
    </Modal>
  );
}

type Recent = { kind: GifKind; gif: Gif };

function GiphyGrid({ kind, open, stickers, onPick }: { kind: GifKind; open: boolean; stickers: boolean; onPick: (g: Gif) => void }) {
  const { sb, couple, me, channel } = useCouple();
  const { sealer } = useChatKey();
  const c = usePalette();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const seq = useRef(0);
  const size = (width - 16 * 2 - 6 * (COLUMNS - 1)) / COLUMNS;
  const recentKey = cacheKey(couple.id, 'chat:recent-gifs');
  const recent = query ? [] : (readCache<Recent[]>(recentKey) ?? []).filter((r) => r.kind === kind).map((r) => r.gif);
  const data = [...recent, ...items.filter((g) => !recent.some((r) => r.id === g.id))];

  async function load(reset: boolean) {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const next = await searchGifs(sb, kind, query, reset ? 0 : items.length);
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

  function pick(g: Gif) {
    const all = readCache<Recent[]>(recentKey) ?? [];
    const mineOfKind = rememberGif(all.filter((r) => r.kind === kind).map((r) => r.gif), g);
    writeCache(recentKey, [...mineOfKind.map((gif) => ({ kind, gif })), ...all.filter((r) => r.kind !== kind)]);
    onPick(g);
  }

  /** Keep a GIPHY one in Ours: its file is copied into our folder, so it's ours to send again. */
  function keep(g: Gif) {
    if (!stickers) return;
    void Haptics.selectionAsync().catch(() => {});
    Alert.alert('Add to Our stickers?', 'It’s saved for both of you to send again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Add',
        onPress: async () => {
          try {
            const bytes = await (await fetch(g.url)).arrayBuffer();
            await saveSticker(sb, { coupleId: couple.id, me: me.id, png: bytes, mime: 'image/gif', width: g.width, height: g.height, cipher: await sealer() });
            channel.sendChanged(STICKERS_TOPIC);
            setNote('Added to Our stickers');
          } catch {
            setNote('That didn’t save. Try again.');
          }
          setTimeout(() => setNote(null), 3000);
        },
      },
    ]);
  }

  return (
    <>
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
      {note ? <Text className="px-4 pb-2 text-small text-ink-soft">{note}</Text> : null}
      <FlatList
        data={data}
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
            accessibilityHint={stickers ? 'Long press to add it to Our stickers' : undefined}
            onPress={() => pick(item)}
            onLongPress={() => keep(item)}
            style={{ width: size, height: size }}
            className="overflow-hidden rounded-control bg-paper-sunken active:opacity-70"
          >
            <Image
              source={item.previewUrl}
              placeholder={item.still ? { uri: item.still } : undefined}
              style={{ width: '100%', height: '100%' }}
              contentFit={kind === 'sticker' ? 'contain' : 'cover'}
              autoplay
            />
          </Pressable>
        )}
      />
      {/* GIPHY's attribution, as their terms ask. */}
      <Text className="py-2 text-center text-micro text-ink-muted">Powered by GIPHY</Text>
    </>
  );
}
