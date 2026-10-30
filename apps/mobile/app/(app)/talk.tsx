import { clusters, formatDay, groupByDay, isLinkedMedia, isOurStickerPath, keepSticker, listPinned, messagePreview, MORE_REACTIONS, QUICK_REACTIONS, searchMessages, snapReplyQuote, STICKERS_TOPIC, type CallMedia, type Message, type PartnerSlot, type Sticker as OurSticker } from '@us/shared';
import { cacheKey, readCache, useCallManager, useChatMedia, useCouple, useCoupleData, useFeature, useMessages, useSnaps, useTyping, writeCache } from '@us/shared/react';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, ChevronsDown, Copy, Phone, Pin, PinOff, Plus, Reply, Search, Sticker, Video } from 'lucide-react-native';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, FlatList, Modal, Platform, Pressable, TextInput, View, type ListRenderItem } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AttachSheet, ATTACH_ICONS, ATTACH_TINTS, type AttachOption } from '@/components/chat/attach-sheet';
import { Bubble, CallEntry, type ReplyQuote } from '@/components/chat/bubble';
import { CameraSheet } from '@/components/chat/camera-sheet';
import { Composer } from '@/components/chat/composer';
import { SwipeableRow } from '@/components/chat/swipeable-row';
import { DoodleSheet } from '@/components/draw/doodle-sheet';
import { StickerMaker } from '@/components/stickers/maker';
import { StickerPicker } from '@/components/stickers/picker';
import { FeatureOff } from '@/components/feature-off';
import { GifPicker } from '@/components/chat/gif-picker';
import { clearMessageNotifications } from '@/modules/us-call';
import { env } from '@/lib/env';
import { preparePhoto, type ReadyPhoto } from '@/lib/photo';
import { TypingBubble } from '@/components/chat/typing-bubble';
import { Avatar } from '@/components/ui/avatar';
import { IconButton } from '@/components/ui/button';
import { Display, Text } from '@/components/ui/text';
import { usePalette } from '@/components/ui/palette';
import { FormSheet } from '@/components/ui/form-sheet';
import { PhotoViewer } from '@/components/ui/photo-viewer';
import { cn } from '@/components/ui/cn';

type Row =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'msg'; key: string; message: Message; first: boolean; last: boolean; quote: ReplyQuote | null };

/** True while this screen is focused and the app is in the foreground. */
function useViewing() {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return focused && active;
}

/** Back to the tabs. Opened from a notification on a cold start, there may be nothing behind chat. */
function leaveChat() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

function BackButton() {
  const c = usePalette();
  return (
    <IconButton label="Back" size="sm" onPress={leaveChat}>
      <ArrowLeft size={22} color={c.ink} />
    </IconButton>
  );
}

export default function Talk() {
  const chat = useFeature('chat');
  const insets = useSafeAreaInsets();
  if (!chat) {
    return (
      <View className="flex-1 px-5" style={{ paddingTop: insets.top + 8 }}>
        <View className="flex-row">
          <BackButton />
        </View>
        <View className="flex-1 justify-center">
          <FeatureOff />
        </View>
      </View>
    );
  }
  return <Thread />;
}

function Thread() {
  const insets = useSafeAreaInsets();
  const { sb, couple, me, partner, mySlot, partnerSlot, partnerOnline, photoOf, channel } = useCouple();
  const partnerPhoto = photoOf(partnerSlot);
  const viewing = useViewing();
  // Reading the chat: the gathered "new messages" notification is done with.
  useEffect(() => {
    if (viewing) clearMessageNotifications();
  }, [viewing]);
  const { messages, loading, hasOlder, loadingOlder, olderFailed, loadOlder, send, retry, react, pin } = useMessages({ viewing });
  const media = useChatMedia(messages);
  const [acting, setActing] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [panel, setPanel] = useState<'search' | 'pins' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gifs, setGifs] = useState(false);
  const [attach, setAttach] = useState(false);
  const [camera, setCamera] = useState(false);
  const list = useRef<FlatList<Row>>(null);
  // This screen closes when you leave it, so what you were typing is kept for when you're back.
  const draftKey = cacheKey(couple.id, 'chat:draft');

  const pins = useCoupleData('chat:pins', () => listPinned(sb, couple.id), [sb, couple.id]);
  const pinSignature = useMemo(() => messages.map((m) => (m.pinned_at ? m.id : '')).join(''), [messages]);
  useEffect(() => {
    void pins.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinSignature]);

  const authorOf = useCallback((m: Pick<Message, 'sender_id'>) => (m.sender_id === me.id ? 'You' : partner.display_name), [me.id, partner.display_name]);
  const snaps = useSnaps();
  const say = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 4000);
  }, []);
  const fail = useCallback((e: unknown) => say((e as Error).message ?? 'That didn’t work. Try again.'), [say]);

  function sendWithReply(text: string, extras: Parameters<typeof send>[1] = {}) {
    send(text, { ...extras, replyTo: replyTo?.id ?? null });
    setReplyTo(null);
  }

  const draw = useFeature('draw');
  const [doodle, setDoodle] = useState(false);
  const stickersOn = useFeature('stickers');
  const [stickerPicker, setStickerPicker] = useState(false);
  const [stickerMaker, setStickerMaker] = useState(false);

  function sendSticker(st: OurSticker, url?: string) {
    sendWithReply('', { media: { kind: 'sticker', path: st.path, meta: { width: st.width, height: st.height }, localUri: url } });
  }

  async function sendImage(p: ReadyPhoto, caption: string) {
    const bytes = await (await fetch(p.uri)).arrayBuffer();
    sendWithReply(caption, {
      media: { kind: 'image', meta: { width: p.width, height: p.height }, localUri: p.uri, upload: { body: bytes, contentType: p.mimeType } },
    });
  }

  /** Several at once from the gallery, each its own message, as in WhatsApp. */
  async function sendFromGallery() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: true, selectionLimit: 10 });
    if (res.canceled) return;
    for (const a of res.assets) await sendImage(await preparePhoto(a.uri, a.width, a.height), '');
  }

  async function sendVoice(uri: string, durationMs: number) {
    const bytes = await (await fetch(uri)).arrayBuffer();
    sendWithReply('', {
      media: { kind: 'audio', meta: { duration_ms: Math.round(durationMs) }, localUri: uri, upload: { body: bytes, contentType: 'audio/mp4' } },
    });
  }
  const { partnerTyping, onComposerChange, onComposerSent } = useTyping();
  const calls = useCallManager();
  const c = usePalette();

  // Inverted list → newest first. Reply quotes are worked out here, once per
  // change, and an unchanged quote stays the same object, so rows keep the same
  // props and don't redraw while scrolling or when older messages load.
  const quotes = useRef(new Map<string, ReplyQuote>());
  const rows = useMemo<Row[]>(() => {
    const byId = new Map(messages.map((m) => [m.id, m]));
    const allSnaps = [...(snaps.data?.mine ?? []), ...(snaps.data?.partner ?? [])];
    const buildQuote = (m: Message): ReplyQuote | null => {
      const snap = snapReplyQuote(m, me.id, partner.display_name, allSnaps);
      if (snap) return { id: `snap-${m.snap_id}`, ...snap };
      if (!m.reply_to) return null;
      const r = byId.get(m.reply_to);
      return r ? { id: r.id, author: authorOf(r), text: messagePreview(r) } : { id: m.reply_to, author: 'Earlier message', text: 'Scroll up to see it' };
    };
    const quoteFor = (m: Message): ReplyQuote | null => {
      const next = buildQuote(m);
      if (!next) return null;
      const was = quotes.current.get(m.id);
      if (was && was.id === next.id && was.author === next.author && was.text === next.text) return was;
      quotes.current.set(m.id, next);
      return next;
    };
    const out: Row[] = [];
    for (const g of groupByDay(messages)) {
      out.push({ kind: 'day', key: `day-${g.key}`, label: g.day });
      g.items.forEach((m, i) =>
        out.push({ kind: 'msg', key: m.id, message: m, first: !clusters(g.items[i - 1], m), last: !clusters(m, g.items[i + 1]), quote: quoteFor(m) }),
      );
    }
    return out.reverse();
  }, [messages, snaps.data, me.id, partner.display_name, authorOf]);

  // Scrolled up: a button to jump back to the latest, counting what arrived meanwhile.
  const [away, setAway] = useState(false);
  const awayRef = useRef(false);
  const [newBelow, setNewBelow] = useState(0);
  const newest = messages[messages.length - 1];
  const seenNewest = useRef(newest?.id);
  useEffect(() => {
    if (!newest || newest.id === seenNewest.current) return;
    seenNewest.current = newest.id;
    if (away && newest.sender_id !== me.id) setNewBelow((n) => n + 1);
    // My own new message brings me back down, as in any messenger.
    if (away && newest.sender_id === me.id) list.current?.scrollToOffset({ offset: 0, animated: true });
  }, [newest, away, me.id]);
  function toLatest() {
    list.current?.scrollToOffset({ offset: 0, animated: true });
    setNewBelow(0);
  }

  // Older messages load as you near the top. FlatList's onEndReached fires once
  // per content height, so a missed or failed load stuck the thread until you
  // scrolled away and back; this looks at where the list actually is, every time.
  const listBox = useRef({ offset: 0, visible: 0, content: 0 });
  const canLoadOlder = hasOlder && !olderFailed;
  const checkNearOldest = () => {
    const { offset, visible, content } = listBox.current;
    if (canLoadOlder && visible > 0 && content - visible - offset < visible * 1.5) void loadOlder();
  };

  function jumpTo(id: string) {
    const index = rows.findIndex((r) => r.key === id);
    if (index < 0) return false;
    list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    setHighlight(id);
    setTimeout(() => setHighlight(null), 1600);
    return true;
  }
  const pick = (m: Message) => {
    setPanel(null);
    if (!jumpTo(m.id)) say(`That one is from ${formatDay(m.created_at)}. Scroll up to load it.`);
  };
  const latestPin = pins.data?.[0];

  // The rows get the same functions every render; they reach the latest
  // state through this ref, so a new message or a typing ping redraws nothing else.
  const latest = useRef({ retry, react, jumpTo, fail, say, startCall: calls.startCall });
  latest.current = { retry, react, jumpTo, fail, say, startCall: calls.startCall };
  const onRetry = useCallback((id: string) => latest.current.retry(id), []);
  const onReact = useCallback((m: Message, emoji: string | null) => void latest.current.react(m.id, emoji).catch(latest.current.fail), []);
  const onLongPress = useCallback((m: Message) => {
    if (m.pending || m.failed) return;
    void Haptics.selectionAsync().catch(() => {});
    setActing(m);
  }, []);
  const onReply = useCallback((m: Message) => setReplyTo(m), []);
  const onJumpTo = useCallback((id: string) => {
    if (!id.startsWith('snap-') && !latest.current.jumpTo(id)) latest.current.say('That message is further up. Scroll up to load it.');
  }, []);
  const onCallBack = useCallback((m: CallMedia) => void latest.current.startCall(m), []);

  const renderItem = useCallback<ListRenderItem<Row>>(
    ({ item }) =>
      item.kind === 'day' ? (
        <DaySeparator label={item.label} />
      ) : item.message.kind === 'call' ? (
        <CallEntry message={item.message} myId={me.id} onCallBack={onCallBack} />
      ) : (
        <MessageRow
          message={item.message}
          mine={item.message.sender_id === me.id}
          slot={item.message.sender_id === me.id ? mySlot : partnerSlot}
          authorName={partner.display_name}
          myId={me.id}
          first={item.first}
          last={item.last}
          mediaUrl={item.message.media_path ? media[item.message.media_path] : undefined}
          quote={item.quote}
          highlighted={highlight === item.message.id}
          // Only rows that play something care, so leaving the app doesn't redraw the rest.
          animate={isLinkedMedia(item.message.media_kind) ? viewing : true}
          onRetry={onRetry}
          onLongPress={onLongPress}
          onReact={onReact}
          onReply={onReply}
          onOpenPhoto={setPhoto}
          onJumpTo={onJumpTo}
        />
      ),
    [me.id, mySlot, partnerSlot, partner.display_name, media, highlight, viewing, onRetry, onLongPress, onReact, onReply, onJumpTo, onCallBack],
  );
  const typingHeader = useMemo(() => <TypingBubble visible={partnerTyping} name={partner.display_name} slot={partnerSlot} />, [partnerTyping, partner.display_name, partnerSlot]);
  const olderFooter = olderFailed ? (
    <Pressable accessibilityRole="button" onPress={() => void loadOlder()} className="items-center py-4">
      <Text className="font-sans-medium text-small text-rose-700">Couldn’t load older messages. Tap to try again</Text>
    </Pressable>
  ) : loadingOlder ? (
    <View className="items-center py-4">
      <ActivityIndicator color={c.rose} />
    </View>
  ) : undefined;

  const attachOptions: AttachOption[] = [
    { key: 'gallery', label: 'Gallery', icon: ATTACH_ICONS.gallery, tint: ATTACH_TINTS.gallery, onPress: () => void sendFromGallery().catch(fail) },
    { key: 'camera', label: 'Camera', icon: ATTACH_ICONS.camera, tint: ATTACH_TINTS.camera, onPress: () => setCamera(true) },
    ...(draw ? [{ key: 'draw', label: 'Draw', icon: ATTACH_ICONS.draw, tint: ATTACH_TINTS.draw, onPress: () => setDoodle(true) }] : []),
    ...(env.giphyKey ? [{ key: 'gif', label: 'GIF', icon: ATTACH_ICONS.gif, tint: ATTACH_TINTS.gif, onPress: () => setGifs(true) }] : []),
    ...(stickersOn ? [{ key: 'sticker', label: 'New sticker', icon: ATTACH_ICONS.sticker, tint: ATTACH_TINTS.sticker, onPress: () => setStickerMaker(true) }] : []),
  ];

  return (
    // Android draws edge-to-edge, so the window no longer resizes for the keyboard:
    // lift the composer ourselves on both platforms. The offset takes back the
    // safe area under the composer, which the keyboard covers when it's up.
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.chat }} behavior="padding" keyboardVerticalOffset={-insets.bottom}>
      <View style={{ paddingTop: insets.top + 8 }} className="flex-row items-center gap-2 border-b border-paper-edge bg-paper-raised pb-2.5 pl-1 pr-2">
        <BackButton />
        <Pressable
          accessibilityRole="imagebutton"
          accessibilityLabel={`${partner.display_name}'s photo. Open`}
          disabled={!partnerPhoto}
          onPress={() => setPhoto(partnerPhoto)}
          className="active:opacity-70"
        >
          <Avatar name={partner.display_name} slot={partnerSlot} online={partnerOnline} />
        </Pressable>
        <View className="flex-1">
          <Display className="text-lead" numberOfLines={1}>
            {partner.display_name}
          </Display>
          <Text className={cn('text-micro', partnerTyping || partnerOnline ? 'font-sans-medium text-teal-700' : 'text-ink-muted')}>
            {partnerTyping ? 'typing…' : partnerOnline ? 'online' : 'away'}
          </Text>
        </View>
        <IconButton label={`Video call ${partner.display_name}`} size="sm" onPress={() => void calls.startCall('video')}>
          <Video size={22} color={c.ink} />
        </IconButton>
        <IconButton label={`Voice call ${partner.display_name}`} size="sm" onPress={() => void calls.startCall('audio')}>
          <Phone size={20} color={c.ink} />
        </IconButton>
        <IconButton label="Search messages" size="sm" onPress={() => setPanel('search')}>
          <Search size={20} color={c.ink} />
        </IconButton>
      </View>

      {latestPin ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Pinned: ${messagePreview(latestPin)}. Show all pinned`}
          onPress={() => setPanel('pins')}
          className="flex-row items-center gap-3 border-b border-paper-edge bg-gold-50 px-4 py-2"
        >
          <Pin size={15} color={c.onGold} />
          <View className="flex-1">
            <Text className="font-sans-medium text-micro text-gold-700">{`Pinned${pins.data!.length > 1 ? ` · ${pins.data!.length}` : ''}`}</Text>
            <Text numberOfLines={1} className="text-small">
              {messagePreview(latestPin)}
            </Text>
          </View>
        </Pressable>
      ) : null}

      <View className="flex-1">
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={c.rose} />
          </View>
        ) : (
          <FlatList
            ref={list}
            onScrollToIndexFailed={(info) => setTimeout(() => list.current?.scrollToIndex({ index: info.index, viewPosition: 0.5 }), 250)}
            inverted
            className="flex-1 px-4"
            data={rows}
            keyExtractor={keyOf}
            renderItem={renderItem}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            initialNumToRender={15}
            maxToRenderPerBatch={8}
            updateCellsBatchingPeriod={30}
            windowSize={11}
            // Detaching off-screen rows helps Android; on iOS it can blank rows mid-scroll.
            removeClippedSubviews={Platform.OS === 'android'}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              listBox.current = { offset: contentOffset.y, visible: layoutMeasurement.height, content: contentSize.height };
              checkNearOldest();
              const up = contentOffset.y > 600;
              if (up !== awayRef.current) {
                awayRef.current = up;
                setAway(up);
                if (!up) setNewBelow(0);
              }
            }}
            scrollEventThrottle={100}
            onLayout={(e) => {
              listBox.current.visible = e.nativeEvent.layout.height;
              checkNearOldest();
            }}
            onContentSizeChange={(_, height) => {
              listBox.current.content = height;
              checkNearOldest();
            }}
            ListHeaderComponent={typingHeader}
            ListFooterComponent={olderFooter}
            ListEmptyComponent={
              <View className="items-center py-24" style={{ transform: [{ scaleY: -1 }] }}>
                <Display light italic className="text-title">
                  Say the first thing.
                </Display>
                <Text className="mt-2 text-small text-ink-muted">Only you and {partner.display_name} can read this.</Text>
              </View>
            }
          />
        )}
        {away ? (
          <View className="absolute bottom-3 right-4">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={newBelow ? `Go to latest, ${newBelow} new` : 'Go to latest'}
              onPress={toLatest}
              className="h-11 w-11 items-center justify-center rounded-full border border-paper-edge bg-paper-raised shadow-md shadow-plum-800/30 active:bg-paper-sunken"
            >
              <ChevronsDown size={22} color={c.inkSoft} />
              {newBelow ? (
                <View className="absolute -top-2 min-w-[20px] items-center rounded-full bg-rose-600 px-1.5">
                  <Text className="font-sans-semibold text-[11px] leading-[18px] text-white">{newBelow > 99 ? '99+' : String(newBelow)}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={{ paddingBottom: insets.bottom + 8 }} className="px-2 pt-1">
        {notice ? <Text className="mb-2 px-2 text-small text-rose-700">{notice}</Text> : null}
        <Composer
          partnerName={partner.display_name}
          initialText={readCache<string>(draftKey)}
          onChange={(t) => {
            onComposerChange(t);
            writeCache(draftKey, t);
          }}
          replyTo={replyTo ? { id: replyTo.id, author: authorOf(replyTo), text: messagePreview(replyTo) } : null}
          onCancelReply={() => setReplyTo(null)}
          onSend={(t) => {
            onComposerSent();
            writeCache(draftKey, '');
            sendWithReply(t);
          }}
          onVoice={(uri, ms) => void sendVoice(uri, ms).catch(fail)}
          onSticker={stickersOn ? () => setStickerPicker(true) : env.giphyKey ? () => setGifs(true) : undefined}
          onAttach={() => setAttach(true)}
          onCamera={() => setCamera(true)}
        />
        {draw ? (
          <DoodleSheet
            open={doodle}
            onClose={() => setDoodle(false)}
            mode="chat"
            onChatPicture={({ bytes, dataUrl }) =>
              sendWithReply('', { media: { kind: 'image', meta: { width: 1200, height: 1600 }, localUri: dataUrl, upload: { body: bytes, contentType: 'image/png' } } })
            }
          />
        ) : null}
      </View>

      <AttachSheet open={attach} onClose={() => setAttach(false)} options={attachOptions} />
      <CameraSheet open={camera} onClose={() => setCamera(false)} onSend={(p, caption) => void sendImage(p, caption).catch(fail)} />
      <MessageActions
        message={acting}
        myId={me.id}
        onClose={() => setActing(null)}
        onReact={(m, emoji) => void react(m.id, emoji).catch(fail)}
        onReply={(m) => setReplyTo(m)}
        onPin={(m, p) => void pin(m.id, p).catch(fail)}
        onKeepSticker={
          stickersOn
            ? (m) =>
                void keepSticker(sb, couple.id, me.id, m.media_path!, { width: m.media_meta?.width, height: m.media_meta?.height })
                  .then(() => {
                    channel.sendChanged(STICKERS_TOPIC);
                    say('Saved to Our stickers');
                  })
                  .catch(fail)
            : undefined
        }
      />
      {stickersOn ? (
        <>
          <StickerPicker
            open={stickerPicker}
            onClose={() => setStickerPicker(false)}
            onMake={() => {
              setStickerPicker(false);
              setStickerMaker(true);
            }}
            onSend={(st, url) => {
              setStickerPicker(false);
              sendSticker(st, url);
            }}
          />
          <StickerMaker open={stickerMaker} onClose={() => setStickerMaker(false)} onSaved={(st, send) => send && sendSticker(st)} />
        </>
      ) : null}
      <FormSheet open={panel !== null} title={panel === 'pins' ? 'Pinned' : 'Search messages'} onClose={() => setPanel(null)}>
        {panel === 'search' ? <SearchPanel onPick={pick} authorOf={authorOf} /> : null}
        {panel === 'pins' ? <MessageList items={pins.data ?? []} empty="Nothing pinned." onPick={pick} authorOf={authorOf} /> : null}
      </FormSheet>
      <PhotoViewer uri={photo} label="Photo" onClose={() => setPhoto(null)} />
      <GifPicker
        open={gifs}
        onClose={() => setGifs(false)}
        onPick={(kind, gif) => {
          setGifs(false);
          sendWithReply('', { media: { kind, meta: { url: gif.url, width: gif.width, height: gif.height } } });
        }}
      />
    </KeyboardAvoidingView>
  );
}

const keyOf = (r: Row) => r.key;

const DaySeparator = memo(function DaySeparator({ label }: { label: string }) {
  return (
    <View className="my-3 items-center" accessibilityRole="header">
      <Text className="overflow-hidden rounded-lg bg-paper-raised px-3 py-1 font-sans-medium text-micro text-ink-soft">{label}</Text>
    </View>
  );
});

/** A message you can swipe right to reply to. */
const MessageRow = memo(function MessageRow({
  onReply,
  ...props
}: Omit<Parameters<typeof Bubble>[0], 'slot'> & { slot: PartnerSlot; onReply: (m: Message) => void }) {
  const { message } = props;
  const reply = useCallback(() => onReply(message), [onReply, message]);
  return (
    <SwipeableRow enabled={!message.pending && !message.failed} onReply={reply}>
      <Bubble {...props} />
    </SwipeableRow>
  );
});

/** Long-press sheet: quick reactions, reply, pin, copy. */
function MessageActions({
  message,
  myId,
  onClose,
  onReact,
  onReply,
  onPin,
  onKeepSticker,
}: {
  message: Message | null;
  myId: string;
  onClose: () => void;
  onReact: (m: Message, emoji: string | null) => void;
  onReply: (m: Message) => void;
  onPin: (m: Message, pinned: boolean) => void;
  /** Keep a sticker we made (one sent in chat) in Our stickers. */
  onKeepSticker?: (m: Message) => void;
}) {
  const c = usePalette();
  const mine = message?.reactions?.[myId] ?? null;
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [message]);
  const act = (fn: (m: Message) => void) => () => {
    if (message) fn(message);
    onClose();
  };
  return (
    <Modal visible={!!message} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} className="flex-1 justify-end bg-plum-900/40">
        <Pressable className="gap-4 rounded-t-[28px] bg-paper-raised px-5 pb-10 pt-5">
          {message ? (
            <Text numberOfLines={2} className="text-small text-ink-soft">
              {messagePreview(message)}
            </Text>
          ) : null}
          <View className="flex-row items-center justify-between rounded-full bg-paper-sunken p-1">
            {QUICK_REACTIONS.map((e) => (
              <ReactionButton key={e} emoji={e} selected={mine === e} onPress={act((m) => onReact(m, mine === e ? null : e))} />
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={more ? 'Fewer reactions' : 'More reactions'}
              accessibilityState={{ expanded: more }}
              onPress={() => setMore((v) => !v)}
              className={cn('h-11 w-11 items-center justify-center rounded-full', more ? 'bg-paper-raised' : 'active:bg-paper-raised')}
            >
              <Plus size={22} color={c.inkSoft} />
            </Pressable>
          </View>
          {more ? (
            <View className="flex-row flex-wrap justify-between gap-y-1">
              {MORE_REACTIONS.map((e) => (
                <ReactionButton key={e} emoji={e} selected={mine === e} onPress={act((m) => onReact(m, mine === e ? null : e))} />
              ))}
            </View>
          ) : null}
          <ActionRow label="Reply" onPress={act(onReply)} icon={<Reply size={20} color={c.ink} />} />
          <ActionRow
            label={message?.pinned_at ? 'Unpin' : 'Pin for both of you'}
            onPress={act((m) => onPin(m, !m.pinned_at))}
            icon={message?.pinned_at ? <PinOff size={20} color={c.ink} /> : <Pin size={20} color={c.ink} />}
          />
          {onKeepSticker && message?.media_kind === 'sticker' && isOurStickerPath(message.media_path) ? (
            <ActionRow label="Save sticker" onPress={act(onKeepSticker)} icon={<Sticker size={20} color={c.ink} />} />
          ) : null}
          {message?.body?.trim() ? (
            <ActionRow label="Copy text" onPress={act((m) => void Clipboard.setStringAsync(m.body ?? ''))} icon={<Copy size={20} color={c.ink} />} />
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ReactionButton({ emoji, selected, onPress }: { emoji: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={selected ? `Remove ${emoji}` : `React ${emoji}`}
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn('h-11 w-11 items-center justify-center rounded-full', selected ? 'bg-rose-100' : 'active:bg-paper-raised')}
    >
      <Text className="text-[24px] leading-[30px]">{emoji}</Text>
    </Pressable>
  );
}

function ActionRow({ label, onPress, icon }: { label: string; onPress: () => void; icon: ReactNode }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="flex-row items-center gap-4 rounded-control px-2 py-3 active:bg-paper-sunken">
      {icon}
      <Text>{label}</Text>
    </Pressable>
  );
}

function MessageList({ items, empty, onPick, authorOf }: { items: Message[]; empty: string; onPick: (m: Message) => void; authorOf: (m: Message) => string }) {
  if (!items.length) return <Text className="py-6 text-center text-small text-ink-muted">{empty}</Text>;
  return (
    <View className="gap-1">
      {items.map((m) => (
        <Pressable key={m.id} accessibilityRole="button" onPress={() => onPick(m)} className="rounded-control px-2 py-2.5 active:bg-paper-sunken">
          <Text className="text-micro text-ink-muted">{`${authorOf(m)} · ${formatDay(m.created_at)}`}</Text>
          <Text numberOfLines={2} className="text-small">
            {messagePreview(m)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function SearchPanel({ onPick, authorOf }: { onPick: (m: Message) => void; authorOf: (m: Message) => string }) {
  const { sb, couple } = useCouple();
  const c = usePalette();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Message[] | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) return setResults(null);
    let cancelled = false;
    const t = setTimeout(() => {
      void searchMessages(sb, couple.id, q)
        .then((r) => !cancelled && setResults(r))
        .catch(() => !cancelled && setResults([]));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, sb, couple.id]);
  return (
    <>
      <TextInput
        autoFocus
        value={q}
        onChangeText={setQ}
        placeholder="Words you remember…"
        placeholderTextColor={c.placeholder}
        accessibilityLabel="Search messages"
        returnKeyType="search"
        className="h-11 rounded-control border border-paper-edge bg-paper px-4 font-sans text-body text-ink"
      />
      {results ? <MessageList items={results} empty="Nothing found." onPick={onPick} authorOf={authorOf} /> : null}
    </>
  );
}
