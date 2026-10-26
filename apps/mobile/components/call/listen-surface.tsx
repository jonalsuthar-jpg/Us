import { formatDuration, type CallState } from '@us/shared';
import { useCallManager, useCouple } from '@us/shared/react';
import { ChevronDown, Headphones, Mic, MicOff, Pause, PhoneOff, Play, Radio } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Record, SoundBars } from '../connect/vinyl';
import { Avatar } from '../ui/avatar';
import { IconButton } from '../ui/button';
import { cn } from '../ui/cn';
import { Display, Text } from '../ui/text';

/**
 * Listen together on a phone: the listener's side. The music is shared from
 * my partner's computer (phones can't capture another app's sound), so here
 * it's play/pause for me, the mic, and leave. Mics start muted.
 */
export function ListenSurface({ state, onMinimise }: { state: CallState; onMinimise?: () => void }) {
  const m = useCallManager();
  const { partner, partnerSlot } = useCouple();
  const insets = useSafeAreaInsets();
  const elapsed = useElapsed(state.connectedAt);
  const live = state.phase === 'connected' || state.phase === 'reconnecting';
  const theyShare = state.remote.sound === true;
  const playing = theyShare && !state.remote.soundPaused && state.hearing;
  const name = partner.display_name;

  const status = (() => {
    switch (state.phase) {
      case 'outgoing':
        return `Ringing ${name}…`;
      case 'incoming':
        return 'wants to listen together';
      case 'connecting':
        return 'Connecting…';
      case 'reconnecting':
        return 'Reconnecting…';
      case 'ended':
        return state.endReason === 'declined' && state.direction === 'outgoing'
          ? `${name} can’t listen right now`
          : state.endReason === 'missed'
            ? state.direction === 'outgoing'
              ? 'No answer'
              : 'Missed'
            : 'Ended';
      default:
        if (!theyShare) return `Waiting for ${name} to play something`;
        if (state.remote.soundPaused) return `Paused by ${name}`;
        return state.hearing ? `From ${name}’s computer` : `Paused for you. ${name} keeps playing.`;
    }
  })();

  return (
    <View className="flex-1 overflow-hidden bg-plum-900" accessibilityViewIsModal>
      <View pointerEvents="none" className="absolute -left-32 -top-36 h-[420px] w-[420px] rounded-full bg-plum-700/70" />

      <View style={{ paddingTop: insets.top + 12 }} className="flex-row items-center gap-3 px-5">
        {onMinimise ? (
          <IconButton label="Minimise" tone="night" size="sm" onPress={onMinimise}>
            <ChevronDown size={22} color="#FCFAFB" />
          </IconButton>
        ) : null}
        <View className="flex-row items-center gap-2 rounded-full bg-rose-400/20 px-3 py-1.5">
          <View className="h-2 w-2 rounded-full bg-rose-400" />
          <Text className="font-sans-semibold text-micro text-rose-200">{`Listening with ${name}${live ? ` · ${formatDuration(elapsed)}` : ''}`}</Text>
        </View>
        <View className="flex-1" />
        {live && state.route === 'relay' ? (
          <View className="flex-row items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1">
            <Radio size={13} color="#EBE1F4" />
            <Text className="text-micro text-paper/80">Relayed</Text>
          </View>
        ) : null}
      </View>

      <View className="flex-1 items-center justify-center px-6">
        {live ? <Record playing={playing} size={260} /> : <Avatar name={name} slot={partnerSlot} size="xl" />}
      </View>

      <View className="items-center gap-2 px-6">
        {live ? (
          <>
            <Text className="font-sans-semibold text-micro uppercase tracking-[1px] text-plum-300">Now playing</Text>
            <Display className="text-center text-title text-paper">{theyShare ? (state.remote.nowPlaying ?? `${name}’s music`) : 'Nothing yet'}</Display>
          </>
        ) : (
          <Display className="text-center text-title text-paper">{name}</Display>
        )}
        <Text accessibilityLiveRegion="polite" className={cn('text-center text-small', theyShare && state.remote.soundPaused ? 'text-gold-200' : 'text-plum-200')}>
          {status}
        </Text>
        {state.phase === 'incoming' ? (
          <Text className="max-w-xs text-center text-micro text-plum-300">Your mic starts muted. Tap it any time to talk over the music.</Text>
        ) : null}
        {live && !theyShare ? (
          <Text className="max-w-xs text-center text-micro text-plum-300">They pick a tab or their screen on their computer, and you hear it here.</Text>
        ) : null}
        {live ? <SoundBars playing={playing} count={9} height={34} className="mt-3" /> : null}
        {state.error ? <Text className="mt-2 max-w-xs text-center text-small text-gold-200">{state.error}</Text> : null}
      </View>

      <View style={{ paddingBottom: insets.bottom + 28 }} className="flex-row items-center justify-center gap-6 px-6 pt-8">
        {state.phase === 'incoming' ? (
          <>
            <IconButton label="Decline" tone="end" size="xl" onPress={() => void m.decline()}>
              <PhoneOff size={28} color="#fff" />
            </IconButton>
            <IconButton label="Listen together" tone="accept" size="xl" onPress={() => void m.accept()}>
              <Headphones size={28} color="#fff" />
            </IconButton>
          </>
        ) : state.phase === 'ended' ? (
          <View className="h-[76px]" />
        ) : (
          <>
            <IconButton
              label={state.local.mic ? 'Mute your mic' : `Talk to ${name}`}
              selected={state.local.mic}
              tone={state.local.mic ? 'accept' : 'night'}
              size="lg"
              onPress={() => m.toggleMic()}
            >
              {state.local.mic ? <Mic size={24} color="#fff" /> : <MicOff size={24} color="#FCFAFB" />}
            </IconButton>
            {live && theyShare ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={state.hearing ? 'Pause for me' : 'Listen again'}
                onPress={() => m.setHearing(!state.hearing)}
                className="h-[76px] w-[76px] items-center justify-center rounded-full bg-paper active:opacity-80"
              >
                {state.hearing ? <Pause size={30} color="#241933" fill="#241933" /> : <Play size={30} color="#241933" fill="#241933" style={{ marginLeft: 4 }} />}
              </Pressable>
            ) : null}
            <IconButton label={state.phase === 'outgoing' ? 'Cancel' : 'Leave'} tone="end" size="lg" onPress={() => void m.hangup()}>
              <PhoneOff size={24} color="#fff" />
            </IconButton>
          </>
        )}
      </View>
    </View>
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
