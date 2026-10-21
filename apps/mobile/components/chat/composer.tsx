import { formatVoiceLength } from '@us/shared';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { ArrowUp, ImagePlus, Mic, Square, Trash2, X } from 'lucide-react-native';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Text } from '../ui/text';
import type { ReplyQuote } from './bubble';

const MAX_VOICE_MS = 5 * 60_000;

export function Composer({
  partnerName,
  onSend,
  onChange,
  replyTo,
  onCancelReply,
  onPhoto,
  onVoice,
  onGif,
}: {
  partnerName: string;
  onSend: (text: string) => void;
  onChange: (text: string) => void;
  replyTo?: ReplyQuote | null;
  onCancelReply?: () => void;
  /** Pick a photo; the current text goes along as its caption. */
  onPhoto?: (caption: string) => void;
  onVoice?: (uri: string, durationMs: number) => void;
  /** Open the GIF and sticker picker. */
  onGif?: () => void;
}) {
  const [text, setText] = useState('');
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
        <View className="flex-row items-center gap-3 rounded-[18px] border border-paper-edge bg-paper-sunken px-4 py-2">
          <View className="flex-1 border-l-[3px] border-rose-400 pl-2.5">
            <Text className="font-sans-medium text-micro">{`Replying to ${replyTo.author}`}</Text>
            <Text numberOfLines={1} className="text-small text-ink-soft">
              {replyTo.text}
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" hitSlop={8} onPress={onCancelReply}>
            <X size={18} color={c.inkMuted} />
          </Pressable>
        </View>
      ) : null}
      {error ? <Text className="px-2 text-small text-rose-700">{error}</Text> : null}

      {recording ? (
        <View className="flex-row items-center gap-3 rounded-[26px] border border-rose-300 bg-paper-raised p-1.5 pl-4">
          <View className="h-2.5 w-2.5 rounded-full bg-rose-600" />
          <Text className="flex-1" accessibilityLiveRegion="none">{`Recording ${formatVoiceLength(rec.durationMillis)}`}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Discard voice note" onPress={() => void stop(false)} className="h-10 w-10 items-center justify-center rounded-full">
            <Trash2 size={20} color={c.inkSoft} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Send voice note" onPress={() => void stop(true)} className="h-10 w-10 items-center justify-center rounded-full bg-rose-600">
            <Square size={16} color="#fff" fill="#fff" />
          </Pressable>
        </View>
      ) : (
        <View className="flex-row items-end gap-1.5 rounded-[26px] border border-paper-edge bg-paper-raised p-1.5 pl-2">
          {onPhoto ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send a photo"
              onPress={() => {
                onPhoto(text.trim());
                setText('');
              }}
              className="h-10 w-10 items-center justify-center rounded-full active:bg-paper-sunken"
            >
              <ImagePlus size={21} color={c.inkSoft} />
            </Pressable>
          ) : null}
          {onGif ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send a GIF or sticker"
              onPress={onGif}
              className="h-10 items-center justify-center rounded-full px-1.5 active:bg-paper-sunken"
            >
              <Text className="rounded-md border-[1.5px] border-ink-soft px-1 font-sans-bold text-[11px] leading-[14px] text-ink-soft">GIF</Text>
            </Pressable>
          ) : null}
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
            className="max-h-[140px] flex-1 py-2.5 font-sans text-body text-ink"
          />
          {!canSend && onVoice ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Record a voice note"
              onPress={() => void start()}
              className="h-10 w-10 items-center justify-center rounded-full bg-rose-50 active:bg-rose-100"
            >
              <Mic size={20} color={c.roseStrong} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: !canSend }}
              disabled={!canSend}
              onPress={() => {
                onSend(text.trim());
                setText('');
              }}
              className={cn('h-10 w-10 items-center justify-center rounded-full bg-rose-600 active:bg-rose-700', !canSend && 'opacity-30')}
            >
              <ArrowUp size={20} color="#fff" strokeWidth={2.25} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
