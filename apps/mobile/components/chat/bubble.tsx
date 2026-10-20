import { describeCall, formatClock, type Message, type PartnerSlot } from '@us/shared';
import { Phone, PhoneMissed, Video } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { cn } from '../ui/cn';
import { Text } from '../ui/text';
import { Ticks } from '../ui/ticks';
import { usePalette } from '../ui/palette';

const MINE = { a: 'bg-rose-600', b: 'bg-teal-600' };
const THEIRS = { a: 'bg-rose-50 border border-rose-200', b: 'bg-teal-50 border border-teal-200' };

export function Bubble({
  message,
  mine,
  slot,
  authorName,
  first,
  last,
  onRetry,
}: {
  message: Message;
  mine: boolean;
  slot: PartnerSlot;
  authorName: string;
  first: boolean;
  last: boolean;
  onRetry?: () => void;
}) {
  return (
    <View className={cn(mine ? 'items-end' : 'items-start', first ? 'mt-3' : 'mt-0.5')}>
      <View
        accessible
        accessibilityLabel={`${mine ? 'You' : authorName}: ${message.body}. ${formatClock(message.created_at)}${
          mine ? `, ${message.failed ? 'not sent' : message.pending ? 'sending' : message.status}` : ''
        }`}
        className={cn(
          'max-w-[80%] rounded-bubble px-3.5 pb-1.5 pt-2',
          mine ? MINE[slot] : THEIRS[slot],
          last && (mine ? 'rounded-br-hair' : 'rounded-bl-hair'),
          message.pending && 'opacity-80',
        )}
      >
        <Text className={mine ? 'text-white' : 'text-ink'}>{message.body}</Text>
        <View className="mt-0.5 flex-row items-center justify-end gap-1 self-end">
          <Text className={cn('text-[11px] leading-[14px]', mine ? 'text-white/75' : 'text-ink-muted')}>
            {formatClock(message.created_at)}
          </Text>
          {mine && <Ticks status={message.status} pending={message.pending} failed={message.failed} />}
        </View>
      </View>
      {message.failed && onRetry && (
        <Pressable accessibilityRole="button" onPress={onRetry} className="mt-1 py-1">
          <Text className="font-sans-medium text-micro text-rose-700">Not sent — tap to retry</Text>
        </Pressable>
      )}
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
