import AsyncStorage from '@react-native-async-storage/async-storage';
import { estimateVideoBytes, formatBytes, type VideoQuality } from '@us/shared';
import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Button } from '../ui/button';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Display, Text } from '../ui/text';

/** The last choice, kept on this phone: most people pick one and stay with it. */
const KEY = 'us:video-quality';

export interface VideoToSend {
  durationMs: number;
  sizeBytes: number;
  width?: number;
  height?: number;
}

const OPTIONS: { value: Exclude<VideoQuality, 'memory'>; label: string; detail: string }[] = [
  { value: 'standard', label: 'Standard', detail: 'Quicker to send, lighter on data' },
  { value: 'hd', label: 'HD', detail: 'Sharp, full 1080p' },
];

/** Standard or HD, with about how big each will be, before a video goes. */
export function VideoQualitySheet({ video, onPick, onClose }: { video: VideoToSend | null; onPick: (q: VideoQuality) => void; onClose: () => void }) {
  const c = usePalette();
  const [quality, setQuality] = useState<VideoQuality>('standard');
  useEffect(() => {
    void AsyncStorage.getItem(KEY)
      .then((q) => {
        if (q === 'hd' || q === 'standard') setQuality(q);
      })
      .catch(() => {});
  }, []);
  const short = video?.width && video.height ? Math.min(video.width, video.height) : undefined;
  return (
    <Modal visible={!!video} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} className="flex-1 justify-end bg-plum-900/40">
        <Pressable className="gap-4 rounded-t-[28px] bg-paper-raised px-5 pb-10 pt-5">
          <Display className="text-heading">Send video</Display>
          <View className="gap-2" accessibilityRole="radiogroup">
            {video
              ? OPTIONS.map((o) => {
                  const bytes = estimateVideoBytes(video.sizeBytes, video.durationMs, o.value, short);
                  const on = quality === o.value;
                  return (
                    <Pressable
                      key={o.value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on, disabled: bytes === null }}
                      disabled={bytes === null}
                      onPress={() => setQuality(o.value)}
                      className={cn('flex-row items-center gap-3 rounded-[18px] border-2 px-4 py-3', on ? 'border-rose-500 bg-rose-50' : 'border-paper-edge', bytes === null && 'opacity-50')}
                    >
                      <View className="flex-1">
                        <Text className="font-sans-semibold text-body">{o.label}</Text>
                        <Text className="text-small text-ink-soft">{bytes === null ? 'Too long for this quality' : `${o.detail} · about ${formatBytes(bytes)}`}</Text>
                      </View>
                      {on ? <Check size={20} color={c.rose} /> : null}
                    </Pressable>
                  );
                })
              : null}
          </View>
          <Button
            onPress={() => {
              void AsyncStorage.setItem(KEY, quality).catch(() => {});
              onPick(quality);
            }}
          >
            Send
          </Button>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
