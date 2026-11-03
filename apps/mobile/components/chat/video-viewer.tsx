import { useVideoPlayer, VideoView } from 'expo-video';
import { X } from 'lucide-react-native';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** A chat video, full screen, playing from the file opened on this phone. */
export function VideoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!uri} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {uri ? <Player uri={uri} onClose={onClose} /> : null}
    </Modal>
  );
}

function Player({ uri, onClose }: { uri: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(uri, (p) => p.play());
  return (
    <View className="flex-1 bg-black">
      <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls fullscreenOptions={{ enable: true }} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close video"
        onPress={onClose}
        className="absolute right-4 h-10 w-10 items-center justify-center rounded-full bg-black/50"
        style={{ top: insets.top + 8 }}
      >
        <X size={22} color="#fff" />
      </Pressable>
    </View>
  );
}
