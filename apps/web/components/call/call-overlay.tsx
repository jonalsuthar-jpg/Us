'use client';

import { formatDuration, type CallState } from '@us/shared';
import { useCallManager, useCallState, useCouple } from '@us/shared/react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  Phone,
  PhoneOff,
  Radio,
  Video,
  VideoOff,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Dialog } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/cn';
import { useElapsed } from '@/lib/hooks';
import { StreamAudio, StreamVideo } from './media';

/**
 * Full-screen call surface, mounted once for the whole app. Plum, quiet, and
 * built around one moment: while ringing, the partner's initial breathes in
 * their colour; on connect, their video rises in to replace it.
 */
export function CallOverlay() {
  const state = useCallState();
  const visible = state.phase !== 'idle';
  return <AnimatePresence>{visible && <CallScreen key={state.call?.id ?? 'pending'} state={state} />}</AnimatePresence>;
}

function CallScreen({ state }: { state: CallState }) {
  const m = useCallManager();
  const { partner, partnerSlot, me } = useCouple();
  const [shareNudge, setShareNudge] = useState(false);
  const elapsed = useElapsed(state.connectedAt);
  const primary = useRef<HTMLButtonElement>(null);

  const live = state.phase === 'connected' || state.phase === 'reconnecting';
  const ringing = state.phase === 'outgoing' || state.phase === 'incoming' || state.phase === 'connecting';
  const remoteVideo = live && (state.remote.camera || state.remote.screen);
  const isVideo = state.media === 'video';

  useEffect(() => primary.current?.focus(), [state.phase]);

  const statusLine = {
    outgoing: 'Calling…',
    incoming: isVideo ? 'wants to video call' : 'is calling you',
    connecting: 'Connecting…',
    connected: formatDuration(elapsed),
    reconnecting: 'Reconnecting…',
    ended: endedCopy(state, partner.display_name, elapsed),
    idle: '',
  }[state.phase];

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Call with ${partner.display_name}`}
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-plum-800 text-paper"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
    >
      <StreamAudio stream={state.remoteStream} revision={state.revision} />

      {/* While ringing on a video call, my own camera glows faintly behind the veil. */}
      {ringing && isVideo && state.localStream && (
        <div className="absolute inset-0 opacity-25 blur-2xl" aria-hidden>
          <StreamVideo stream={state.localStream} revision={state.revision} mirrored />
        </div>
      )}

      {/* Remote video */}
      <AnimatePresence>
        {remoteVideo && (
          <motion.div
            className="absolute inset-0 bg-plum-950"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          >
            <StreamVideo
              stream={state.remoteStream}
              revision={state.revision}
              fit={state.remote.screen ? 'contain' : 'cover'}
            />
            {state.remote.screen && (
              <p className="absolute left-1/2 top-20 -translate-x-1/2 rounded-full bg-plum-900/70 px-3 py-1 text-micro text-paper/90 backdrop-blur">
                {partner.display_name} is sharing their screen
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between gap-4 bg-gradient-to-b from-plum-900/70 to-transparent px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        {remoteVideo ? (
          <div>
            <p className="font-display text-heading">{partner.display_name}</p>
            <p className="text-small tabular-nums text-paper/70" aria-live="polite">
              {statusLine}
            </p>
          </div>
        ) : (
          <span />
        )}
        {live && state.route === 'relay' && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-micro text-paper/80"
            title="Connected through a relay server because a direct path wasn't available."
          >
            <Radio className="h-3.5 w-3.5" aria-hidden /> Relayed
          </span>
        )}
      </header>

      {/* Centre: the breathing initial (ringing, voice calls, camera off) */}
      {!remoteVideo && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="relative flex items-center justify-center">
            {(ringing || state.phase === 'reconnecting') && (
              <>
                {[0, 0.8, 1.6].map((delay) => (
                  <span
                    key={delay}
                    aria-hidden
                    className={cn(
                      'absolute h-32 w-32 animate-breathe rounded-full',
                      partnerSlot === 'a' ? 'bg-rose-400/50' : 'bg-teal-400/50',
                    )}
                    style={{ animationDelay: `${delay}s` }}
                  />
                ))}
              </>
            )}
            <Avatar name={partner.display_name} slot={partnerSlot} size="xl" className="[&>span]:ring-offset-plum-800" />
          </div>
          <h2 className="mt-10 font-display text-hero font-light">{partner.display_name}</h2>
          <p className="mt-2 text-lead tabular-nums text-paper/70" aria-live="polite">
            {statusLine}
          </p>
          {state.error && <p className="mt-4 max-w-sm text-small text-gold-200">{state.error}</p>}
        </div>
      )}
      {remoteVideo && <div className="flex-1" />}

      {/* Self view */}
      {live && (state.local.camera || state.local.screen) && (
        <div className="absolute bottom-32 right-4 z-20 aspect-[3/4] w-28 overflow-hidden rounded-[18px] border border-white/15 bg-plum-900 shadow-2xl sm:bottom-36 sm:right-8 sm:w-40">
          <SelfView state={state} />
          <span className="sr-only">Your camera</span>
        </div>
      )}

      {/* Controls */}
      <footer className="relative z-10 flex items-center justify-center gap-4 bg-gradient-to-t from-plum-900/80 to-transparent px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-10 sm:gap-5">
        {state.phase === 'incoming' ? (
          <>
            <ControlStack label="Decline">
              <IconButton label="Decline" tone="end" size="xl" onClick={() => void m.decline()}>
                <PhoneOff className="h-7 w-7" />
              </IconButton>
            </ControlStack>
            <ControlStack label="Accept">
              <IconButton ref={primary} label="Accept" tone="accept" size="xl" onClick={() => void m.accept()}>
                {isVideo ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
              </IconButton>
            </ControlStack>
          </>
        ) : state.phase === 'ended' ? (
          <p className="h-[72px] text-small text-paper/60">
            {me.display_name} &amp; {partner.display_name}
          </p>
        ) : (
          <>
            <IconButton
              label={state.local.mic ? 'Mute' : 'Unmute'}
              pressed={!state.local.mic}
              tone={state.local.mic ? 'night' : 'nightOff'}
              size="lg"
              onClick={() => m.toggleMic()}
            >
              {state.local.mic ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
            </IconButton>
            <IconButton
              label={state.local.camera ? 'Turn camera off' : 'Turn camera on'}
              pressed={!state.local.camera}
              tone={state.local.camera ? 'night' : 'nightOff'}
              size="lg"
              onClick={() => void m.toggleCamera()}
            >
              {state.local.camera ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
            </IconButton>
            {live && (
              <IconButton
                label={state.local.screen ? 'Stop sharing' : 'Share your screen'}
                pressed={state.local.screen}
                tone={state.local.screen ? 'nightOff' : 'night'}
                size="lg"
                onClick={() =>
                  m.canScreenShare
                    ? void (state.local.screen ? m.stopScreenShare() : m.startScreenShare())
                    : setShareNudge(true)
                }
              >
                {state.local.screen ? <MonitorX className="h-6 w-6" /> : <MonitorUp className="h-6 w-6" />}
              </IconButton>
            )}
            <IconButton ref={primary} label="End call" tone="end" size="lg" className="w-20" onClick={() => void m.hangup()}>
              <PhoneOff className="h-6 w-6" />
            </IconButton>
          </>
        )}
      </footer>

      <Dialog
        open={shareNudge}
        onOpenChange={setShareNudge}
        title="Share from your computer"
        description="Screen sharing works best from the Us web app on a laptop or desktop. Open it there and join the call — you can switch devices any time."
      />
    </motion.div>
  );
}

function SelfView({ state }: { state: CallState }) {
  const m = useCallManager();
  const [stream, setStream] = useState<MediaStream | null>(null);
  useEffect(() => {
    const track = m.selfViewTrack;
    setStream(track ? new MediaStream([track]) : null);
  }, [m, state.revision, state.local.camera, state.local.screen]);
  return <StreamVideo stream={stream} revision={state.revision} mirrored={!state.local.screen} />;
}

function ControlStack({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6">
      {children}
      <span className="text-small text-paper/70" aria-hidden>
        {label}
      </span>
    </div>
  );
}

function endedCopy(state: CallState, name: string, elapsed: number): string {
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
      return elapsed ? `Call ended · ${formatDuration(elapsed)}` : 'Call ended';
  }
}
