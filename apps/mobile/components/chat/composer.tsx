import { formatVoiceLength } from '@us/shared';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Camera, Mic, Paperclip, SendHorizontal, Square, Sticker, Trash2, X } from 'lucide-react-native';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring, withTiming, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { usePalette } from '../ui/palette';
import { Text } from '../ui/text';
import type { ReplyQuote } from './bubble';

const MAX_VOICE_MS = 5 * 60_000;
const ICON = { size: 22, strokeWidth: 1.8 };

/**
 * The message bar, laid out like WhatsApp: stickers on the left of the
 * field, attach and camera on its right, and one round button outside it that
 * records a voice note and becomes Send once there's text.
 */
export function Composer({
  partnerName,
  initialText = '',
  onSend,
  onChange,
  replyTo,
  onCancelReply,
  onVoice,
  onSticker,
  onAttach,
  onCamera,
}: {
  partnerName: string;
  /** A draft to pick up where you left off. */
  initialText?: string;
  onSend: (text: string) => void;
  onChange: (text: string) => void;
  replyTo?: ReplyQuote | null;
  onCancelReply?: () => void;
  onVoice?: (uri: string, durationMs: number) => void;
  /** Our stickers: send one, or make one from a photo. */
  onSticker?: () => void;
  /** The attach sheet: gallery, camera, draw, GIF, make a sticker. */
  onAttach?: () => void;
  /** The in-app camera. */
  onCamera?: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const c = usePalette();
  const canSend = text.trim().length > 0;

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 250);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (replyTo) input.current?.focus();
  }, [replyTo]);

  useEffect(() => {
    if (recording && rec.durationMillis >= MAX_VOICE_MS) void stop(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, rec.durationMillis]);

  async function start() {
    setError(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) return setError('Allow the microphone for Us in Settings to record a voice note.');
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } catch {
      setError('Couldn’t start recording. Try again.');
    }
  }

  async function stop(send: boolean) {
    const ms = rec.durationMillis;
    setRecording(false);
    try {
      await recorder.stop();
    } finally {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    }
    if (send && recorder.uri && ms > 600) onVoice?.(recorder.uri, ms);
  }

  return (
    <View className="gap-2">
      {replyTo ? (
        <Animated.View entering={FadeIn.duration(140)} className="flex-row items-center gap-3 rounded-[18px] border border-paper-edge bg-paper-sunken px-4 py-2">
          <View className="flex-1 border-l-[3px] border-rose-400 pl-2.5">
            <Text className="font-sans-medium text-micro">{`Replying to ${replyTo.author}`}</Text>
            <Text numberOfLines={1} className="text-small text-ink-soft">
              {replyTo.text}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" hitSlop={8} onPress={onCancelReply}>
            <X size={18} color={c.inkMuted} />
          </Pressable>
        </Animated.View>
      ) : null}
      {error ? <Text className="px-2 text-small text-rose-700">{error}</Text> : null}

      <View className="flex-row items-end gap-2">
        {recording ? (
          <View className="min-h-[48px] flex-1 flex-row items-center gap-3 rounded-[26px] border border-rose-300 bg-paper-raised pl-4 pr-1" style={{ elevation: 1 }}>
            <View className="h-2.5 w-2.5 rounded-full bg-rose-600" />
            <Text className="flex-1" accessibilityLiveRegion="none">{`Recording ${formatVoiceLength(rec.durationMillis)}`}</Text>
            <IconTap label="Discard voice note" onPress={() => void stop(false)}>
              <Trash2 {...ICON} color={c.inkSoft} />
            </IconTap>
          </View>
        ) : (
          <View className="min-h-[48px] flex-1 flex-row items-end rounded-[26px] border border-paper-edge bg-paper-raised px-1" style={{ elevation: 1 }}>
            {onSticker ? (
              <IconTap label="Stickers" onPress={onSticker}>
                <Sticker {...ICON} color={c.inkSoft} />
              </IconTap>
            ) : (
              <View className="w-3" />
            )}
            <TextInput
              ref={input}
              accessibilityLabel={`Message ${partnerName}`}
              placeholder={`Message ${partnerName}…`}
              placeholderTextColor={c.placeholder}
              multiline
              maxLength={4000}
              value={text}
              onChangeText={(t) => {
                setText(t);
                onChange(t);
              }}
              className="max-h-[140px] flex-1 px-1 py-3 font-sans text-body text-ink"
            />
            {onAttach ? (
              <IconTap label="Attach" onPress={onAttach}>
                <View style={{ transform: [{ rotate: '-45deg' }] }}>
                  <Paperclip {...ICON} color={c.inkSoft} />
                </View>
              </IconTap>
            ) : null}
            {/* Out of the way while typing, as in WhatsApp, so the words get the room. */}
            {onCamera && !canSend ? (
              <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)}>
                <IconTap label="Camera" onPress={onCamera}>
                  <Camera {...ICON} color={c.inkSoft} />
                </IconTap>
              </Animated.View>
            ) : null}
          </View>
        )}

        <ActionButton
          label={recording ? 'Send voice note' : canSend ? 'Send' : 'Record a voice note'}
          disabled={!recording && !canSend && !onVoice}
          onPress={() => {
            if (recording) return void stop(true);
            if (canSend) {
              void Haptics.selectionAsync().catch(() => {});
              onSend(text.trim());
              setText('');
              return;
            }
            void start();
          }}
        >
          {recording ? (
            <Animated.View key="stop" entering={ZoomIn.duration(140)} exiting={ZoomOut.duration(100)}>
              <Square size={17} color="#fff" fill="#fff" />
            </Animated.View>
          ) : canSend ? (
            <Animated.View key="send" entering={ZoomIn.duration(140)} exiting={ZoomOut.duration(100)}>
              <SendHorizontal size={21} color="#fff" strokeWidth={2.1} style={{ marginLeft: 2 }} />
            </Animated.View>
          ) : (
            <Animated.View key="mic" entering={ZoomIn.duration(140)} exiting={ZoomOut.duration(100)}>
              <Mic size={22} color="#fff" strokeWidth={2} />
            </Animated.View>
          )}
        </ActionButton>
      </View>
    </View>
  );
}

/** Springs down a little under the finger. */
function usePressScale(to: number) {
  const s = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return {
    style,
    onPressIn: () => {
      s.value = withTiming(to, { duration: 90 });
    },
    onPressOut: () => {
      s.value = withSpring(1, { damping: 14, stiffness: 320 });
    },
  };
}

/** A round, quiet icon button inside the message field. */
function IconTap({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  const press = usePressScale(0.86);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      className="h-[46px] w-10 items-center justify-center"
    >
      <Animated.View style={press.style}>{children}</Animated.View>
    </Pressable>
  );
}

/** The round mic / send button beside the field. */
function ActionButton({ label, disabled, onPress, children }: { label: string; disabled?: boolean; onPress: () => void; children: ReactNode }) {
  const press = usePressScale(0.9);
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={onPress}
    >
      <Animated.View
        style={[
          press.style,
          { height: 48, width: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: c.roseStrong, elevation: 3, shadowColor: c.roseStrong, shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
          disabled && { opacity: 0.4 },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
