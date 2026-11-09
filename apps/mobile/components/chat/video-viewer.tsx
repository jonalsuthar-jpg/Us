import { useVideoPlayer, VideoView } from 'expo-video';
import { X } from 'lucide-react-native';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ViewerActions } from '../ui/photo-viewer';

/** A chat video, full screen, playing from the file opened on this phone. */
export function VideoViewer({ uri, onClose, onSave, onDelete }: { uri: string | null; onClose: () => void; onSave?: () => void; onDelete?: () => void }) {
  return (
    <Modal visible={!!uri} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      {uri ? <Player uri={uri} onClose={onClose} onSave={onSave} onDelete={onDelete} /> : null}
    </Modal>
  );
}

function Player({ uri, onClose, onSave, onDelete }: { uri: string; onClose: () => void; onSave?: () => void; onDelete?: () => void }) {
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
      <ViewerActions onSave={onSave} onDelete={onDelete} top={insets.top + 8} />
    </View>
  );
}
