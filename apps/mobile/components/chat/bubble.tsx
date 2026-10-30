import { describeCall, formatClock, formatVoiceLength, groupReactions, isGiphyUrl, isLinkedMedia, messagePreview, type CallMedia, type Message, type PartnerSlot } from '@us/shared';
import { Image as AnimatedImage } from 'expo-image';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Headphones, Pause, Phone, PhoneMissed, Pin, Play, Tv, Video } from 'lucide-react-native';
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { cn } from '../ui/cn';
import { Text } from '../ui/text';
import { Ticks } from '../ui/ticks';
import { usePalette } from '../ui/palette';

// Mine: a light wash of my colour with dark text, so every word reads clearly.
const MINE = { a: 'bg-rose-100', b: 'bg-teal-100' };
const THEIRS = { a: 'bg-paper-raised', b: 'bg-paper-raised' };

export interface ReplyQuote {
  id: string;
  author: string;
  text: string;
}

/**
 * One message. Memoised: callbacks take the message, so the thread can pass
 * the same functions to every row and only rows whose message changed redraw.
 */
export const Bubble = memo(function Bubble({
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
  onOpenPhoto,
  onJumpTo,
  animate = true,
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
  onRetry?: (id: string) => void;
  /** Opens reactions / reply / pin. */
  onLongPress?: (m: Message) => void;
  onReact?: (m: Message, emoji: string | null) => void;
  onOpenPhoto?: (url: string) => void;
  onJumpTo?: (id: string) => void;
  /** GIFs and stickers play; off while the chat isn't on screen. */
  animate?: boolean;
}) {
  const c = usePalette();
  const reactions = groupReactions(message.reactions, myId);
  const url = mediaUrl ?? message.localUri;
  const hasText = !!message.body?.trim();
  const photo = message.media_kind === 'image';
  // GIFs and stickers: GIPHY links (animated), or a sticker we made (a file in
  // our chat folder). Stickers float without a bubble.
  const giphy = isLinkedMedia(message.media_kind) && isGiphyUrl(message.media_meta?.url) ? message.media_meta!.url! : null;
  const ours = message.media_kind === 'sticker' && !!message.media_path ? (url ?? null) : null;
  const linked = giphy ?? ours;
  const sticker = message.media_kind === 'sticker' && !!(giphy || message.media_path);
  const meta = message.media_meta;
  const describe = hasText ? message.body : messagePreview(message);
  const settled = !message.pending && !message.failed;
  const lastTap = useRef(0);
  // Double-tap toggles a heart.
  const onPress = () => {
    const now = Date.now();
    if (settled && now - lastTap.current < 300) {
      lastTap.current = 0;
      onReact?.(message, message.reactions?.[myId] === '❤️' ? null : '❤️');
    } else lastTap.current = now;
  };
  const longPress = onLongPress ? () => onLongPress(message) : undefined;
  // Our own files are kept on disk by their storage path, so a re-signed link doesn't download them again.
  const source = (u: string) => (message.media_path && mediaUrl ? { uri: u, cacheKey: message.media_path } : { uri: u });
  return (
    <View className={cn(mine ? 'items-end' : 'items-start', first ? 'mt-3' : 'mt-0.5', reactions.length ? 'mb-3' : '')}>
      <Pressable
        onPress={onPress}
        onLongPress={longPress}
        delayLongPress={300}
        accessibilityHint="Double tap for a heart. Swipe right to reply. Long press to react, reply or pin"
        accessibilityActions={[{ name: 'longpress', label: 'React, reply or pin' }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'longpress' && longPress?.()}
        className="max-w-[80%]"
      >
        <View
          accessible
          accessibilityLabel={`${mine ? 'You' : authorName}: ${describe}. ${formatClock(message.created_at)}${
            mine ? `, ${message.failed ? 'not sent' : message.pending ? 'sending' : message.status}` : ''
          }${message.pinned_at ? ', pinned' : ''}`}
          className={cn(
            'rounded-bubble',
            photo && url ? 'overflow-hidden p-1' : linked ? 'overflow-hidden p-1' : 'px-3 pb-1.5 pt-2',
            sticker ? 'bg-transparent' : mine ? MINE[slot] : THEIRS[slot],
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
              onLongPress={longPress}
              delayLongPress={300}
              className={cn('mb-1.5 rounded-[10px] border-l-[3px] px-2.5 py-1.5', mine ? 'border-rose-600 bg-paper-raised/60' : 'border-plum-300 bg-paper-sunken', photo && url && 'm-1')}
            >
              <Text className="font-sans-semibold text-micro text-ink">{quote.author}</Text>
              <Text numberOfLines={2} className="text-small text-ink-soft">
                {quote.text}
              </Text>
            </Pressable>
          ) : null}

          {photo ? (
            url ? (
              <Pressable accessibilityRole="imagebutton" accessibilityLabel="Open photo" onPress={() => onOpenPhoto?.(url)} onLongPress={longPress}>
                <AnimatedImage
                  source={source(url)}
                  recyclingKey={message.id}
                  cachePolicy="memory-disk"
                  transition={120}
                  style={{ width: 240, aspectRatio: photoAspect(meta), borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.08)' }}
                  contentFit="cover"
                />
              </Pressable>
            ) : (
              <View style={{ width: 240, aspectRatio: photoAspect(meta) }} className="rounded-[14px] bg-black/10" />
            )
          ) : null}

          {linked ? (
            <AnimatedImage
              source={giphy ? linked : source(linked)}
              accessibilityLabel={message.media_kind === 'sticker' ? 'Sticker' : 'GIF'}
              style={{
                width: sticker ? 150 : 220,
                aspectRatio: meta?.width && meta?.height ? Math.max(meta.width / meta.height, 0.6) : 1,
                borderRadius: sticker ? 0 : 14,
              }}
              contentFit="contain"
              cachePolicy="memory-disk"
              recyclingKey={message.id}
              autoplay={animate}
            />
          ) : null}

          {message.media_kind === 'audio' ? <VoiceNote url={url} durationMs={meta?.duration_ms} mine={mine} /> : null}

          {hasText ? <Text className={cn('text-ink', photo && url && 'px-2.5 pt-1.5')}>{message.body}</Text> : null}
          <View className={cn('mt-0.5 flex-row items-center justify-end gap-1 self-end', photo && url && 'px-2 pb-1')}>
            {message.pinned_at ? <Pin size={11} color={c.inkMuted} /> : null}
            <Text className="text-[12px] leading-[15px] text-ink-muted">{formatClock(message.created_at)}</Text>
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
                onPress={() => onReact?.(message, r.mine ? null : r.emoji)}
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
        <Pressable accessibilityRole="button" onPress={() => onRetry(message.id)} className="mt-1 py-1">
          <Text className="font-sans-medium text-micro text-rose-700">Not sent — tap to retry</Text>
        </Pressable>
      )}
    </View>
  );
});

const photoAspect = (meta: Message['media_meta']) => (meta?.width && meta?.height ? Math.max(meta.width / meta.height, 0.6) : 4 / 3);

/**
 * A voice note. Nothing native is made until it's first played, so a thread
 * full of voice notes scrolls as lightly as text.
 */
function VoiceNote({ url, durationMs, mine }: { url?: string; durationMs?: number; mine: boolean }) {
  const [on, setOn] = useState(false);
  if (on && url) return <VoicePlayer url={url} durationMs={durationMs} mine={mine} />;
  return (
    <VoiceRow mine={mine} playing={false} progress={0} disabled={!url} durationMs={durationMs} label={formatVoiceLength(durationMs)} onPress={() => setOn(true)} />
  );
}

/** Play / pause, progress and length, once the note has been played. */
function VoicePlayer({ url, durationMs, mine }: { url: string; durationMs?: number; mine: boolean }) {
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);
  const total = status.duration ? status.duration * 1000 : (durationMs ?? 0);
  const progress = total ? Math.min(1, (status.currentTime * 1000) / total) : 0;
  const play = () => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    player.play();
  };
  // Made by the first tap: start playing straight away.
  useEffect(play, [player]);
  useEffect(() => {
    if (status.didJustFinish) void player.seekTo(0);
  }, [status.didJustFinish, player]);
  return (
    <VoiceRow
      mine={mine}
      playing={status.playing}
      progress={progress}
      durationMs={durationMs}
      label={formatVoiceLength(status.playing || status.currentTime ? status.currentTime * 1000 : durationMs)}
      onPress={() => (status.playing ? player.pause() : play())}
    />
  );
}

function VoiceRow({
  mine,
  playing,
  progress,
  label,
  durationMs,
  disabled,
  onPress,
}: {
  mine: boolean;
  playing: boolean;
  progress: number;
  label: string;
  durationMs?: number;
  disabled?: boolean;
  onPress: () => void;
}) {
  const c = usePalette();
  const fg = mine ? '#fff' : c.ink;
  return (
    <View className="w-[220px] flex-row items-center gap-3 py-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice note' : `Play voice note, ${formatVoiceLength(durationMs)}`}
        disabled={disabled}
        onPress={onPress}
        className={cn('h-9 w-9 items-center justify-center rounded-full', mine ? 'bg-rose-600' : 'bg-paper-sunken', disabled && 'opacity-50')}
      >
        {playing ? <Pause size={16} color={fg} fill={fg} /> : <Play size={16} color={fg} fill={fg} />}
      </Pressable>
      <View className="flex-1 gap-1">
        <View className="h-1 overflow-hidden rounded-full bg-plum-100">
          <View style={{ width: `${progress * 100}%` }} className="h-1 rounded-full bg-rose-500" />
        </View>
        <Text className="text-micro text-ink-muted">{label}</Text>
      </View>
    </View>
  );
}

export const CallEntry = memo(function CallEntry({ message, myId, onCallBack }: { message: Message; myId: string; onCallBack: (m: CallMedia) => void }) {
  const call = message.call;
  const c = usePalette();
  if (!call) return null;
  const { label, missed, detail } = describeCall(call, myId);
  const color = missed ? c.onRoseDeep : c.inkSoft;
  const Icon = missed ? PhoneMissed : { audio: Phone, video: Video, listen: Headphones, watch: Tv }[call.media];
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
});
