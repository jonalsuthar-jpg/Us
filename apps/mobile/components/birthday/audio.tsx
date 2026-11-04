import { formatVoiceLength } from '@us/shared';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { Mic, Pause, Play, Square } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../ui/text';

/** Loud enough, for long enough, to be a breath on the mic rather than talking. */
const BLOW_DB = -14;
const BLOW_SAMPLES = 3;

/**
 * Listens on the mic while `listening`, and calls `onBlow` once for a blow.
 * Returns whether the mic is in use; without permission the candles are
 * simply tapped instead.
 */
export function useBlow(listening: boolean, onBlow: () => void): 'off' | 'on' | 'denied' {
  const recorder = useAudioRecorder({ ...RecordingPresets.LOW_QUALITY, isMeteringEnabled: true });
  const rec = useAudioRecorderState(recorder, 100);
  const [mic, setMic] = useState<'off' | 'on' | 'denied'>('off');
  const loud = useRef(0);
  const blown = useRef(onBlow);
  blown.current = onBlow;

  useEffect(() => {
    if (!listening) return;
    let live = true;
    void (async () => {
      const perm = await requestRecordingPermissionsAsync().catch(() => null);
      if (!live) return;
      if (!perm?.granted) return setMic('denied');
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        if (!live) return;
        recorder.record();
        setMic('on');
      } catch {
        setMic('denied');
      }
    })();
    return () => {
      live = false;
      setMic('off');
      loud.current = 0;
      void (async () => {
        await recorder.stop().catch(() => {});
        // Back to the speaker, for the song.
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      })();
    };
  }, [listening, recorder]);

  useEffect(() => {
    if (mic !== 'on' || rec.metering == null) return;
    loud.current = rec.metering > BLOW_DB ? loud.current + 1 : 0;
    if (loud.current >= BLOW_SAMPLES) {
      loud.current = 0;
      blown.current();
    }
  }, [mic, rec.metering]);

  return mic;
}

/** Play / pause a voice note, big. */
export function SongPlayer({ url, autoPlay }: { url: string; autoPlay?: boolean }) {
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);
  const play = () => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    player.play();
  };
  useEffect(() => {
    if (autoPlay) play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player]);
  useEffect(() => {
    if (status.didJustFinish) void player.seekTo(0);
  }, [status.didJustFinish, player]);
  const progress = status.duration ? Math.min(1, status.currentTime / status.duration) : 0;
  return (
    <View className="items-center gap-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause the song' : 'Play the song'}
        onPress={() => (status.playing ? player.pause() : play())}
        className="h-24 w-24 items-center justify-center rounded-full bg-rose-500 active:bg-rose-600"
        style={{ shadowColor: '#E46B8A', shadowOpacity: 0.6, shadowRadius: 24, elevation: 10 }}
      >
        {status.playing ? <Pause size={38} color="#fff" fill="#fff" /> : <Play size={38} color="#fff" fill="#fff" style={{ marginLeft: 5 }} />}
      </Pressable>
      <View className="h-1.5 w-56 overflow-hidden rounded-full bg-white/20">
        <View className="h-full rounded-full bg-gold-300" style={{ width: `${progress * 100}%` }} />
      </View>
      <Text className="text-small text-plum-200">
        {formatVoiceLength(status.currentTime * 1000)} / {formatVoiceLength((status.duration || 0) * 1000)}
      </Text>
    </View>
  );
}

/** Record a voice note for the room; hands back the file and its length. */
export function VoiceRecorder({ onDone }: { onDone: (uri: string, ms: number) => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 250);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) return setError('Allow the microphone for Us in Settings to record.');
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
    } catch {
      setError('Couldn’t start recording. Try again.');
    }
  }

  async function stop() {
    const ms = rec.durationMillis;
    setRecording(false);
    try {
      await recorder.stop();
    } finally {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
    if (recorder.uri && ms > 600) onDone(recorder.uri, ms);
  }

  return (
    <View className="items-center gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Stop recording' : 'Record'}
        onPress={() => void (recording ? stop() : start())}
        className="h-20 w-20 items-center justify-center rounded-full bg-rose-600 active:bg-rose-700"
      >
        {recording ? <Square size={28} color="#fff" fill="#fff" /> : <Mic size={32} color="#fff" />}
      </Pressable>
      <Text className="text-small text-ink-soft">{recording ? `Recording… ${formatVoiceLength(rec.durationMillis)} · tap to stop` : 'Tap to record'}</Text>
      {error ? <Text className="text-small text-rose-600">{error}</Text> : null}
    </View>
  );
}
