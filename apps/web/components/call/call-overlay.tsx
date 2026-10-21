'use client';

import { formatDuration, type CallState, type ScreenStats, type ShareMode } from '@us/shared';
import { useCallManager, useCallState, useCouple } from '@us/shared/react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  Maximize,
  Mic,
  MicOff,
  Minimize,
  MonitorUp,
  MonitorX,
  Phone,
  PhoneOff,
  Radio,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Dialog } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/cn';
import { useElapsed } from '@/lib/hooks';
import { StreamAudio, StreamVideo, useAudioOutputs } from './media';

/**
 * Full-screen call surface, mounted once for the whole app. Plum, quiet, and
 * built around one moment: while ringing, the partner's initial breathes in
 * their colour; on connect, their video rises in to replace it.
 */
export function CallOverlay() {
  const state = useCallState();
  const visible = state.phase !== 'idle';
  const [minimised, setMinimised] = useState(false);
  const canMinimise = visible && state.phase !== 'incoming' && state.phase !== 'ended';
  // A new ring or the end of the call always brings the full screen back.
  useEffect(() => {
    if (!canMinimise) setMinimised(false);
  }, [canMinimise]);
  return (
    <>
      <AnimatePresence>
        {visible && (
          <CallScreen
            key={state.call?.id ?? 'pending'}
            state={state}
            minimised={minimised}
            onMinimise={canMinimise ? () => setMinimised(true) : undefined}
          />
        )}
      </AnimatePresence>
      {minimised && <CallBar state={state} onExpand={() => setMinimised(false)} />}
    </>
  );
}

/** The minimised call, floating over the app: who, how long, mute and hang up. */
function CallBar({ state, onExpand }: { state: CallState; onExpand: () => void }) {
  const m = useCallManager();
  const { partner } = useCouple();
  const elapsed = useElapsed(state.connectedAt);
  const status =
    state.phase === 'connected' ? formatDuration(elapsed) : state.phase === 'reconnecting' ? 'Reconnecting…' : 'Calling…';
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-full bg-sage-600 py-1.5 pl-2 pr-1.5 text-white shadow-[0_12px_32px_-12px_rgba(0,0,0,0.45)]"
    >
      <button
        type="button"
        onClick={onExpand}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-full py-0.5 pl-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-white" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate text-small font-semibold">{partner.display_name}</span>
          <span className="block text-micro tabular-nums text-white/80" aria-live="polite">
            {status} · back to call
          </span>
        </span>
      </button>
      <IconButton
        label={state.local.mic ? 'Mute' : 'Unmute'}
        pressed={!state.local.mic}
        tone={state.local.mic ? 'night' : 'nightOff'}
        size="sm"
        onClick={() => m.toggleMic()}
      >
        {state.local.mic ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
      </IconButton>
      <IconButton label="End call" tone="end" size="sm" onClick={() => void m.hangup()}>
        <PhoneOff className="h-4 w-4" />
      </IconButton>
    </motion.div>
  );
}

function CallScreen({ state, minimised, onMinimise }: { state: CallState; minimised: boolean; onMinimise?: () => void }) {
  const m = useCallManager();
  const { partner, partnerSlot, me } = useCouple();
  const [shareNudge, setShareNudge] = useState(false);
  const [outputPicker, setOutputPicker] = useState(false);
  // undefined = the browser's default output.
  const [sinkId, setSinkId] = useState<string | undefined>(undefined);
  const elapsed = useElapsed(state.connectedAt);
  const primary = useRef<HTMLButtonElement>(null);

  const live = state.phase === 'connected' || state.phase === 'reconnecting';
  const ringing = state.phase === 'outgoing' || state.phase === 'incoming' || state.phase === 'connecting';
  const remoteVideo = live && (state.remote.camera || state.remote.screen);
  const watchingShare = !!remoteVideo && state.remote.screen;

  // Full screen for watching their shared screen: just the video, nothing over it.
  const root = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => setFull(!!root.current && document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  useEffect(() => {
    if (!watchingShare && root.current && document.fullscreenElement === root.current) void document.exitFullscreen().catch(() => {});
  }, [watchingShare]);
  // What my own share is going out at, refreshed while I share.
  const [shareStats, setShareStats] = useState<ScreenStats | null>(null);
  useEffect(() => {
    if (!state.local.screen) return setShareStats(null);
    let stop = false;
    const tick = () => void m.screenStats().then((s) => !stop && setShareStats(s));
    tick();
    const t = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [state.local.screen, m]);

  const toggleFull = () => {
    if (full) void document.exitFullscreen().catch(() => {});
    else void root.current?.requestFullscreen().catch(() => {});
  };
  const isVideo = state.media === 'video';
  const outputs = useAudioOutputs(state.phase !== 'idle' && state.phase !== 'ended');
  const currentOutput = sinkId ?? outputs.find((o) => o.deviceId === 'default')?.deviceId ?? outputs[0]?.deviceId;

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
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={`Call with ${partner.display_name}`}
      // Minimised: stays mounted (its <audio> keeps the call playing) but out of the way.
      aria-hidden={minimised || undefined}
      className={cn('fixed inset-0 z-50 flex-col overflow-hidden bg-plum-800 text-paper', minimised ? 'hidden' : 'flex')}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
    >
      <StreamAudio stream={state.remoteStream} revision={state.revision} sinkId={sinkId} />

      {/* While ringing on a video call, my own camera glows faintly behind the veil. */}
      {ringing && isVideo && state.localStream && (
        <div className="absolute inset-0 opacity-25 blur-2xl" aria-hidden>
          <StreamVideo stream={state.localStream} revision={state.revision} mirrored={state.facing === 'user'} />
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
            <div className="h-full w-full" onDoubleClick={watchingShare ? toggleFull : undefined}>
              <StreamVideo stream={state.remoteStream} revision={state.revision} fit={state.remote.screen ? 'contain' : 'cover'} />
            </div>
            {full && (
              <div className="absolute right-4 top-4 opacity-30 transition-opacity hover:opacity-100 focus-within:opacity-100">
                <IconButton label="Exit full screen" tone="night" size="sm" onClick={toggleFull}>
                  <Minimize className="h-4 w-4" />
                </IconButton>
              </div>
            )}
            {state.remote.screen && !full && (
              <p className="absolute left-1/2 top-20 -translate-x-1/2 rounded-full bg-plum-900/70 px-3 py-1 text-micro text-paper/90 backdrop-blur">
                {partner.display_name} is sharing their screen
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar */}
      <header
        className={cn(
          'relative z-10 flex items-center justify-between gap-4 bg-gradient-to-b from-plum-900/70 to-transparent px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 [@media(max-height:500px)]:pb-2 [@media(max-height:500px)]:pt-3',
          full && 'hidden',
        )}
      >
        {onMinimise && (
          <IconButton label="Minimise call" tone="night" size="sm" onClick={onMinimise}>
            <ChevronDown className="h-5 w-5" />
          </IconButton>
        )}
        {remoteVideo ? (
          <div className="flex-1">
            <p className="font-display text-heading">{partner.display_name}</p>
            <p className="text-small tabular-nums text-paper/70" aria-live="polite">
              {statusLine}
            </p>
          </div>
        ) : (
          <span className="flex-1" />
        )}
        <div className="flex items-center gap-2">
          {watchingShare && (
            <IconButton label="Full screen" tone="night" size="sm" onClick={toggleFull}>
              <Maximize className="h-4 w-4" />
            </IconButton>
          )}
          {live && state.route === 'relay' && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-micro text-paper/80"
              title="Connected through a relay server because a direct path wasn't available."
            >
              <Radio className="h-3.5 w-3.5" aria-hidden /> Relayed
            </span>
          )}
          {outputs.length > 1 && state.phase !== 'ended' && (
            <IconButton label="Choose speaker or headphones" tone="night" size="sm" onClick={() => setOutputPicker(true)}>
              <Volume2 className="h-4 w-4" />
            </IconButton>
          )}
        </div>
      </header>

      {/* Centre: the breathing initial (ringing, voice calls, camera off) */}
      {!remoteVideo && (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="relative flex items-center justify-center [@media(max-height:500px)]:scale-75">
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
          <h2 className="mt-10 font-display text-hero font-light [@media(max-height:500px)]:mt-2 [@media(max-height:500px)]:text-title">{partner.display_name}</h2>
          <p className="mt-2 text-lead tabular-nums text-paper/70" aria-live="polite">
            {statusLine}
          </p>
          {state.error && <p className="mt-4 max-w-sm text-small text-gold-200">{state.error}</p>}
        </div>
      )}
      {remoteVideo && <div className="flex-1" />}

      {/* Self view */}
      {live && !full && (state.local.camera || state.local.screen) && (
        <div
          className={cn(
            'absolute bottom-32 right-4 z-20 aspect-[3/4] overflow-hidden rounded-[18px] border border-white/15 bg-plum-900 shadow-2xl sm:bottom-36 sm:right-8 [@media(max-height:500px)]:bottom-24',
            // Smaller while their screen is up, so it covers less of it.
            watchingShare ? 'w-20 sm:w-28' : 'w-28 sm:w-40',
          )}
        >
          <SelfView state={state} />
          <span className="sr-only">Your camera</span>
        </div>
      )}

      {/* While I share: how it trades quality, and what it's going out at */}
      {live && state.local.screen && !full && (
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 pb-1 [@media(max-height:500px)]:pb-0">
          <div role="radiogroup" aria-label="Screen share quality" className="flex rounded-full bg-plum-900/70 p-0.5 backdrop-blur">
            {(
              [
                ['smooth', 'Smooth', 'Fluid motion, for videos'],
                ['sharp', 'Sharp', 'Crisp text, for documents'],
              ] as [ShareMode, string, string][]
            ).map(([mode, label, hint]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={state.shareMode === mode}
                title={hint}
                onClick={() => void m.setShareMode(mode)}
                className={cn(
                  'rounded-full px-3 py-1 text-micro font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                  state.shareMode === mode ? 'bg-paper text-plum-900' : 'text-paper/80 hover:text-paper',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {shareStats?.height ? (
            <p className="text-micro tabular-nums text-paper/70" aria-live="polite">
              {`${shareStats.height}p · ${Math.round(shareStats.fps ?? 0)} fps`}
              {shareStats.limitedByNetwork ? <span className="text-gold-200"> · Limited by connection</span> : null}
            </p>
          ) : null}
        </div>
      )}

      {/* Controls */}
      <footer
        className={cn(
          // Five buttons fit a 360px phone at this spacing; wraps rather than overflowing on anything narrower.
          'relative z-10 flex flex-wrap items-center justify-center gap-2 bg-gradient-to-t from-plum-900/80 to-transparent px-3 pb-[max(2rem,env(safe-area-inset-bottom))] pt-10 sm:gap-5 sm:px-6 [@media(max-height:500px)]:pb-3 [@media(max-height:500px)]:pt-3',
          full && 'hidden',
        )}
      >
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
            {state.local.camera && state.canSwitchCamera && !state.local.screen && (
              <IconButton
                label={state.facing === 'user' ? 'Switch to back camera' : 'Switch camera'}
                tone="night"
                size="lg"
                onClick={() => void m.switchCamera()}
              >
                <SwitchCamera className="h-6 w-6" />
              </IconButton>
            )}
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

      <Dialog open={outputPicker} onOpenChange={setOutputPicker} title="Play the call through">
        <ul className="space-y-1" role="radiogroup" aria-label="Audio output">
          {outputs.map((o) => {
            const selected = o.deviceId === currentOutput;
            return (
              <li key={o.deviceId}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    setSinkId(o.deviceId);
                    setOutputPicker(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-ink transition-colors hover:bg-paper-sunken',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                    selected && 'bg-paper-sunken font-medium',
                  )}
                >
                  <span className={cn('h-2 w-2 rounded-full', selected ? 'bg-rose-600' : 'bg-plum-200')} aria-hidden />
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      </Dialog>

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
  return <StreamVideo stream={stream} revision={state.revision} mirrored={!state.local.screen && state.facing === 'user'} />;
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
