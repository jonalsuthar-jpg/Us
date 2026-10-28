import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { ArrowLeft, Images, SendHorizontal, SwitchCamera, X, Zap, ZapOff } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, FlatList, Linking, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { preparePhoto, type ReadyPhoto } from '@/lib/photo';
import { Text } from '../ui/text';

const RECENT = 30;
const THUMB = 72;

/**
 * The chat camera, like WhatsApp's: a live viewfinder, your latest photos in
 * a strip above the shutter, and a preview with a caption before it goes.
 */
export function CameraSheet({
  open,
  onClose,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (photo: ReadyPhoto, caption: string) => void;
}) {
  const [shot, setShot] = useState<ReadyPhoto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setShot(null);
      setBusy(false);
      setError(null);
    }
  }, [open]);

  const take = useCallback(async (get: () => Promise<{ uri: string; width?: number; height?: number } | null>) => {
    setBusy(true);
    setError(null);
    try {
      const raw = await get();
      if (raw) setShot(await preparePhoto(raw.uri, raw.width, raw.height));
    } catch {
      setError('Couldn’t open that photo. Try another.');
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <Modal visible={open} animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={shot ? () => setShot(null) : onClose}>
      <View style={styles.black}>
        {open && !shot ? <Viewfinder busy={busy} error={error} onClose={onClose} onTake={take} /> : null}
        {shot ? (
          <Preview
            photo={shot}
            onBack={() => setShot(null)}
            onSend={(caption) => {
              onSend(shot, caption);
              onClose();
            }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

function Viewfinder({
  busy,
  error,
  onClose,
  onTake,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onTake: (get: () => Promise<{ uri: string; width?: number; height?: number } | null>) => void;
}) {
  const insets = useSafeAreaInsets();
  const [perm, requestPerm] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [ready, setReady] = useState(false);
  const recent = useRecentPhotos();

  useEffect(() => {
    if (perm && !perm.granted && perm.canAskAgain) void requestPerm();
  }, [perm, requestPerm]);

  // A quick white blink on the shutter, as the photo is taken.
  const blink = useSharedValue(0);
  const blinkStyle = useAnimatedStyle(() => ({ opacity: blink.value }));

  const shoot = () => {
    if (!ready || busy) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    blink.value = withSequence(withTiming(0.7, { duration: 60 }), withTiming(0, { duration: 220 }));
    onTake(async () => (await camera.current?.takePictureAsync({ quality: 0.85, skipProcessing: false })) ?? null);
  };

  const gallery = () =>
    onTake(async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      const a = res.canceled ? null : res.assets[0];
      return a ? { uri: a.uri, width: a.width, height: a.height } : null;
    });

  return (
    <View style={styles.black}>
      {perm?.granted ? (
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} flash={flash} animateShutter={false} onCameraReady={() => setReady(true)} />
      ) : perm ? (
        <View className="flex-1 items-center justify-center gap-4 px-10">
          <Text className="text-center text-white">Allow the camera for Us to take photos for the chat.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => (perm.canAskAgain ? void requestPerm() : void Linking.openSettings())}
            className="rounded-full bg-white px-5 py-2.5 active:opacity-80"
          >
            <Text className="font-sans-semibold text-ink">{perm.canAskAgain ? 'Allow camera' : 'Open Settings'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={gallery} className="px-5 py-2.5">
            <Text className="text-white/80">Choose from gallery instead</Text>
          </Pressable>
        </View>
      ) : null}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }, blinkStyle]} />

      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Round label="Close camera" onPress={onClose}>
          <X size={24} color="#fff" strokeWidth={2} />
        </Round>
        {perm?.granted && facing === 'back' ? (
          <Round label={flash === 'on' ? 'Flash on' : 'Flash off'} onPress={() => setFlash((f) => (f === 'on' ? 'off' : 'on'))}>
            {flash === 'on' ? <Zap size={22} color="#FFD98A" fill="#FFD98A" /> : <ZapOff size={22} color="#fff" strokeWidth={2} />}
          </Round>
        ) : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 18 }]}>
        {error ? <Text className="mb-3 self-center rounded-full bg-black/60 px-3 py-1 text-small text-white">{error}</Text> : null}
        {recent.length ? (
          <FlatList
            horizontal
            data={recent}
            keyExtractor={(a) => a.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 4, paddingHorizontal: 8 }}
            initialNumToRender={8}
            windowSize={3}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="imagebutton"
                accessibilityLabel="Recent photo"
                onPress={() =>
                  onTake(async () => {
                    const info = await MediaLibrary.getAssetInfoAsync(item);
                    return { uri: info.localUri ?? item.uri, width: item.width, height: item.height };
                  })
                }
                className="active:opacity-70"
              >
                <Image source={{ uri: item.uri }} recyclingKey={item.id} cachePolicy="memory" style={{ width: THUMB, height: THUMB, borderRadius: 10 }} contentFit="cover" />
              </Pressable>
            )}
          />
        ) : null}
        <View className="mt-5 flex-row items-center justify-between px-8">
          <Round label="Choose from gallery" onPress={gallery}>
            <Images size={24} color="#fff" strokeWidth={1.9} />
          </Round>
          <Pressable accessibilityRole="button" accessibilityLabel="Take photo" disabled={!perm?.granted || busy} onPress={shoot} className="active:opacity-80">
            <View style={styles.shutterRing}>{busy ? <ActivityIndicator color="#fff" /> : <View style={styles.shutter} />}</View>
          </Pressable>
          {perm?.granted ? (
            <Round
              label="Switch camera"
              onPress={() => {
                setReady(false);
                setFacing((f) => (f === 'back' ? 'front' : 'back'));
              }}
            >
              <SwitchCamera size={24} color="#fff" strokeWidth={1.9} />
            </Round>
          ) : (
            <View style={{ width: 48 }} />
          )}
        </View>
      </View>
    </View>
  );
}

/** The newest photos on the phone, if Us may see them; asked for once, quietly skipped if not. */
function useRecentPhotos() {
  const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let p = await MediaLibrary.getPermissionsAsync(false, ['photo']);
        if (!p.granted && p.canAskAgain) p = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
        if (!p.granted || cancelled) return;
        const page = await MediaLibrary.getAssetsAsync({ first: RECENT, mediaType: MediaLibrary.MediaType.photo, sortBy: [[MediaLibrary.SortBy.creationTime, false]] });
        if (!cancelled) setAssets(page.assets);
      } catch {
        // No strip; the gallery button still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return assets;
}

function Preview({ photo, onBack, onSend }: { photo: ReadyPhoto; onBack: () => void; onSend: (caption: string) => void }) {
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState('');
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.black}>
      <Animated.View entering={FadeIn.duration(160)} style={{ flex: 1 }}>
        <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
      </Animated.View>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Round label="Back to camera" onPress={onBack}>
          <ArrowLeft size={24} color="#fff" strokeWidth={2} />
        </Round>
      </View>
      <View className="flex-row items-end gap-2 bg-black/70 px-3 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Add a caption…"
          placeholderTextColor="rgba(255,255,255,0.55)"
          accessibilityLabel="Caption"
          multiline
          maxLength={4000}
          className="max-h-[120px] min-h-[48px] flex-1 rounded-[24px] bg-white/15 px-4 py-3 font-sans text-body text-white"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send photo"
          onPress={() => {
            void Haptics.selectionAsync().catch(() => {});
            onSend(caption.trim());
          }}
          className="h-12 w-12 items-center justify-center rounded-full bg-rose-600 active:bg-rose-700"
        >
          <SendHorizontal size={21} color="#fff" strokeWidth={2.1} style={{ marginLeft: 2 }} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Round({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPress={onPress} style={styles.round} className="active:opacity-70">
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  top: { position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  round: { height: 48, width: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  shutterRing: { height: 78, width: 78, borderRadius: 39, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  shutter: { height: 62, width: 62, borderRadius: 31, backgroundColor: '#fff' },
});
