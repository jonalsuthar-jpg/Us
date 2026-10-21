import {
  deleteSnap,
  formatClock,
  keepSnap,
  markSnapSeen,
  reactToSnap,
  replyToSnap,
  SNAP_REACTIONS,
  SNAP_SHOW_MS,
  snapTimeLeft,
  type Snap,
} from '@us/shared';
import { useCouple } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { BookmarkCheck, BookmarkPlus, Check, Send, Trash2, X } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../ui/button';
import { cn } from '../ui/cn';
import { Text } from '../ui/text';

interface Props {
  /** The story being watched: my snaps or my partner's, oldest first. */
  snaps: Snap[] | null;
  start: number;
  kept: Set<string>;
  onClose: () => void;
  mutate: <R>(write: () => Promise<R>) => Promise<R>;
}

/**
 * Full-screen story. Each snap shows for a few seconds; tap the left third to
 * go back, anywhere else to go on; hold to pause. My partner's snaps get
 * reactions and a reply box; mine show whether they've been seen.
 */
export function StoryViewer({ snaps, start, kept, onClose, mutate }: Props) {
  const { sb, me, partner } = useCouple();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(start);
  const [progress, setProgress] = useState(0);
  const [held, setHeld] = useState(false);
  const [typing, setTyping] = useState(false);
  const [reply, setReply] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = !!snaps?.length;
  const snap = snaps?.[Math.min(index, (snaps?.length ?? 1) - 1)];
  const mine = snap?.author_id === me.id;
  const paused = held || typing || busy;

  useEffect(() => {
    if (snaps) setIndex(start);
    // Only when a story opens, not as its snaps refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!snaps, start]);

  // My partner's snap: mark it seen the first time it's on screen.
  const snapId = snap?.id;
  useEffect(() => {
    if (!snap || mine || snap.seen_at) return;
    void mutate(() => markSnapSeen(sb, snap.id)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapId]);

  useEffect(() => {
    setProgress(0);
    setNote(null);
  }, [snapId]);

  // Advance through the story; paused while held, typing or saving.
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!open || paused) {
      last.current = null;
      return;
    }
    let frame = requestAnimationFrame(function tick(t) {
      if (last.current !== null) {
        const step = (t - last.current) / SNAP_SHOW_MS;
        setProgress((p) => Math.min(1, p + step));
      }
      last.current = t;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [open, paused, snapId]);
  useEffect(() => {
    if (progress >= 1) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  function next() {
    if (!snaps) return;
    if (index + 1 < snaps.length) setIndex(index + 1);
    else onClose();
  }
  function back() {
    if (index > 0) setIndex(index - 1);
    else setProgress(0);
  }

  async function act(label: string, write: () => Promise<unknown>) {
    setBusy(true);
    setNote(null);
    try {
      await mutate(write);
      setNote(label || null);
    } catch (e) {
      setNote((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!snap || !reply.trim()) return;
    const text = reply;
    setReply('');
    await act('Sent to your chat', () => replyToSnap(sb, snap, me.id, text));
  }

  return (
    <Modal visible={open} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: '#000' }}>
        {snap ? (
          <>
            <Pressable
              className="flex-1 items-center justify-center"
              accessibilityLabel={snap.caption ?? (mine ? 'Your snap' : `${partner.display_name}’s snap`)}
              accessibilityHint="Tap to go on, tap the left side to go back, hold to pause"
              delayLongPress={200}
              onLongPress={() => setHeld(true)}
              onPressOut={() => setHeld(false)}
              onPress={(e) => (e.nativeEvent.locationX < width / 3 ? back() : next())}
            >
              {snap.url ? <Image source={{ uri: snap.url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
              {snap.caption ? (
                <View className="absolute inset-x-6 bottom-6 items-center">
                  <Text className="rounded-control bg-black/60 px-4 py-2 text-center text-paper">{snap.caption}</Text>
                </View>
              ) : null}
            </Pressable>

            <View className="absolute inset-x-0 top-0 gap-3 bg-black/40 px-4 pb-3" style={{ paddingTop: insets.top + 8 }} pointerEvents="box-none">
              <View className="flex-row gap-1">
                {snaps!.map((s, i) => (
                  <View key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                    <View className="h-full bg-white" style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }} />
                  </View>
                ))}
              </View>
              <View className="flex-row items-center justify-between gap-3">
                <Text className="flex-1 text-small text-paper" numberOfLines={1}>
                  <Text className="font-sans-semibold text-small text-paper">{mine ? 'You' : partner.display_name}</Text>
                  {` · ${formatClock(snap.created_at)} · ${snapTimeLeft(snap.expires_at)}`}
                </Text>
                <IconButton label="Close" tone="night" size="sm" onPress={onClose}>
                  <X size={20} color="#fff" />
                </IconButton>
              </View>
            </View>

            <View className="gap-3 px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
              {note ? (
                <Text accessibilityLiveRegion="polite" className="text-center text-small text-paper/80">
                  {note}
                </Text>
              ) : null}
              {mine ? (
                <View className="flex-row items-center justify-between gap-3">
                  <View className="flex-1 flex-row items-center gap-1.5">
                    {snap.seen_at ? <Check size={16} color="#fff" /> : null}
                    <Text className="text-small text-paper/80">{snap.seen_at ? `Seen ${formatClock(snap.seen_at)}` : 'Not seen yet'}</Text>
                    {snap.reaction ? <Text className="text-lead">{snap.reaction}</Text> : null}
                  </View>
                  <KeepButton kept={kept.has(snap.id)} busy={busy} onKeep={() => void act('Kept in Memories', () => keepSnap(sb, snap, me.id, 'A snap'))} />
                  <Pill label="Delete" disabled={busy} onPress={() => void act('Deleted', () => deleteSnap(sb, snap))}>
                    <Trash2 size={16} color="#fff" />
                  </Pill>
                </View>
              ) : (
                <>
                  <View className="flex-row items-center justify-between gap-2">
                    <View className="flex-row gap-1" accessibilityRole="toolbar" accessibilityLabel="React">
                      {SNAP_REACTIONS.map((emoji) => (
                        <Pressable
                          key={emoji}
                          accessibilityRole="button"
                          accessibilityLabel={`React ${emoji}`}
                          accessibilityState={{ selected: snap.reaction === emoji, disabled: busy }}
                          disabled={busy}
                          onPress={() => {
                            void Haptics.selectionAsync().catch(() => {});
                            void act('', () => reactToSnap(sb, snap.id, snap.reaction === emoji ? null : emoji));
                          }}
                          className={cn('rounded-full p-1.5', snap.reaction === emoji && 'bg-white/25')}
                        >
                          <Text className="text-[24px] leading-[30px]">{emoji}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <KeepButton
                      kept={kept.has(snap.id)}
                      busy={busy}
                      onKeep={() => void act('Kept in Memories', () => keepSnap(sb, snap, me.id, `A snap from ${partner.display_name}`))}
                    />
                  </View>
                  <View className="flex-row items-center gap-2">
                    <TextInput
                      value={reply}
                      onChangeText={setReply}
                      onFocus={() => setTyping(true)}
                      onBlur={() => setTyping(false)}
                      maxLength={4000}
                      placeholder={`Reply to ${partner.display_name}…`}
                      placeholderTextColor="rgba(255,255,255,0.6)"
                      returnKeyType="send"
                      onSubmitEditing={() => void sendReply()}
                      accessibilityLabel={`Reply to ${partner.display_name}`}
                      className="h-11 flex-1 rounded-full bg-white/10 px-4 font-sans text-body text-paper"
                    />
                    <IconButton label="Send reply" tone="end" size="sm" disabled={!reply.trim() || busy} onPress={() => void sendReply()}>
                      <Send size={18} color="#fff" />
                    </IconButton>
                  </View>
                </>
              )}
            </View>
          </>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function KeepButton({ kept, busy, onKeep }: { kept: boolean; busy: boolean; onKeep: () => void }) {
  return (
    <Pill label={kept ? 'In Memories' : 'Keep'} disabled={busy || kept} onPress={onKeep}>
      {kept ? <BookmarkCheck size={16} color="#fff" /> : <BookmarkPlus size={16} color="#fff" />}
    </Pill>
  );
}

function Pill({ label, disabled, onPress, children }: { label: string; disabled?: boolean; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn('flex-row items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 active:bg-white/20', disabled && 'opacity-70')}
    >
      {children}
      <Text className="text-small text-paper">{label}</Text>
    </Pressable>
  );
}
