import { describeCall, formatClock, formatVoiceLength, groupReactions, messagePreview, type Message, type PartnerSlot } from '@us/shared';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pause, Phone, PhoneMissed, Pin, Play, Reply, Video } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Image, Pressable, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { cn } from '../ui/cn';
import { Text } from '../ui/text';
import { Ticks } from '../ui/ticks';
import { usePalette } from '../ui/palette';

const MINE = { a: 'bg-rose-600', b: 'bg-teal-600' };
// Their messages: a clean raised card, tinted only at the edge with their colour.
const THEIRS = { a: 'bg-paper-raised border border-rose-200', b: 'bg-paper-raised border border-teal-200' };

export interface ReplyQuote {
  id: string;
  author: string;
  text: string;
}

export function Bubble({
  message,
  mine,
  slot,
  authorName,
  myId,
  first,
  last,
  mediaUrl,
  quote,
  highlighted,
  onRetry,
  onLongPress,
  onReact,
  onReply,
  onOpenPhoto,
  onJumpTo,
}: {
  message: Message;
  mine: boolean;
  slot: PartnerSlot;
  authorName: string;
  myId: string;
  first: boolean;
  last: boolean;
  mediaUrl?: string;
  quote?: ReplyQuote | null;
  highlighted?: boolean;
  onRetry?: () => void;
  /** Opens reactions / reply / pin. */
  onLongPress?: () => void;
  onReact?: (emoji: string | null) => void;
  /** Swipe right, as in most messengers. */
  onReply?: () => void;
  onOpenPhoto?: (url: string) => void;
  onJumpTo?: (id: string) => void;
}) {
  const reactions = groupReactions(message.reactions, myId);
  const url = mediaUrl ?? message.localUri;
  const hasText = !!message.body?.trim();
  const photo = message.media_kind === 'image';
  const meta = message.media_meta;
  const describe = hasText ? message.body : messagePreview(message);
  const settled = !message.pending && !message.failed;
  const swipe = useRef<SwipeableMethods>(null);
  const lastTap = useRef(0);
  // Double-tap toggles a heart.
  const onPress = () => {
    const now = Date.now();
    if (settled && now - lastTap.current < 300) {
      lastTap.current = 0;
      onReact?.(message.reactions?.[myId] === '❤️' ? null : '❤️');
    } else lastTap.current = now;
  };
  return (
    <Swipeable
      ref={swipe}
      enabled={settled && !!onReply}
      friction={2}
      leftThreshold={56}
      overshootLeft={false}
      renderLeftActions={() => (
        <View className="w-14 items-center justify-center">
          <View className="h-8 w-8 items-center justify-center rounded-full bg-paper-sunken">
            <Reply size={16} color="#8a7f94" />
          </View>
        </View>
      )}
      onSwipeableWillOpen={() => {
        onReply?.();
        swipe.current?.close();
      }}
    >
      <View className={cn(mine ? 'items-end' : 'items-start', first ? 'mt-3' : 'mt-0.5', reactions.length ? 'mb-3' : '')}>
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={300}
          accessibilityHint="Double tap for a heart. Long press to react, reply or pin"
          accessibilityActions={[{ name: 'longpress', label: 'React, reply or pin' }]}
          onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && onLongPress?.()}
          className="max-w-[80%]"
        >
          <View
            accessible
            accessibilityLabel={`${mine ? 'You' : authorName}: ${describe}. ${formatClock(message.created_at)}${
              mine ? `, ${message.failed ? 'not sent' : message.pending ? 'sending' : message.status}` : ''
            }${message.pinned_at ? ', pinned' : ''}`}
            className={cn(
              'rounded-bubble',
              photo && url ? 'overflow-hidden p-1' : 'px-3.5 pb-1.5 pt-2',
              mine ? MINE[slot] : THEIRS[slot],
              last && (mine ? 'rounded-br-hair' : 'rounded-bl-hair'),
              message.pending && 'opacity-80',
              highlighted && 'border-2 border-gold-400',
            )}
          >
            {quote ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Reply to ${quote.author}: ${quote.text}. Show it`}
                onPress={() => onJumpTo?.(quote.id)}
                className={cn('mb-1.5 rounded-[10px] border-l-[3px] px-2.5 py-1.5', mine ? 'border-white/70 bg-white/15' : 'border-plum-300 bg-paper-sunken', photo && url && 'm-1')}
              >
                <Text className={cn('font-sans-medium text-micro', mine ? 'text-white' : 'text-ink')}>{quote.author}</Text>
                <Text numberOfLines={2} className={cn('text-small', mine ? 'text-white/85' : 'text-ink-soft')}>
                  {quote.text}
                </Text>
              </Pressable>
            ) : null}

            {photo ? (
              url ? (
                <Pressable accessibilityRole="imagebutton" accessibilityLabel="Open photo" onPress={() => onOpenPhoto?.(url)} onLongPress={onLongPress}>
                  <Image
                    source={{ uri: url }}
                    style={{ width: 240, aspectRatio: meta?.width && meta?.height ? Math.max(meta.width / meta.height, 0.6) : 4 / 3 }}
                    className="rounded-[14px] bg-black/10"
                    resizeMode="cover"
                  />
                </Pressable>
              ) : (
                <View style={{ width: 240, height: 180 }} className="rounded-[14px] bg-black/10" />
              )
            ) : null}

            {message.media_kind === 'audio' ? <VoiceNote url={url} durationMs={meta?.duration_ms} mine={mine} /> : null}

            {hasText ? <Text className={cn(mine ? 'text-white' : 'text-ink', photo && url && 'px-2.5 pt-1.5')}>{message.body}</Text> : null}
            <View className={cn('mt-0.5 flex-row items-center justify-end gap-1 self-end', photo && url && 'px-2 pb-1')}>
              {message.pinned_at ? <Pin size={11} color={mine ? 'rgba(255,255,255,0.75)' : '#8a7f94'} /> : null}
              <Text className={cn('text-[11px] leading-[14px]', mine ? 'text-white/75' : 'text-ink-muted')}>{formatClock(message.created_at)}</Text>
              {mine && <Ticks status={message.status} pending={message.pending} failed={message.failed} />}
            </View>
          </View>
          {reactions.length ? (
            <View className="absolute -bottom-3.5 left-3 flex-row gap-1">
              {reactions.map((r) => (
                <Pressable
                  key={r.emoji}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.emoji} ${r.count}${r.mine ? ', yours. Remove' : ''}`}
                  onPress={() => onReact?.(r.mine ? null : r.emoji)}
                  className={cn('h-6 flex-row items-center gap-0.5 rounded-full border bg-paper-raised px-1.5', r.mine ? 'border-rose-300' : 'border-paper-edge')}
                >
                  <Text className="text-[13px] leading-[16px]">{r.emoji}</Text>
                  {r.count > 1 ? <Text className="text-micro text-ink-muted">{String(r.count)}</Text> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </Pressable>
        {message.failed && onRetry && (
          <Pressable accessibilityRole="button" onPress={onRetry} className="mt-1 py-1">
            <Text className="font-sans-medium text-micro text-rose-700">Not sent — tap to retry</Text>
          </Pressable>
        )}
      </View>
    </Swipeable>
  );
}

/** Play / pause, progress and length for a voice note. */
function VoiceNote({ url, durationMs, mine }: { url?: string; durationMs?: number; mine: boolean }) {
  const player = useAudioPlayer(url ? { uri: url } : null);
  const status = useAudioPlayerStatus(player);
  const total = status.duration ? status.duration * 1000 : (durationMs ?? 0);
  const progress = total ? Math.min(1, (status.currentTime * 1000) / total) : 0;
  const fg = mine ? '#fff' : '#3d2f4a';
  useEffect(() => {
    if (status.didJustFinish) void player.seekTo(0);
  }, [status.didJustFinish, player]);
  return (
    <View className="w-[220px] flex-row items-center gap-3 py-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause voice note' : `Play voice note, ${formatVoiceLength(durationMs)}`}
        disabled={!url}
        onPress={() => {
          if (status.playing) player.pause();
          else {
            void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
            player.play();
          }
        }}
        className={cn('h-9 w-9 items-center justify-center rounded-full', mine ? 'bg-white/20' : 'bg-paper-sunken', !url && 'opacity-50')}
      >
        {status.playing ? <Pause size={16} color={fg} fill={fg} /> : <Play size={16} color={fg} fill={fg} />}
      </Pressable>
      <View className="flex-1 gap-1">
        <View className={cn('h-1 overflow-hidden rounded-full', mine ? 'bg-white/30' : 'bg-plum-100')}>
          <View style={{ width: `${progress * 100}%` }} className={cn('h-1 rounded-full', mine ? 'bg-white' : 'bg-rose-500')} />
        </View>
        <Text className={cn('text-micro', mine ? 'text-white/80' : 'text-ink-muted')}>
          {formatVoiceLength(status.playing || status.currentTime ? status.currentTime * 1000 : durationMs)}
        </Text>
      </View>
    </View>
  );
}

export function CallEntry({ message, myId, onCallBack }: { message: Message; myId: string; onCallBack: (m: 'audio' | 'video') => void }) {
  const call = message.call;
  if (!call) return null;
  const { label, missed, detail } = describeCall(call, myId);
  const c = usePalette();
  const color = missed ? c.onRoseDeep : c.inkSoft;
  const Icon = missed ? PhoneMissed : call.media === 'video' ? Video : Phone;
  const text = `${label}${detail ? ` · ${detail}` : ''} · ${formatClock(call.created_at)}`;
  const inner = (
    <>
      <Icon size={15} color={color} />
      <Text className={cn('text-small', missed ? 'text-rose-800' : 'text-ink-soft')}>{text}</Text>
      {missed && <Text className="font-sans-semibold text-small text-rose-800 underline">Call back</Text>}
    </>
  );
  return (
    <View className="my-4 items-center">
      {missed ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${text}. Call back`}
          onPress={() => onCallBack(call.media)}
          className="flex-row items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 active:bg-rose-100"
        >
          {inner}
        </Pressable>
      ) : (
        <View className="flex-row items-center gap-1.5 rounded-full bg-paper-sunken px-4 py-2">{inner}</View>
      )}
    </View>
  );
}
