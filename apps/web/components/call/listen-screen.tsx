'use client';

import { formatDuration, NOW_PLAYING_MAX, type CallState } from '@us/shared';
import { useCallManager, useCouple } from '@us/shared/react';
import { motion } from 'framer-motion';
import { ChevronDown, Headphones, Mic, MicOff, Pause, Phone, PhoneOff, Play, Radio, RefreshCw, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Record, SoundBars } from '@/components/connect/vinyl';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/cn';
import { useElapsed } from '@/lib/hooks';
import { StreamAudio } from './media';

/**
 * Listen together: a call that's all about the music. One of us shares the
 * sound of a tab (or the whole screen) from a computer; the other hears it.
 * Mics start muted. The sharer's pause pauses it for both of us; the
 * listener's pause and volume are theirs alone.
 */
export function ListenScreen({ state, minimised, onMinimise }: { state: CallState; minimised: boolean; onMinimise?: () => void }) {
  const m = useCallManager();
  const { partner, partnerSlot, me, mySlot } = useCouple();
  const elapsed = useElapsed(state.connectedAt);
  const [volume, setVolume] = useState(0.9);
  const primary = useRef<HTMLButtonElement>(null);

  const live = state.phase === 'connected' || state.phase === 'reconnecting';
  const ringing = state.phase === 'outgoing' || state.phase === 'incoming' || state.phase === 'connecting';
  const iShare = state.local.sound === true;
  const theyShare = state.remote.sound === true;
  const playing = iShare ? !state.local.soundPaused : theyShare ? !state.remote.soundPaused && state.hearing : false;

  useEffect(() => primary.current?.focus(), [state.phase]);

  const title = iShare
    ? state.local.nowPlaying
    : theyShare
      ? (state.remote.nowPlaying ?? `${partner.display_name}’s music`)
      : null;

  const status = (() => {
    switch (state.phase) {
      case 'outgoing':
        return `Ringing ${partner.display_name}…`;
      case 'incoming':
        return 'wants to listen together';
      case 'connecting':
        return 'Connecting…';
      case 'reconnecting':
        return 'Reconnecting…';
      case 'ended':
        return state.endReason === 'declined' && state.direction === 'outgoing'
          ? `${partner.display_name} can’t listen right now`
          : state.endReason === 'missed'
            ? state.direction === 'outgoing'
              ? 'No answer'
              : 'Missed'
            : elapsed
              ? `Listened together · ${formatDuration(elapsed)}`
              : 'Ended';
      default:
        if (iShare) return state.local.soundPaused ? 'Paused for both of you' : `${partner.display_name} hears exactly what you hear`;
        if (theyShare) {
          if (state.remote.soundPaused) return `Paused by ${partner.display_name}`;
          return state.hearing ? `From ${partner.display_name}’s computer` : `Paused for you. ${partner.display_name} keeps playing.`;
        }
        return m.canShareSound ? 'Nothing playing yet' : `Waiting for ${partner.display_name} to play something`;
    }
  })();

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Listening together with ${partner.display_name}`}
      aria-hidden={minimised || undefined}
      className={cn('fixed inset-0 z-50 flex-col overflow-y-auto overflow-x-hidden bg-plum-900 text-paper', minimised ? 'hidden' : 'flex')}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.4 } }}
    >
      <StreamAudio stream={state.remoteStream} revision={state.revision} volume={volume} />
      <span aria-hidden className="pointer-events-none absolute -left-36 -top-40 h-[520px] w-[520px] rounded-full bg-plum-700/70" />
      <span aria-hidden className="pointer-events-none absolute -bottom-32 -right-20 h-[360px] w-[360px] rounded-full bg-rose-800/50" />

      <header className="relative z-10 flex items-center gap-3 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8">
        {onMinimise && (
          <IconButton label="Minimise" tone="night" size="sm" onClick={onMinimise}>
            <ChevronDown className="h-5 w-5" />
          </IconButton>
        )}
        <span className="inline-flex items-center gap-2 rounded-full bg-rose-400/20 px-3 py-1.5 text-micro font-semibold text-rose-200">
          <span className={cn('h-2 w-2 rounded-full bg-rose-400', live && 'animate-pulse')} aria-hidden />
          Listening together{live ? <span className="tabular-nums"> · {formatDuration(elapsed)}</span> : null}
        </span>
        {live && iShare ? <span className="hidden text-micro text-plum-300 sm:inline">Sending 128 kbps stereo</span> : null}
        <span className="flex-1" />
        {live && state.route === 'relay' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-micro text-paper/80" title="Connected through a relay server.">
            <Radio className="h-3.5 w-3.5" aria-hidden /> Relayed
          </span>
        )}
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-5xl flex-1 items-center gap-8 px-6 py-8 md:grid-cols-2 md:gap-12 md:px-12">
        <div className="flex justify-center">
          <Record playing={playing} className="w-[min(68vw,340px)] md:w-[min(34vw,380px)]" />
        </div>

        <div className="flex flex-col gap-5 text-center md:text-left">
          {state.phase === 'incoming' || state.phase === 'outgoing' || state.phase === 'ended' || state.phase === 'connecting' ? (
            <div className="flex flex-col items-center gap-3 md:items-start">
              <Avatar name={partner.display_name} slot={partnerSlot} size="lg" className="[&>span]:ring-offset-plum-900" />
              <h1 className="font-display text-title">{partner.display_name}</h1>
              <p className="text-lead text-plum-200" aria-live="polite">
                {status}
              </p>
              {state.phase === 'incoming' ? (
                <p className="max-w-sm text-small text-plum-300">Your mic starts muted. Tap it any time to talk over the music.</p>
              ) : null}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <p className="text-micro font-semibold uppercase tracking-[0.08em] text-plum-300">Now playing</p>
                {iShare ? (
                  <NowPlayingInput value={state.local.nowPlaying ?? ''} onCommit={(t) => m.setNowPlaying(t)} partnerName={partner.display_name} />
                ) : (
                  <h1 className="text-balance font-display text-title leading-tight">{title ?? 'Nothing yet'}</h1>
                )}
              </div>
              <SoundBars playing={playing} count={12} className="h-12 justify-center md:justify-start" barClassName="w-1.5 bg-rose-300" />
              <p className={cn('text-small', theyShare && state.remote.soundPaused ? 'text-gold-200' : 'text-plum-200')} aria-live="polite">
                {status}
              </p>

              {!iShare && !theyShare ? (
                m.canShareSound ? (
                  <div className="flex flex-col items-center gap-2 md:items-start">
                    <Button ref={primary} variant="primary" size="lg" onClick={() => void m.startSoundShare()}>
                      <Play className="h-5 w-5" fill="currentColor" /> Play something for {partner.display_name}
                    </Button>
                    <p className="max-w-sm text-micro text-plum-300">
                      Pick a tab with music and turn on “Also share tab audio”. On Windows you can share the whole screen’s sound.
                    </p>
                  </div>
                ) : (
                  <p className="max-w-sm text-small text-plum-300">They’ll pick a tab or their screen on their computer. You’ll hear it here.</p>
                )
              ) : null}

              {iShare && state.shareSoundLost ? (
                <div role="status" className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-gold-50 px-3 py-2 text-micro text-gold-800 md:justify-start">
                  <VolumeX className="h-3.5 w-3.5" aria-hidden />
                  {partner.display_name} may not hear it since your sound changed.
                  <button
                    type="button"
                    onClick={() => void m.reshareScreen()}
                    className="rounded-full bg-gold-700 px-2.5 py-1 font-medium text-white hover:bg-gold-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                  >
                    Share again
                  </button>
                </div>
              ) : null}

              <div className="flex items-center justify-center gap-3 rounded-[18px] bg-white/[0.06] px-4 py-3 md:justify-start">
                <span className="flex">
                  <Avatar name={me.display_name} slot={mySlot} size="sm" className="[&>span]:ring-offset-plum-900" />
                  <Avatar name={partner.display_name} slot={partnerSlot} size="sm" className="-ml-2 [&>span]:ring-offset-plum-900" />
                </span>
                <span className="text-small text-plum-200">
                  {iShare ? (
                    <>
                      <b className="font-semibold text-paper">{partner.display_name}</b> is listening
                    </>
                  ) : theyShare ? (
                    <>
                      <b className="font-semibold text-paper">{partner.display_name}</b> is playing for you
                    </>
                  ) : (
                    <>You’re both here</>
                  )}
                  {state.remote.mic ? ' · their mic is on' : ''}
                </span>
              </div>

              {theyShare ? (
                <label className="flex items-center gap-3 text-plum-200">
                  <Volume2 className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="sr-only">Volume</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(volume * 100)}
                    onChange={(e) => setVolume(Number(e.target.value) / 100)}
                    className="w-full accent-rose-400"
                  />
                </label>
              ) : null}
            </>
          )}
          {state.error ? <p className="text-small text-gold-200">{state.error}</p> : null}
        </div>
      </main>

      <footer className="relative z-10 flex flex-wrap items-center justify-center gap-3 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-4 sm:gap-4">
        {state.phase === 'incoming' ? (
          <>
            <IconButton label="Decline" tone="end" size="xl" onClick={() => void m.decline()}>
              <PhoneOff className="h-7 w-7" />
            </IconButton>
            <IconButton ref={primary} label="Listen together" tone="accept" size="xl" onClick={() => void m.accept()}>
              <Headphones className="h-7 w-7" />
            </IconButton>
          </>
        ) : state.phase === 'ended' ? (
          <p className="h-[72px] text-small text-paper/60">
            {me.display_name} &amp; {partner.display_name}
          </p>
        ) : (
          <>
            <IconButton
              label={state.local.mic ? 'Mute your mic' : `Talk to ${partner.display_name}`}
              pressed={state.local.mic}
              tone={state.local.mic ? 'accept' : 'night'}
              size="lg"
              onClick={() => m.toggleMic()}
            >
              {state.local.mic ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
            </IconButton>
            {live && (iShare || theyShare) ? (
              <button
                ref={primary}
                type="button"
                aria-label={iShare ? (state.local.soundPaused ? 'Play for both of you' : 'Pause for both of you') : state.hearing ? 'Pause for me' : 'Listen again'}
                onClick={() => (iShare ? m.setSoundPaused(!state.local.soundPaused) : m.setHearing(!state.hearing))}
                className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-paper text-plum-800 shadow-[0_12px_30px_-10px_rgba(245,84,124,0.6)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-plum-900"
              >
                {(iShare ? !state.local.soundPaused : state.hearing) ? <Pause className="h-7 w-7" fill="currentColor" /> : <Play className="ml-1 h-7 w-7" fill="currentColor" />}
              </button>
            ) : null}
            {live && iShare ? (
              <Button variant="night" size="lg" className="rounded-full" onClick={() => void m.reshareScreen()}>
                <RefreshCw className="h-5 w-5" /> Change what’s playing
              </Button>
            ) : null}
            {live && iShare ? (
              <Button variant="night" size="lg" className="rounded-full" onClick={() => void m.stopSoundShare()}>
                Stop sharing
              </Button>
            ) : null}
            <IconButton ref={iShare || theyShare ? undefined : primary} label={ringing && state.direction === 'outgoing' ? 'Cancel' : 'Leave'} tone="end" size="lg" onClick={() => void m.hangup()}>
              {ringing ? <Phone className="h-6 w-6 rotate-[135deg]" /> : <PhoneOff className="h-6 w-6" />}
            </IconButton>
          </>
        )}
      </footer>
    </motion.div>
  );
}

/** What's playing, typed by whoever shares; sent when they finish typing. */
function NowPlayingInput({ value, onCommit, partnerName }: { value: string; onCommit: (text: string) => void; partnerName: string }) {
  const [text, setText] = useState(value);
  // The screen re-renders every second (the timer); keep the pending send steady.
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => commit.current(text), 700);
    return () => clearTimeout(t);
  }, [text, value]);
  return (
    <label className="flex flex-col gap-1">
      <span className="sr-only">What’s playing, shown to {partnerName}</span>
      <input
        value={text}
        maxLength={NOW_PLAYING_MAX}
        placeholder="What’s playing?"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(text)}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        className="w-full border-0 border-b border-dashed border-plum-600 bg-transparent py-1 text-center font-display text-title text-paper placeholder:text-plum-400 focus:border-rose-300 focus:outline-none md:text-left"
      />
      <span className="text-micro text-plum-300">{partnerName} sees this line.</span>
    </label>
  );
}
