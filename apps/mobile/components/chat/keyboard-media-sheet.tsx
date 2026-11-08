import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { X } from 'lucide-react-native';
import { Modal, Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RichContent } from '@/modules/us-rich-input';
import { Button, IconButton } from '../ui/button';
import { usePalette } from '../ui/palette';
import { Text } from '../ui/text';

export type KeyboardSendAs = 'gif' | 'sticker' | 'video';

/** Gboard's sticker tab hands over PNG / WebP; its GIF tab, GIFs. */
const looksLikeSticker = (mime: string) => mime === 'image/png' || mime === 'image/webp';

/**
 * A GIF or sticker from the keyboard, playing, with how to send it: as a GIF
 * (in a bubble, like a photo), as a sticker (no bubble, and kept in Ours),
 * or, when the keyboard gave a video, as a video. The likely choice is first.
 */
export function KeyboardMediaSheet({
  content,
  stickers,
  onClose,
  onSend,
}: {
  content: RichContent | null;
  /** Whether our stickers are on for this couple. */
  stickers: boolean;
  onClose: () => void;
  onSend: (content: RichContent, as: KeyboardSendAs) => void;
}) {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  if (!content) return null;
  const video = content.mime.startsWith('video/');
  const options: { as: KeyboardSendAs; label: string }[] = video
    ? [{ as: 'video', label: 'Send as video' }]
    : [
        { as: 'gif', label: content.mime === 'image/gif' ? 'Send as GIF' : 'Send as picture' },
        ...(stickers ? [{ as: 'sticker' as const, label: 'Send as sticker' }] : []),
      ];
  if (!video && stickers && looksLikeSticker(content.mime)) options.reverse();
  const aspect = content.width && content.height ? Math.min(Math.max(content.width / content.height, 0.6), 1.8) : 1;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} className="flex-1 justify-end bg-plum-900/25 px-3" style={{ paddingBottom: insets.bottom + 16 }}>
        <Animated.View entering={FadeInDown.duration(200).springify().damping(18)}>
          <Pressable className="gap-4 rounded-[28px] border border-paper-edge bg-paper-raised p-4" style={{ elevation: 12, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } }}>
            <View className="flex-row items-center">
              <Text className="flex-1 font-sans-semibold">{video ? 'Video from the keyboard' : 'From the keyboard'}</Text>
              <IconButton label="Close" size="sm" onPress={onClose}>
                <X size={20} color={c.inkSoft} />
              </IconButton>
            </View>
            <View className="items-center">
              {video ? (
                <LoopingVideo uri={content.uri} aspect={aspect} />
              ) : (
                <Image source={{ uri: content.uri }} style={{ width: 200, aspectRatio: aspect }} contentFit="contain" autoplay accessibilityLabel="Preview" />
              )}
            </View>
            <View className="gap-2">
              {options.map((o, i) => (
                <Button key={o.as} variant={i === 0 ? 'primary' : 'secondary'} onPress={() => onSend(content, o.as)}>
                  {o.label}
                </Button>
              ))}
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/** Muted and on a loop, the way a GIF plays. */
function LoopingVideo({ uri, aspect }: { uri: string; aspect: number }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} nativeControls={false} contentFit="contain" style={{ width: 220, aspectRatio: aspect, borderRadius: 14 }} />;
}
