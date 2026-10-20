import { formatDuration, type CallState } from '@us/shared';
import { useCallManager, useCallState, useCouple } from '@us/shared/react';
import { Ear, Mic, MicOff, MonitorUp, Phone, PhoneOff, Radio, SwitchCamera, Video, VideoOff, Volume2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Modal, View } from 'react-native';
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
import { setSpeaker, startCallAudio, stopCallAudio } from '@/lib/audio-route';
import { Avatar } from '../ui/avatar';
import { Button, IconButton } from '../ui/button';
import { Display, Text } from '../ui/text';

/** Full-screen call surface, mounted once in the app layout. */
export function CallScreen() {
  const state = useCallState();
  useCallAudio(state);
  return (
    <Modal visible={state.phase !== 'idle'} animationType="fade" presentationStyle="fullScreen" statusBarTranslucent>
      {state.phase !== 'idle' && <Surface state={state} />}
    </Modal>
  );
}

/** Hand the audio session to the call while it's live; release it after. */
function useCallAudio(state: CallState) {
  const started = useRef(false);
  const active = state.phase === 'connecting' || state.phase === 'connected' || state.phase === 'reconnecting';
  useEffect(() => {
    if (active && !started.current) {
      started.current = true;
      startCallAudio(state.media);
    } else if (!active && started.current) {
      started.current = false;
      stopCallAudio();
    }
  }, [active, state.media]);
  useEffect(
    () => () => {
      if (started.current) stopCallAudio();
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

function Surface({ state }: { state: CallState }) {
  const m = useCallManager();
  const { partner, partnerSlot } = useCouple();
  const insets = useSafeAreaInsets();
  const elapsed = useElapsed(state.connectedAt);
  const [nudge, setNudge] = useState(false);
  // Matches InCallManager's automatic default until the person chooses.
  const [speaker, setSpeakerOn] = useState(state.media === 'video');

  const live = state.phase === 'connected' || state.phase === 'reconnecting';
  const ringing = state.phase === 'outgoing' || state.phase === 'incoming' || state.phase === 'connecting';
  const remoteVideo = live && state.remote.camera && state.remoteStream;
  const isVideo = state.media === 'video';

  const status =
    {
      outgoing: 'Calling…',
      incoming: isVideo ? 'wants to video call' : 'is calling you',
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

      <View style={{ paddingTop: insets.top + 12 }} className="flex-row items-center justify-between px-5">
        {remoteVideo ? (
          <View>
            <Display className="text-heading text-paper">{partner.display_name}</Display>
            <Text className="text-small text-paper/70">{status}</Text>
          </View>
        ) : (
          <View />
        )}
        {live && state.route === 'relay' && (
          <View className="flex-row items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1">
            <Radio size={13} color="#E7DEE8" />
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
          {state.error && <Text className="mt-4 max-w-xs text-center text-small text-gold-200">{state.error}</Text>}
        </View>
      ) : (
        <View className="flex-1" />
      )}

      {live && state.local.camera && selfTrack && (
        <View className="absolute bottom-52 right-4 h-44 w-32 overflow-hidden rounded-[18px] border border-white/15">
          <RTCView
            streamURL={new MediaStream([selfTrack as never]).toURL()}
            objectFit="cover"
            mirror={state.facing === 'user'}
            zOrder={1}
            style={{ flex: 1 }}
          />
        </View>
      )}

      <View style={{ paddingBottom: insets.bottom + 24 }} className="flex-row items-center justify-center gap-4 px-6 pt-6">
        {state.phase === 'incoming' ? (
          <>
            <Labeled label="Decline">
              <IconButton label="Decline" tone="end" size="xl" onPress={() => void m.decline()}>
                <PhoneOff size={28} color="#fff" />
              </IconButton>
            </Labeled>
            <Labeled label="Accept">
              <IconButton label="Accept" tone="accept" size="xl" onPress={() => void m.accept()}>
                {isVideo ? <Video size={28} color="#fff" /> : <Phone size={28} color="#fff" />}
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
                label={speaker ? 'Switch to earpiece' : 'Switch to speaker'}
                selected={speaker}
                tone={speaker ? 'nightOff' : 'night'}
                onPress={() => {
                  setSpeaker(!speaker);
                  setSpeakerOn(!speaker);
                }}
              >
                {speaker ? <Volume2 size={20} color="#2A1F2D" /> : <Ear size={20} color="#FAF6F1" />}
              </IconButton>
              {state.local.camera && state.canSwitchCamera && (
                <IconButton
                  label={state.facing === 'user' ? 'Switch to back camera' : 'Switch to front camera'}
                  tone="night"
                  onPress={() => void m.switchCamera()}
                >
                  <SwitchCamera size={20} color="#FAF6F1" />
                </IconButton>
              )}
              {live && (
                <IconButton label="Share screen" tone="night" onPress={() => setNudge(true)}>
                  <MonitorUp size={20} color="#FAF6F1" />
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
                {state.local.mic ? <Mic size={24} color="#FAF6F1" /> : <MicOff size={24} color="#2A1F2D" />}
              </IconButton>
              <IconButton
                label={state.local.camera ? 'Turn camera off' : 'Turn camera on'}
                selected={!state.local.camera}
                tone={state.local.camera ? 'night' : 'nightOff'}
                size="lg"
                onPress={() => void m.toggleCamera()}
              >
                {state.local.camera ? <Video size={24} color="#FAF6F1" /> : <VideoOff size={24} color="#2A1F2D" />}
              </IconButton>
              <IconButton label="End call" tone="end" size="lg" className="w-20" onPress={() => void m.hangup()}>
                <PhoneOff size={24} color="#fff" />
              </IconButton>
            </View>
          </View>
        )}
      </View>

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
