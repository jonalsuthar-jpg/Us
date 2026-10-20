import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './button';
import { cn } from './cn';

/** The whole photo at its own shape (never cropped); tap to open it full screen. */
export function Photo({ uri, label, className }: { uri: string; label: string; className?: string }) {
  const [ratio, setRatio] = useState(4 / 3);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel={`${label}. Open full screen`} onPress={() => setOpen(true)}>
        <Image
          source={{ uri }}
          onLoad={(e) => {
            const { width, height } = e.nativeEvent.source;
            if (width && height) setRatio(width / height);
          }}
          // Very tall photos are capped and letterboxed rather than filling the sheet.
          style={{ aspectRatio: Math.max(ratio, 3 / 4) }}
          className={cn('w-full rounded-control bg-paper-sunken', className)}
          resizeMode="contain"
        />
      </Pressable>
      <PhotoViewer uri={open ? uri : null} label={label} onClose={() => setOpen(false)} />
    </>
  );
}

/** Black full-screen viewer. Pinch to zoom on iOS; double-tap toggles 2× on both. */
export function PhotoViewer({ uri, label, onClose }: { uri: string | null; label: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [zoomed, setZoomed] = useState(false);
  const [lastTap, setLastTap] = useState(0);
  const scale = zoomed ? 2 : 1;
  return (
    <Modal visible={!!uri} animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        {uri ? (
          <ScrollView
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            horizontal={zoomed}
            contentContainerStyle={{ width: width * scale, minHeight: height }}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              scrollEnabled={zoomed}
              contentContainerStyle={{ height: height * scale, width: width * scale }}
            >
              <Pressable
                accessibilityLabel={label}
                onPress={() => {
                  const now = Date.now();
                  if (now - lastTap < 300) setZoomed((z) => !z);
                  setLastTap(now);
                }}
              >
                <Image source={{ uri }} style={{ width: width * scale, height: height * scale }} resizeMode="contain" />
              </Pressable>
            </ScrollView>
          </ScrollView>
        ) : null}
        <IconButton
          label="Close photo"
          tone="night"
          onPress={() => {
            setZoomed(false);
            onClose();
          }}
          className="absolute right-4"
          style={{ top: insets.top + 8 }}
        >
          <X size={22} color="#fff" />
        </IconButton>
      </View>
    </Modal>
  );
}
