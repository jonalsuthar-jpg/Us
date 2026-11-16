import { formatVoiceLength } from '@us/shared';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pause, Play } from 'lucide-react-native';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '../ui/text';

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
