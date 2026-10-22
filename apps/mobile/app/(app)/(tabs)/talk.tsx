import { clusters, formatDay, groupByDay, listPinned, messagePreview, MORE_REACTIONS, QUICK_REACTIONS, searchMessages, snapReplyQuote, type Message } from '@us/shared';
import { useCallManager, useChatMedia, useCouple, useCoupleData, useFeature, useMessages, useSnaps, useTyping } from '@us/shared/react';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { ChevronsDown, Copy, Phone, Pin, PinOff, Plus, Reply, Search, Settings, Video } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, FlatList, Modal, Pressable, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bubble, CallEntry, type ReplyQuote } from '@/components/chat/bubble';
import { Composer } from '@/components/chat/composer';
import { FeatureOff } from '@/components/feature-off';
import { GifPicker } from '@/components/chat/gif-picker';
import { clearMessageNotifications } from '@/modules/us-call';
import { env } from '@/lib/env';
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
  | { kind: 'msg'; key: string; message: Message; first: boolean; last: boolean };

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

export default function Talk() {
  const chat = useFeature('chat');
  const insets = useSafeAreaInsets();
  if (!chat) {
    return (
      <View className="flex-1 justify-center px-5" style={{ paddingTop: insets.top }}>
        <FeatureOff />
      </View>
    );
  }
  return <Thread />;
}

function Thread() {
  const insets = useSafeAreaInsets();
  const { sb, couple, me, partner, mySlot, partnerSlot, partnerOnline, photoOf } = useCouple();
  const partnerPhoto = photoOf(partnerSlot);
  const viewing = useViewing();
  // Reading the chat: the gathered "new messages" notification is done with.
  useEffect(() => {
    if (viewing) clearMessageNotifications();
  }, [viewing]);
  const { messages, loading, hasOlder, loadOlder, send, retry, react, pin } = useMessages({ viewing });
  const media = useChatMedia(messages);
  const [acting, setActing] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [panel, setPanel] = useState<'search' | 'pins' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [gifs, setGifs] = useState(false);
  const list = useRef<FlatList<Row>>(null);

  const pins = useCoupleData('chat:pins', () => listPinned(sb, couple.id), [sb, couple.id]);
  const pinSignature = messages.map((m) => (m.pinned_at ? m.id : '')).join('');
  useEffect(() => {
    void pins.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinSignature]);

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const authorOf = (m: Pick<Message, 'sender_id'>) => (m.sender_id === me.id ? 'You' : partner.display_name);
  const snaps = useSnaps();
  const quoteFor = (m: Message): ReplyQuote | null => {
    const snap = snapReplyQuote(m, me.id, partner.display_name, [...(snaps.data?.mine ?? []), ...(snaps.data?.partner ?? [])]);
    if (snap) return { id: `snap-${m.snap_id}`, ...snap };
    if (!m.reply_to) return null;
    const r = byId.get(m.reply_to);
    return r ? { id: r.id, author: authorOf(r), text: messagePreview(r) } : { id: m.reply_to, author: 'Earlier message', text: 'Scroll up to see it' };
  };
  const say = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 4000);
  };
  const fail = (e: unknown) => say((e as Error).message ?? 'That didn’t work. Try again.');

  function sendWithReply(text: string, extras: Parameters<typeof send>[1] = {}) {
    send(text, { ...extras, replyTo: replyTo?.id ?? null });
    setReplyTo(null);
  }

  async function sendPhoto(caption: string) {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    const bytes = await (await fetch(asset.uri)).arrayBuffer();
    sendWithReply(caption, {
      media: {
        kind: 'image',
        meta: asset.width && asset.height ? { width: asset.width, height: asset.height } : null,
        localUri: asset.uri,
        upload: { body: bytes, contentType: asset.mimeType ?? 'image/jpeg' },
      },
    });
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

  // Inverted list → newest first.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const g of groupByDay(messages)) {
      out.push({ kind: 'day', key: `day-${g.key}`, label: g.day });
      g.items.forEach((m, i) =>
        out.push({ kind: 'msg', key: m.id, message: m, first: !clusters(g.items[i - 1], m), last: !clusters(m, g.items[i + 1]) }),
      );
    }
    return out.reverse();
  }, [messages]);

  // Scrolled up: a button to jump back to the latest, counting what arrived meanwhile.
  const [away, setAway] = useState(false);
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

  return (
    // Android draws edge-to-edge, so the window no longer resizes for the keyboard:
    // lift the composer ourselves on both platforms.
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.chat }} behavior="padding">
      <View style={{ paddingTop: insets.top + 8 }} className="flex-row items-center gap-2 border-b border-paper-edge bg-paper-raised pb-2.5 pl-4 pr-2">
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
        <IconButton label="Settings" size="sm" onPress={() => router.push('/settings')}>
          <Settings size={20} color={c.ink} />
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
            keyExtractor={(r) => r.key}
            keyboardDismissMode="interactive"
            initialNumToRender={20}
            maxToRenderPerBatch={10}
            windowSize={9}
            removeClippedSubviews
            onScroll={(e) => {
              const up = e.nativeEvent.contentOffset.y > 600;
              if (up !== away) {
                setAway(up);
                if (!up) setNewBelow(0);
              }
            }}
            scrollEventThrottle={100}
            onEndReached={() => hasOlder && void loadOlder()}
            onEndReachedThreshold={0.3}
            ListHeaderComponent={<TypingBubble visible={partnerTyping} name={partner.display_name} slot={partnerSlot} />}
            ListEmptyComponent={
              <View className="items-center py-24" style={{ transform: [{ scaleY: -1 }] }}>
                <Display light italic className="text-title">
                  Say the first thing.
                </Display>
                <Text className="mt-2 text-small text-ink-muted">Only you and {partner.display_name} can read this.</Text>
              </View>
            }
            renderItem={({ item }) =>
              item.kind === 'day' ? (
                <View className="my-3 items-center" accessibilityRole="header">
                  <Text className="overflow-hidden rounded-lg bg-paper-raised px-3 py-1 font-sans-medium text-micro text-ink-soft">{item.label}</Text>
                </View>
              ) : item.message.kind === 'call' ? (
                <CallEntry message={item.message} myId={me.id} onCallBack={(m) => void calls.startCall(m)} />
              ) : (
                <Bubble
                  message={item.message}
                  mine={item.message.sender_id === me.id}
                  slot={item.message.sender_id === me.id ? mySlot : partnerSlot}
                  authorName={partner.display_name}
                  myId={me.id}
                  first={item.first}
                  last={item.last}
                  mediaUrl={item.message.media_path ? media[item.message.media_path] : undefined}
                  quote={quoteFor(item.message)}
                  highlighted={highlight === item.message.id}
                  onRetry={() => retry(item.message.id)}
                  onLongPress={() => {
                    if (item.message.pending || item.message.failed) return;
                    void Haptics.selectionAsync().catch(() => {});
                    setActing(item.message);
                  }}
                  onReact={(emoji) => void react(item.message.id, emoji).catch(fail)}
                  onOpenPhoto={setPhoto}
                  animate={viewing}
                  onJumpTo={(id) => !id.startsWith('snap-') && !jumpTo(id) && say('That message is further up. Scroll up to load it.')}
                />
              )
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

      <View style={{ paddingBottom: 8 }} className="px-3 pt-1">
        {notice ? <Text className="mb-2 px-2 text-small text-rose-700">{notice}</Text> : null}
        <Composer
          partnerName={partner.display_name}
          onChange={onComposerChange}
          replyTo={replyTo ? { id: replyTo.id, author: authorOf(replyTo), text: messagePreview(replyTo) } : null}
          onCancelReply={() => setReplyTo(null)}
          onSend={(t) => {
            onComposerSent();
            sendWithReply(t);
          }}
          onPhoto={(caption) => void sendPhoto(caption).catch(fail)}
          onVoice={(uri, ms) => void sendVoice(uri, ms).catch(fail)}
          onGif={env.giphyKey ? () => setGifs(true) : undefined}
        />
      </View>

      <MessageActions
        message={acting}
        myId={me.id}
        onClose={() => setActing(null)}
        onReact={(m, emoji) => void react(m.id, emoji).catch(fail)}
        onReply={(m) => setReplyTo(m)}
        onPin={(m, p) => void pin(m.id, p).catch(fail)}
      />
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

/** Long-press sheet: quick reactions, reply, pin, copy. */
function MessageActions({
  message,
  myId,
  onClose,
  onReact,
  onReply,
  onPin,
}: {
  message: Message | null;
  myId: string;
  onClose: () => void;
  onReact: (m: Message, emoji: string | null) => void;
  onReply: (m: Message) => void;
  onPin: (m: Message, pinned: boolean) => void;
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
