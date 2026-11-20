'use client';

import { formatDuration, isWideVideo, selfViewAspect, type CallState, type ScreenStats, type ShareMode, type VideoSize } from '@us/shared';
import { BUBBLE_KEY, readBubbleSpot, setCallBubbleHidden, useCallBubbleHidden, useCallCards, useCallManager, useCallState, useCallVoiceVolume, useCouple, useFeature, onMinimiseCallScreen, type BubbleSpot } from '@us/shared/react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  EyeOff,
  Layers,
  Maximize,
  Mic,
  MicOff,
  Minimize,
  MonitorUp,
  MonitorX,
  Phone,
  PenLine,
  PhoneOff,
  Radio,
  SwitchCamera,
  Video,
  VideoOff,
  SlidersHorizontal,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Dialog } from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/cn';
import { useElapsed } from '@/lib/hooks';
import { LiveCanvas } from '@/components/draw/live-canvas';
import { CallCards } from './call-cards';
import { StreamAudio, StreamVideo, useAudioDevices, type AudioDevice } from './media';

/**
 * Full-screen call surface, mounted once for the whole app. Plum, quiet, and
 * built around one moment: while ringing, the partner's initial breathes in
 * their colour; on connect, their video rises in to replace it.
 */
export function CallOverlay() {
  const state = useCallState();
  const visible = state.phase !== 'idle';
  const [minimised, setMinimised] = useState(false);
  // A call started from Our House stays a bar, so the house stays on screen.
  useEffect(() => onMinimiseCallScreen(() => setMinimised(true)), []);
  const canMinimise = visible && state.phase !== 'incoming' && state.phase !== 'ended';
  // A new ring or the end of the call always brings the full screen back.
  useEffect(() => {
    if (!canMinimise) {
      setMinimised(false);
      setCallBubbleHidden(false);
    }
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
      {minimised && <CallBubble state={state} onExpand={() => setMinimised(false)} />}
    </>
  );
}

/**
 * The minimised call: a bubble with their face, ringed while they talk, and
 * the time. Drag it anywhere (it settles on the nearest side and stays there
 * next time); click it for back to the call, mute, end, or put it away.
 */
function CallBubble({ state, onExpand }: { state: CallState; onExpand: () => void }) {
  const m = useCallManager();
  const { partner, partnerSlot } = useCouple();
  const hidden = useCallBubbleHidden();
  const [open, setOpen] = useState(false);
  const elapsed = useElapsed(state.connectedAt);
  const status = state.phase === 'connected' ? formatDuration(elapsed) : state.phase === 'reconnecting' ? 'Reconnecting…' : 'Calling…';
  const SIZE = 60;
  const [spot, setSpot] = useState<BubbleSpot>({ side: 'right', y: 0.55 });
  useEffect(() => {
    try {
      setSpot(readBubbleSpot(localStorage.getItem(BUBBLE_KEY)));
    } catch {
      // Private window: the default spot.
    }
  }, []);
  // While dragging: where it is now, in pixels.
  const [dragAt, setDragAt] = useState<{ x: number; y: number } | null>(null);
  const press = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const [talk, setTalk] = useState(0);
  useEffect(() => {
    if (state.phase !== 'connected') return;
    const t = setInterval(() => void m.audioLevels().then((l) => setTalk(Math.min(1, (l.them ?? 0) * 6))), 300);
    return () => clearInterval(t);
  }, [state.phase, m]);

  if (hidden) return null;
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  const vw = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const top = 12 + (vh - SIZE - 60) * spot.y;
  const pos = dragAt ? { left: dragAt.x, top: dragAt.y } : spot.side === 'left' ? { left: 12, top } : { left: vw - SIZE - 12, top };
  const left = (dragAt?.x ?? pos.left) + SIZE / 2 < vw / 2;
  return (
    <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="fixed z-50 flex flex-col items-center" style={{ ...pos, width: SIZE, transition: dragAt ? 'none' : 'left 0.2s, top 0.2s' }}>
      <button
        type="button"
        aria-label={`Call with ${partner.display_name}, ${status}. Click for the call's controls`}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          press.current = { x: e.clientX, y: e.clientY, ox: pos.left, oy: pos.top, moved: false };
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (!p) return;
          if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) p.moved = true;
          if (p.moved) setDragAt({ x: Math.min(vw - SIZE, Math.max(0, p.ox + e.clientX - p.x)), y: Math.min(vh - SIZE, Math.max(0, p.oy + e.clientY - p.y)) });
        }}
        onPointerUp={() => {
          const p = press.current;
          press.current = null;
          if (!p?.moved || !dragAt) return void setOpen((o) => !o);
          const next: BubbleSpot = { side: dragAt.x + SIZE / 2 < vw / 2 ? 'left' : 'right', y: Math.min(1, Math.max(0, (dragAt.y - 12) / Math.max(1, vh - SIZE - 60))) };
          setSpot(next);
          setDragAt(null);
          try {
            localStorage.setItem(BUBBLE_KEY, JSON.stringify(next));
          } catch {
            // As above.
          }
        }}
        className="relative flex touch-none items-center justify-center rounded-full border-2 border-white bg-sage-600 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        style={{ width: SIZE, height: SIZE, cursor: dragAt ? 'grabbing' : 'grab' }}
      >
        <span className="pointer-events-none absolute inset-0 rounded-full bg-sage-500 transition-transform" style={{ transform: `scale(${1 + talk * 0.22})`, opacity: 0.35 + talk * 0.65, zIndex: -1 }} aria-hidden />
        <span className="pointer-events-none">
          <Avatar name={partner.display_name} slot={partnerSlot} size="md" />
        </span>
        {!state.local.mic ? (
          <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 rounded-full bg-ink p-1 text-white">
            <MicOff className="h-3 w-3" />
          </span>
        ) : null}
      </button>
      <span className="mt-1 rounded-full bg-black/55 px-2 py-0.5 text-micro tabular-nums text-white">{status}</span>
      {open ? (
        <div className={cn('absolute top-2 flex gap-2 rounded-full bg-black/75 p-1.5', left ? 'left-[68px]' : 'right-[68px]')}>
          <IconButton label="Back to the call" tone="night" size="sm" onClick={() => (setOpen(false), onExpand())}>
            <Maximize className="h-4 w-4" />
          </IconButton>
          <IconButton label={state.local.mic ? 'Mute' : 'Unmute'} pressed={!state.local.mic} tone={state.local.mic ? 'night' : 'nightOff'} size="sm" onClick={() => m.toggleMic()}>
            {state.local.mic ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </IconButton>
          <IconButton label="Put the bubble away" tone="night" size="sm" onClick={() => (setOpen(false), setCallBubbleHidden(true))}>
            <EyeOff className="h-4 w-4" />
          </IconButton>
          <IconButton label="End call" tone="end" size="sm" onClick={() => void m.hangup()}>
            <PhoneOff className="h-4 w-4" />
          </IconButton>
        </div>
      ) : null}
    </motion.div>
  );
}

function CallScreen({ state, minimised, onMinimise }: { state: CallState; minimised: boolean; onMinimise?: () => void }) {
  // Our House: their voice quieter the further apart we stand.
  const houseVolume = useCallVoiceVolume();
  const m = useCallManager();
  const { partner, partnerSlot, me } = useCouple();
  const [shareNudge, setShareNudge] = useState(false);
  const canDraw = useFeature('draw');
  const [drawing, setDrawing] = useState(false);
  const cardsOn = useFeature('call_cards');
  const cards = useCallCards();
  const [pickingDeck, setPickingDeck] = useState(false);
  const [audioPicker, setAudioPicker] = useState(false);
  // undefined = the browser's default output.
  const [sinkId, setSinkId] = useState<string | undefined>(undefined);
  const [selfSize, setSelfSize] = useState<VideoSize | null>(null);
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
  const { outputs, inputs, defaultOutput } = useAudioDevices(state.phase !== 'idle' && state.phase !== 'ended');
  const currentOutput = sinkId ?? outputs.find((o) => o.deviceId === 'default')?.deviceId ?? outputs[0]?.deviceId;
  const currentInput = state.micDeviceId ?? inputs.find((i) => i.deviceId === 'default')?.deviceId ?? inputs[0]?.deviceId;

  // The system switched speakers (say, to headphones) while I share sound.
  const lastOutput = useRef(defaultOutput);
  useEffect(() => {
    if (lastOutput.current && defaultOutput && defaultOutput !== lastOutput.current) m.outputChanged();
    lastOutput.current = defaultOutput;
  }, [defaultOutput, m]);

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
      {/* Sharing system sound: call audio stays on the default output, as echo-free sharing expects. */}
      <StreamAudio stream={state.remoteStream} revision={state.revision} sinkId={state.shareSoundIsSystem ? '' : sinkId} volume={houseVolume} />

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
              <StreamVideo stream={state.remoteStream} revision={state.revision} fit={state.remote.screen ? 'contain' : 'auto'} />
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
          {(outputs.length > 1 || inputs.length > 1) && state.phase !== 'ended' && (
            <IconButton label="Choose microphone and speaker" tone="night" size="sm" onClick={() => setAudioPicker(true)}>
              <SlidersHorizontal className="h-4 w-4" />
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
          <h2 className="mt-10 font-serif text-hero font-light [@media(max-height:500px)]:mt-2 [@media(max-height:500px)]:text-title">{partner.display_name}</h2>
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
          style={{ aspectRatio: selfViewAspect(selfSize) }}
          className={cn(
            'absolute bottom-32 right-4 z-20 max-h-[45dvh] overflow-hidden rounded-[18px] border border-white/15 bg-plum-900 shadow-2xl sm:bottom-36 sm:right-8 [@media(max-height:500px)]:bottom-24',
            // Smaller while their screen is up, so it covers less of it.
            isWideVideo(selfSize) ? (watchingShare ? 'w-28 sm:w-40' : 'w-40 sm:w-64') : watchingShare ? 'w-20 sm:w-28' : 'w-28 sm:w-40',
          )}
        >
          <SelfView state={state} onSize={setSelfSize} />
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
          {state.shareSoundLost ? (
            <div role="status" className="flex items-center gap-2 rounded-full bg-gold-50 py-1 pl-3 pr-1 text-micro text-gold-800">
              <VolumeX className="h-3.5 w-3.5" aria-hidden />
              {partner.display_name} may not hear your shared sound since your speakers changed.
              <button
                type="button"
                onClick={() => void m.reshareScreen()}
                className="rounded-full bg-gold-700 px-2.5 py-1 font-medium text-white hover:bg-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              >
                Share again
              </button>
            </div>
          ) : null}
          {state.shareSoundBlocked ? (
            <div role="status" className="flex items-center gap-2 rounded-full bg-gold-50 px-3 py-1 text-micro text-gold-800">
              <VolumeX className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Your screen&apos;s sound isn&apos;t being shared, because {partner.display_name} would hear their own voice. Share a browser tab to include sound, or
              update your browser or system.
            </div>
          ) : null}
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
            {live && cardsOn && (
              <IconButton
                label="Talk cards"
                pressed={pickingDeck || !!cards.table}
                tone={pickingDeck || cards.table ? 'nightOff' : 'night'}
                size="lg"
                onClick={() => (cards.table || pickingDeck ? (setPickingDeck(false), cards.close()) : setPickingDeck(true))}
              >
                <Layers className="h-6 w-6" />
              </IconButton>
            )}
            {live && canDraw && (
              <IconButton label="Draw together" pressed={drawing} tone={drawing ? 'nightOff' : 'night'} size="lg" onClick={() => setDrawing((d) => !d)}>
                <PenLine className="h-6 w-6" />
              </IconButton>
            )}
            <IconButton ref={primary} label="End call" tone="end" size="lg" className="w-20" onClick={() => void m.hangup()}>
              <PhoneOff className="h-6 w-6" />
            </IconButton>
          </>
        )}
      </footer>

      {live && cardsOn ? <CallCards cards={cards} picking={pickingDeck} onPicking={setPickingDeck} partnerName={partner.display_name} /> : null}

      {/* Draw together over the call: a panel on the right (a sheet from the bottom on phones). Audio carries on. */}
      {drawing && live ? (
        <div className="absolute inset-x-0 bottom-0 top-[72px] z-20 overflow-y-auto rounded-t-[26px] md:inset-y-0 md:left-auto md:right-0 md:top-0 md:w-[min(520px,48vw)] md:rounded-none md:rounded-l-[26px]">
          <LiveCanvas variant="call" onClose={() => setDrawing(false)} />
        </div>
      ) : null}

      <Dialog open={audioPicker} onOpenChange={setAudioPicker} title="Microphone and speaker">
        <div className="space-y-5">
          {inputs.length > 1 ? (
            <DevicePicker
              label="Speak through"
              devices={inputs}
              selected={currentInput}
              onPick={(id) => void m.setMicrophone(id === 'default' ? null : id)}
            />
          ) : null}
          {outputs.length > 1 && !state.shareSoundIsSystem ? (
            <DevicePicker label="Hear the call through" devices={outputs} selected={currentOutput} onPick={setSinkId} />
          ) : null}
          {state.shareSoundIsSystem ? (
            <p className="text-micro text-ink-muted">The call plays through your system&apos;s default speakers while you share your screen&apos;s sound.</p>
          ) : state.local.screen ? (
            <p className="text-micro text-ink-muted">Changing your speakers while you share sound? If {partner.display_name} stops hearing it, share again.</p>
          ) : null}
        </div>
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

function DevicePicker({ label, devices, selected, onPick }: { label: string; devices: AudioDevice[]; selected?: string; onPick: (deviceId: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-small font-medium text-ink">{label}</p>
      <ul className="space-y-1" role="radiogroup" aria-label={label}>
        {devices.map((d) => {
          const on = d.deviceId === selected;
          return (
            <li key={d.deviceId}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onPick(d.deviceId)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left text-ink transition-colors hover:bg-paper-sunken',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                  on && 'bg-paper-sunken font-medium',
                )}
              >
                <span className={cn('h-2 w-2 shrink-0 rounded-full', on ? 'bg-rose-600' : 'bg-plum-200')} aria-hidden />
                <span className="truncate">{d.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SelfView({ state, onSize }: { state: CallState; onSize: (size: VideoSize) => void }) {
  const m = useCallManager();
  const [stream, setStream] = useState<MediaStream | null>(null);
  useEffect(() => {
    const track = m.selfViewTrack;
    setStream(track ? new MediaStream([track]) : null);
  }, [m, state.revision, state.local.camera, state.local.screen]);
  return (
    <StreamVideo
      stream={stream}
      revision={state.revision}
      mirrored={!state.local.screen && state.facing === 'user'}
      fit={state.local.screen ? 'contain' : 'cover'}
      onSize={onSize}
    />
  );
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
