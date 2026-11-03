import { formatVoiceLength, VIDEO_MAX_MS } from '@us/shared';
import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType, type FlashMode } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useVideoPlayer, VideoView } from 'expo-video';
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

/** A recorded (or picked) video, as the camera hands it to the chat. */
export interface CameraClip {
  uri: string;
  durationMs: number;
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType?: string;
}

type Mode = 'photo' | 'video';

/**
 * The chat camera, like WhatsApp's: a live viewfinder, your latest photos in
 * a strip above the shutter, and a preview with a caption before it goes.
 * With `onSendVideo` it also records videos (up to a minute).
 */
export function CameraSheet({
  open,
  onClose,
  onSend,
  onSendVideo,
}: {
  open: boolean;
  onClose: () => void;
  onSend: (photo: ReadyPhoto, caption: string) => void;
  onSendVideo?: (clip: CameraClip, caption: string) => void;
}) {
  const [shot, setShot] = useState<ReadyPhoto | null>(null);
  const [clip, setClip] = useState<CameraClip | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      setShot(null);
      setClip(null);
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
    <Modal
      visible={open}
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={shot ? () => setShot(null) : clip ? () => setClip(null) : onClose}
    >
      <View style={styles.black}>
        {open && !shot && !clip ? (
          <Viewfinder busy={busy} error={error} onClose={onClose} onTake={take} onClip={onSendVideo ? setClip : undefined} onError={setError} />
        ) : null}
        {clip && onSendVideo ? (
          <VideoPreview
            clip={clip}
            onBack={() => setClip(null)}
            onSend={(caption) => {
              onSendVideo(clip, caption);
              onClose();
            }}
          />
        ) : null}
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
  onClip,
  onError,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onTake: (get: () => Promise<{ uri: string; width?: number; height?: number } | null>) => void;
  /** Present when videos can be sent: shows the Photo | Video switch. */
  onClip?: (clip: CameraClip) => void;
  onError: (message: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const [perm, requestPerm] = useCameraPermissions();
  const [mic, requestMic] = useMicrophonePermissions();
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('photo');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const recent = useRecentPhotos();

  // The running time while recording; it stops by itself at the limit.
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => clearInterval(t);
  }, [recording]);

  const record = async () => {
    if (!ready || busy || !onClip) return;
    if (recording) {
      camera.current?.stopRecording();
      return;
    }
    if (!mic?.granted) {
      const asked = await requestMic();
      if (!asked.granted) {
        onError(asked.canAskAgain ? 'Allow the microphone to record videos with sound.' : 'Allow the microphone for Us in Settings to record videos.');
        return;
      }
    }
    onError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    startedAt.current = Date.now();
    setElapsed(0);
    setRecording(true);
    try {
      const res = await camera.current?.recordAsync({ maxDuration: VIDEO_MAX_MS / 1000 });
      const durationMs = Date.now() - startedAt.current;
      if (res?.uri) onClip({ uri: res.uri, durationMs: Math.min(durationMs, VIDEO_MAX_MS) });
    } catch {
      onError('Couldn’t record that video. Try again.');
    } finally {
      setRecording(false);
    }
  };

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

  const gallery = () => {
    if (mode === 'video' && onClip) {
      void (async () => {
        const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], videoMaxDuration: VIDEO_MAX_MS / 1000, quality: 1 });
        const a = res.canceled ? null : res.assets[0];
        if (a) onClip({ uri: a.uri, durationMs: Math.round(a.duration ?? 0), width: a.width, height: a.height, fileSize: a.fileSize, mimeType: a.mimeType });
      })().catch(() => onError('Couldn’t open that video. Try another.'));
      return;
    }
    onTake(async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      const a = res.canceled ? null : res.assets[0];
      return a ? { uri: a.uri, width: a.width, height: a.height } : null;
    });
  };
  const video = mode === 'video';

  return (
    <View style={styles.black}>
      {perm?.granted ? (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode={video ? 'video' : 'picture'}
          videoQuality="720p"
          // Video has no flash: the light stays on instead.
          flash={video ? 'off' : flash}
          enableTorch={video && flash === 'on'}
          animateShutter={false}
          onCameraReady={() => setReady(true)}
        />
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
        {recording ? (
          <View className="flex-row items-center gap-2 self-center rounded-full bg-black/55 px-3 py-1.5">
            <View className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <Text className="font-sans-semibold text-small text-white">
              {formatVoiceLength(elapsed)} / {formatVoiceLength(VIDEO_MAX_MS)}
            </Text>
          </View>
        ) : null}
        {perm?.granted && facing === 'back' ? (
          <Round label={flash === 'on' ? 'Flash on' : 'Flash off'} onPress={() => setFlash((f) => (f === 'on' ? 'off' : 'on'))}>
            {flash === 'on' ? <Zap size={22} color="#FFD98A" fill="#FFD98A" /> : <ZapOff size={22} color="#fff" strokeWidth={2} />}
          </Round>
        ) : null}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 18 }]}>
        {error ? <Text className="mb-3 self-center rounded-full bg-black/60 px-3 py-1 text-small text-white">{error}</Text> : null}
        {recent.length && !video ? (
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
        {onClip && perm?.granted && !recording ? (
          <View className="mt-4 flex-row self-center rounded-full bg-black/45 p-1">
            {(['photo', 'video'] as const).map((m) => (
              <Pressable
                key={m}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === m }}
                onPress={() => {
                  onError(null);
                  setMode(m);
                }}
                className={mode === m ? 'rounded-full bg-white px-4 py-1.5' : 'rounded-full px-4 py-1.5'}
              >
                <Text className={mode === m ? 'font-sans-semibold text-small text-ink' : 'text-small text-white'}>{m === 'photo' ? 'Photo' : 'Video'}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View className="mt-5 flex-row items-center justify-between px-8">
          {recording ? (
            <View style={{ width: 48 }} />
          ) : (
            <Round label={video ? 'Choose a video from gallery' : 'Choose from gallery'} onPress={gallery}>
              <Images size={24} color="#fff" strokeWidth={1.9} />
            </Round>
          )}
          {video ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={recording ? 'Stop recording' : 'Record video'}
              disabled={!perm?.granted || busy}
              onPress={() => void record()}
              className="active:opacity-80"
            >
              <View style={styles.shutterRing}>
                <View style={recording ? styles.stop : styles.rec} />
              </View>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Take photo" disabled={!perm?.granted || busy} onPress={shoot} className="active:opacity-80">
              <View style={styles.shutterRing}>{busy ? <ActivityIndicator color="#fff" /> : <View style={styles.shutter} />}</View>
            </Pressable>
          )}
          {perm?.granted && !recording ? (
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

function VideoPreview({ clip, onBack, onSend }: { clip: CameraClip; onBack: () => void; onSend: (caption: string) => void }) {
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState('');
  const player = useVideoPlayer(clip.uri, (p) => {
    p.loop = true;
    p.play();
  });
  return (
    <KeyboardAvoidingView behavior="padding" style={styles.black}>
      <Animated.View entering={FadeIn.duration(160)} style={{ flex: 1 }}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
      </Animated.View>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Round label="Back to camera" onPress={onBack}>
          <ArrowLeft size={24} color="#fff" strokeWidth={2} />
        </Round>
        <Text className="self-center rounded-full bg-black/55 px-3 py-1 text-small text-white">{formatVoiceLength(clip.durationMs)}</Text>
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
          accessibilityLabel="Send video"
          onPress={() => {
            void Haptics.selectionAsync().catch(() => {});
            player.pause();
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
  rec: { height: 58, width: 58, borderRadius: 29, backgroundColor: '#E5484D' },
  stop: { height: 28, width: 28, borderRadius: 6, backgroundColor: '#E5484D' },
});
