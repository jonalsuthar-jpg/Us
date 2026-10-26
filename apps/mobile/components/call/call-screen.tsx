import { formatDuration, type CallState } from '@us/shared';
import { useCallManager, useCallState, useCouple, useFeature } from '@us/shared/react';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Bluetooth, Check, ChevronDown, Ear, Headphones, Maximize, Mic, MicOff, Minimize, MonitorPlay, MonitorUp, PenLine, Phone, PhoneOff, Radio, SwitchCamera, Video, VideoOff, Volume2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StatusBar, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MediaStream, RTCView } from 'react-native-webrtc';
import { chooseRoute, onAudioRoutes, startCallAudio, stopCallAudio, type AudioRoute } from '@/lib/audio-route';
import { cancelIncomingRing, setShowWhenLocked, startCallService, stopCallService } from '@/modules/us-call';
import { Avatar } from '../ui/avatar';
import { cn } from '../ui/cn';
import { LiveBoard } from '../draw/live-board';
import { Button, IconButton } from '../ui/button';
import { Display, Text } from '../ui/text';
import { ListenSurface } from './listen-surface';

/**
 * Full-screen call surface, mounted once in the app layout. A call in progress
 * can be minimised to a bar over the app (back button or the chevron), so the
 * rest of Us stays usable while you talk.
 */
export function CallScreen() {
  const state = useCallState();
  const [minimised, setMinimised] = useState(false);
  // Watching their shared screen full screen, turned sideways.
  const [full, setFull] = useState(false);
  const sharing = (state.phase === 'connected' || state.phase === 'reconnecting') && state.remote.screen && !!state.remoteStream;
  useCallAudio(state);
  useEffect(() => {
    if (!sharing) setFull(false);
  }, [sharing]);
  useEffect(() => {
    if (!full) return;
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    StatusBar.setHidden(true, 'fade');
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      StatusBar.setHidden(false, 'fade');
    };
  }, [full]);
  const canMinimise = state.phase !== 'idle' && state.phase !== 'incoming' && state.phase !== 'ended';
  // A new ring or the end of the call always brings the full screen back.
  useEffect(() => {
    if (!canMinimise) setMinimised(false);
  }, [canMinimise]);
  const minimise = () => {
    if (canMinimise) setMinimised(true);
  };
  return (
    <>
      <Modal
        visible={state.phase !== 'idle' && !minimised}
        animationType="fade"
        presentationStyle="fullScreen"
        statusBarTranslucent
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={full ? () => setFull(false) : minimise}
      >
        {state.phase !== 'idle' &&
          (state.media === 'listen' ? (
            <ListenSurface state={state} onMinimise={canMinimise ? minimise : undefined} />
          ) : full && sharing ? (
            <FullScreenShare state={state} onExit={() => setFull(false)} />
          ) : (
            <Surface state={state} onMinimise={canMinimise ? minimise : undefined} onFullScreen={sharing ? () => setFull(true) : undefined} />
          ))}
      </Modal>
      {minimised && <CallBar state={state} onExpand={() => setMinimised(false)} />}
    </>
  );
}

/**
 * Their shared screen and nothing else, sideways. A tap brings up exit and
 * hang-up for a few seconds.
 */
function FullScreenShare({ state, onExit }: { state: CallState; onExit: () => void }) {
  const m = useCallManager();
  const [controls, setControls] = useState(true);
  useEffect(() => {
    if (!controls) return;
    const t = setTimeout(() => setControls(false), 3000);
    return () => clearTimeout(t);
  }, [controls]);
  return (
    <Pressable accessibilityLabel="Show call controls" onPress={() => setControls((v) => !v)} className="flex-1 bg-black">
      <RTCView streamURL={(state.remoteStream as unknown as MediaStream).toURL()} objectFit="contain" style={{ flex: 1 }} />
      {controls ? (
        <Animated.View entering={FadeIn.duration(200)} className="absolute right-5 top-5 flex-row gap-3">
          <IconButton label="Exit full screen" tone="night" onPress={onExit}>
            <Minimize size={20} color="#FCFAFB" />
          </IconButton>
          <IconButton label="End call" tone="end" onPress={() => void m.hangup()}>
            <PhoneOff size={20} color="#fff" />
          </IconButton>
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

const ROUTES: Record<AudioRoute, { label: string; icon: typeof Ear }> = {
  EARPIECE: { label: 'Phone', icon: Ear },
  SPEAKER_PHONE: { label: 'Speaker', icon: Volume2 },
  WIRED_HEADSET: { label: 'Headphones', icon: Headphones },
  BLUETOOTH: { label: 'Bluetooth', icon: Bluetooth },
};

/** The minimised call: who, how long, mute and hang up. Tap to go back to the call. */
function CallBar({ state, onExpand }: { state: CallState; onExpand: () => void }) {
  const m = useCallManager();
  const { partner } = useCouple();
  const insets = useSafeAreaInsets();
  const elapsed = useElapsed(state.connectedAt);
  const status =
    state.phase === 'connected' ? formatDuration(elapsed) : state.phase === 'reconnecting' ? 'Reconnecting…' : 'Calling…';
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 6, left: 12, right: 12 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Call with ${partner.display_name}, ${status}. Return to call`}
        onPress={onExpand}
        className="flex-row items-center gap-3 rounded-full bg-sage-600 py-1.5 pl-4 pr-1.5 shadow-lg active:bg-sage-700"
        style={{ elevation: 8 }}
      >
        <View className="h-2 w-2 rounded-full bg-white" />
        <View className="flex-1">
          <Text className="font-sans-semibold text-small text-white" numberOfLines={1}>
            {partner.display_name}
          </Text>
          <Text className="text-micro text-white/80">{`${status} · ${state.media === 'listen' ? 'listening together' : state.media === 'watch' ? 'watching together' : 'tap to return'}`}</Text>
        </View>
        <IconButton
          label={state.local.mic ? 'Mute' : 'Unmute'}
          size="sm"
          tone={state.local.mic ? 'night' : 'nightOff'}
          onPress={() => m.toggleMic()}
        >
          {state.local.mic ? <Mic size={18} color="#fff" /> : <MicOff size={18} color="#241933" />}
        </IconButton>
        <IconButton label="End call" size="sm" tone="end" onPress={() => void m.hangup()}>
          <PhoneOff size={18} color="#fff" />
        </IconButton>
      </Pressable>
    </Animated.View>
  );
}

/** Hand the audio session to the call while it's live; release it after. */
function useCallAudio(state: CallState) {
  const { partner } = useCouple();
  const started = useRef(false);
  const active = state.phase === 'connecting' || state.phase === 'connected' || state.phase === 'reconnecting';
  const video = state.local.camera || state.media === 'video';
  useEffect(() => {
    if (active && !started.current) {
      started.current = true;
      // Listening and watching play out loud, like a video call.
      void startCallAudio(state.media === 'audio' ? 'audio' : 'video');
    } else if (!active && started.current) {
      started.current = false;
      stopCallAudio();
      stopCallService();
    }
  }, [active, state.media]);
  // Android cuts the mic (and camera) of a backgrounded app unless a call
  // service holds them; restarting it when the camera turns on adds the camera.
  useEffect(() => {
    const what = state.media === 'listen' ? 'Listening with' : state.media === 'watch' ? 'Watching with' : 'Call with';
    if (active) startCallService(`${what} ${partner.display_name}`, video);
  }, [active, video, partner.display_name, state.media]);
  // The app is showing this call now: stop any lock-screen ringing for it.
  const callId = state.call?.id ?? null;
  useEffect(() => {
    if (callId && state.phase !== 'idle') cancelIncomingRing(callId);
  }, [callId, state.phase]);
  // Ringing or on a call: show over the lock screen, like a phone call.
  const onScreen = active || state.phase === 'incoming';
  useEffect(() => setShowWhenLocked(onScreen), [onScreen]);
  useEffect(
    () => () => {
      if (started.current) {
        stopCallAudio();
        stopCallService();
      }
      setShowWhenLocked(false);
    },
    [],
  );
}

function useElapsed(start: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!start) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [start]);
  return start ? now - start : 0;
}

function Surface({ state, onMinimise, onFullScreen }: { state: CallState; onMinimise?: () => void; onFullScreen?: () => void }) {
  const m = useCallManager();
  const { partner, partnerSlot } = useCouple();
  const insets = useSafeAreaInsets();
  const elapsed = useElapsed(state.connectedAt);
  const [nudge, setNudge] = useState(false);
  const canDraw = useFeature('draw');
  const [drawing, setDrawing] = useState(false);
  // Where the sound goes. Android reports the devices (earpiece, speaker, wired,
  // Bluetooth); elsewhere it's a plain speaker toggle that starts at the default.
  const [routes, setRoutes] = useState<{ available: AudioRoute[]; selected: AudioRoute | null }>({ available: [], selected: null });
  useEffect(() => onAudioRoutes((available, selected) => setRoutes({ available, selected })), []);
  const [speaker, setSpeakerOn] = useState(state.media !== 'audio');
  const [routePicker, setRoutePicker] = useState(false);
  const route: AudioRoute = routes.selected ?? (speaker ? 'SPEAKER_PHONE' : 'EARPIECE');
  const routeOptions: AudioRoute[] = routes.available.length ? routes.available : ['EARPIECE', 'SPEAKER_PHONE'];
  const pickRoute = (r: AudioRoute) => {
    chooseRoute(r);
    setSpeakerOn(r === 'SPEAKER_PHONE');
    setRoutes((prev) => ({ ...prev, selected: r }));
    setRoutePicker(false);
  };
  const RouteIcon = ROUTES[route].icon;
  // The self view sits just above the controls, however tall they turn out.
  const [controlsHeight, setControlsHeight] = useState(208);

  const live = state.phase === 'connected' || state.phase === 'reconnecting';
  const ringing = state.phase === 'outgoing' || state.phase === 'incoming' || state.phase === 'connecting';
  // A shared screen arrives on the camera's track, so show it even with their camera off.
  const remoteVideo = live && (state.remote.camera || state.remote.screen) && state.remoteStream;
  const isVideo = state.media === 'video';

  const status =
    {
      outgoing: 'Calling…',
      incoming: state.media === 'watch' ? 'wants to watch together' : isVideo ? 'wants to video call' : 'is calling you',
      connecting: 'Connecting…',
      connected: formatDuration(elapsed),
      reconnecting: 'Reconnecting…',
      ended: endedCopy(state, partner.display_name),
      idle: '',
    }[state.phase] ?? '';

  const selfTrack = m.selfViewTrack;

  return (
    <View className="flex-1 bg-plum-800" accessibilityViewIsModal>
      {remoteVideo && (
        <Animated.View entering={FadeIn.duration(900)} className="absolute inset-0">
          <RTCView
            streamURL={(state.remoteStream as unknown as MediaStream).toURL()}
            objectFit={state.remote.screen ? 'contain' : 'cover'}
            style={{ flex: 1 }}
          />
        </Animated.View>
      )}
      {remoteVideo && state.remote.screen ? (
        <View style={{ top: insets.top + 68 }} className="absolute inset-x-0 flex-row items-center justify-center gap-2" pointerEvents="box-none">
          <View className="rounded-full bg-plum-900/70 px-3 py-1">
            <Text className="text-micro text-paper/90">{`${partner.display_name} is sharing their screen`}</Text>
          </View>
          {onFullScreen ? (
            <IconButton label="Full screen" tone="night" size="sm" onPress={onFullScreen}>
              <Maximize size={18} color="#FCFAFB" />
            </IconButton>
          ) : null}
        </View>
      ) : null}

      <View style={{ paddingTop: insets.top + 12 }} className="flex-row items-center justify-between gap-3 px-5">
        {onMinimise && (
          <IconButton label="Minimise call" tone="night" size="sm" onPress={onMinimise}>
            <ChevronDown size={22} color="#FCFAFB" />
          </IconButton>
        )}
        {remoteVideo ? (
          <View className="flex-1">
            <Display className="text-heading text-paper">{partner.display_name}</Display>
            <Text className="text-small text-paper/70">{status}</Text>
          </View>
        ) : (
          <View className="flex-1" />
        )}
        {live && state.route === 'relay' && (
          <View className="flex-row items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1">
            <Radio size={13} color="#EBE1F4" />
            <Text className="text-micro text-paper/80">Relayed</Text>
          </View>
        )}
      </View>

      {!remoteVideo ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="items-center justify-center">
            {(ringing || state.phase === 'reconnecting') && [0, 800, 1600].map((d) => <Ring key={d} delay={d} slot={partnerSlot} />)}
            <Avatar name={partner.display_name} slot={partnerSlot} size="xl" />
          </View>
          <Display light className="mt-10 text-hero text-paper">
            {partner.display_name}
          </Display>
          <Text accessibilityLiveRegion="polite" className="mt-2 text-lead text-paper/70">
            {status}
          </Text>
          {state.media === 'watch' && live && !state.remote.screen ? (
            <Text className="mt-4 max-w-xs text-center text-small text-paper/70">{`Waiting for ${partner.display_name} to share their screen from their computer.`}</Text>
          ) : null}
          {state.error && <Text className="mt-4 max-w-xs text-center text-small text-gold-200">{state.error}</Text>}
        </View>
      ) : (
        <View className="flex-1" />
      )}

      {live && state.local.camera && selfTrack && (
        <View
          style={{ bottom: controlsHeight + 12 }}
          className={cn('absolute right-4 overflow-hidden rounded-[18px] border border-white/15', state.remote.screen ? 'h-28 w-20' : 'h-44 w-32')}
        >
          <RTCView
            streamURL={new MediaStream([selfTrack as never]).toURL()}
            objectFit="cover"
            mirror={state.facing === 'user'}
            zOrder={1}
            style={{ flex: 1 }}
          />
        </View>
      )}

      <View
        onLayout={(e) => setControlsHeight(e.nativeEvent.layout.height)}
        style={{ paddingBottom: insets.bottom + 24 }}
        className="flex-row items-center justify-center gap-4 px-6 pt-6"
      >
        {state.phase === 'incoming' ? (
          <>
            <Labeled label="Decline">
              <IconButton label="Decline" tone="end" size="xl" onPress={() => void m.decline()}>
                <PhoneOff size={28} color="#fff" />
              </IconButton>
            </Labeled>
            <Labeled label="Accept">
              <IconButton label="Accept" tone="accept" size="xl" onPress={() => void m.accept()}>
                {state.media === 'watch' ? <MonitorPlay size={28} color="#fff" /> : isVideo ? <Video size={28} color="#fff" /> : <Phone size={28} color="#fff" />}
              </IconButton>
            </Labeled>
          </>
        ) : state.phase === 'ended' ? (
          <View className="h-[72px]" />
        ) : (
          <View className="items-center gap-4">
            {/* Secondary row: where the sound goes, which camera, screen. */}
            <View className="flex-row items-center justify-center gap-4">
              <IconButton
                label={routeOptions.length > 2 ? `Sound: ${ROUTES[route].label}. Choose where it plays` : route === 'SPEAKER_PHONE' ? 'Switch to earpiece' : 'Switch to speaker'}
                selected={route !== 'EARPIECE'}
                tone={route !== 'EARPIECE' ? 'nightOff' : 'night'}
                onPress={() =>
                  // Two choices toggle; a headset or Bluetooth in the mix opens the list.
                  routeOptions.length > 2
                    ? setRoutePicker((v) => !v)
                    : pickRoute(route === 'SPEAKER_PHONE' ? (routeOptions.find((r) => r !== 'SPEAKER_PHONE') ?? 'EARPIECE') : 'SPEAKER_PHONE')
                }
              >
                <RouteIcon size={20} color={route !== 'EARPIECE' ? '#241933' : '#FCFAFB'} />
              </IconButton>
              {state.local.camera && state.canSwitchCamera && (
                <IconButton
                  label={state.facing === 'user' ? 'Switch to back camera' : 'Switch to front camera'}
                  tone="night"
                  onPress={() => void m.switchCamera()}
                >
                  <SwitchCamera size={20} color="#FCFAFB" />
                </IconButton>
              )}
              {live && (
                <IconButton label="Share screen" tone="night" onPress={() => setNudge(true)}>
                  <MonitorUp size={20} color="#FCFAFB" />
                </IconButton>
              )}
              {live && canDraw && (
                <IconButton label="Draw together" tone="night" onPress={() => setDrawing(true)}>
                  <PenLine size={20} color="#FCFAFB" />
                </IconButton>
              )}
            </View>
            <View className="flex-row items-center justify-center gap-5">
              <IconButton
                label={state.local.mic ? 'Mute' : 'Unmute'}
                selected={!state.local.mic}
                tone={state.local.mic ? 'night' : 'nightOff'}
                size="lg"
                onPress={() => m.toggleMic()}
              >
                {state.local.mic ? <Mic size={24} color="#FCFAFB" /> : <MicOff size={24} color="#241933" />}
              </IconButton>
              <IconButton
                label={state.local.camera ? 'Turn camera off' : 'Turn camera on'}
                selected={!state.local.camera}
                tone={state.local.camera ? 'night' : 'nightOff'}
                size="lg"
                onPress={() => void m.toggleCamera()}
              >
                {state.local.camera ? <Video size={24} color="#FCFAFB" /> : <VideoOff size={24} color="#241933" />}
              </IconButton>
              <IconButton label="End call" tone="end" size="lg" className="w-20" onPress={() => void m.hangup()}>
                <PhoneOff size={24} color="#fff" />
              </IconButton>
            </View>
          </View>
        )}
      </View>

      {/* Draw together over the call: a strip with the call on top, the canvas in a sheet below. Audio carries on. */}
      {drawing && live ? (
        <GestureHandlerRootView style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <View className="flex-1 bg-plum-950">
            <View pointerEvents="none" className="absolute -left-20 -top-16 h-[300px] w-[300px] rounded-full bg-plum-700" />
            <View className="flex-row items-center gap-3 px-4 pb-3.5" style={{ paddingTop: insets.top + 8 }}>
              <View className={partnerSlot === 'a' ? 'h-11 w-11 items-center justify-center rounded-full bg-rose-400' : 'h-11 w-11 items-center justify-center rounded-full bg-teal-500'}>
                <Text className="font-sans-bold text-lead text-white">{partner.display_name.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View className="flex-1">
                <Text className="font-sans-bold text-lead text-paper">{partner.display_name}</Text>
                <Text className="text-micro text-plum-200">{`On a call · ${status}`}</Text>
              </View>
              <IconButton label={state.local.mic ? 'Mute' : 'Unmute'} selected={!state.local.mic} tone={state.local.mic ? 'night' : 'nightOff'} onPress={() => m.toggleMic()}>
                {state.local.mic ? <Mic size={19} color="#FCFAFB" /> : <MicOff size={19} color="#241933" />}
              </IconButton>
              <IconButton label="End call" tone="end" onPress={() => void m.hangup()}>
                <PhoneOff size={19} color="#fff" />
              </IconButton>
            </View>
            <View className="flex-1 rounded-t-[26px] bg-paper-sunken">
              <LiveBoard variant="call" onClose={() => setDrawing(false)} />
            </View>
          </View>
        </GestureHandlerRootView>
      ) : null}

      {routePicker && (
        <View className="absolute inset-x-4 bottom-56 rounded-sheet bg-paper-raised p-2" accessibilityRole="menu">
          <Text className="px-3 pb-1 pt-2 font-sans-semibold text-small text-ink-soft">Play the call through</Text>
          {routeOptions.map((r) => {
            const Icon = ROUTES[r].icon;
            return (
              <Pressable
                key={r}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: r === route }}
                onPress={() => pickRoute(r)}
                className="flex-row items-center gap-3 rounded-control px-3 py-3 active:bg-paper-sunken"
              >
                <Icon size={20} color="#241933" />
                <Text className="flex-1">{ROUTES[r].label}</Text>
                {r === route ? <Check size={18} color="#C41D55" /> : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {nudge && (
        <View className="absolute inset-x-4 bottom-56 rounded-sheet bg-paper-raised p-5" accessibilityRole="alert">
          <Display className="text-heading">Share from your computer</Display>
          <Text className="mt-1 text-small text-ink-soft">
            Screen sharing works best from the Us web app on a laptop or desktop. Open it there and join the call.
          </Text>
          <Button variant="secondary" size="sm" className="mt-4 self-start" onPress={() => setNudge(false)}>
            Got it
          </Button>
        </View>
      )}
    </View>
  );
}

/** One ring of the breathing pulse around the partner's initial. */
function Ring({ delay, slot }: { delay: number; slot: 'a' | 'b' }) {
  const reduce = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: Easing.bezier(0.22, 1, 0.36, 1) }), -1));
  }, [delay, reduce, t]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.9 + t.value }],
    opacity: reduce ? 0.25 : 0.55 * (1 - t.value),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={style}
      className={`absolute h-32 w-32 rounded-full ${slot === 'a' ? 'bg-rose-400' : 'bg-teal-400'}`}
    />
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="items-center gap-2 px-6">
      {children}
      <Text className="text-small text-paper/70" importantForAccessibility="no">
        {label}
      </Text>
    </View>
  );
}

function endedCopy(state: CallState, name: string) {
  const outgoing = state.direction === 'outgoing';
  switch (state.endReason) {
    case 'declined':
      return outgoing ? `${name} can’t talk right now` : 'Declined';
    case 'missed':
      return outgoing ? 'No answer' : 'Missed call';
    case 'answered-elsewhere':
      return 'Answered on another device';
    case 'failed':
    case 'media-denied':
      return 'Call couldn’t continue';
    default:
      return 'Call ended';
  }
}
