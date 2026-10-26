'use client';

import type { ShareMode } from '@us/shared';
import { useCallManager, useCallState, useCouple } from '@us/shared/react';
import { Headphones, Laptop, Music, Play, Smartphone, Tv } from 'lucide-react';
import { useState } from 'react';
import { ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { Record, SoundBars } from './vinyl';

const NO_SOUND = 'No sound came with that. Pick a tab with music and turn on “Also share tab audio”, or share your whole screen with system audio on Windows.';

/**
 * Listen together and Watch together, the two big cards on Connect. From a
 * computer the picker opens on the click and the share goes out as soon as my
 * partner picks up; from a phone browser I ask my partner to share instead.
 */
export function TogetherCards() {
  const m = useCallManager();
  const call = useCallState();
  const { partner, partnerOnline } = useCouple();
  const [ask, setAsk] = useState<'listen' | 'watch' | null>(null);
  const [watchOpen, setWatchOpen] = useState(false);
  const [mode, setMode] = useState<ShareMode>('smooth');
  const [error, setError] = useState<string | null>(null);
  const busy = call.phase !== 'idle' && call.phase !== 'ended';
  const name = partner.display_name;

  async function listen() {
    setError(null);
    if (!m.canShareSound) return setAsk('listen');
    const display = await m.pickDisplay();
    if (!display) return;
    if (!display.getAudioTracks().length) {
      display.getTracks().forEach((t) => t.stop());
      return setError(NO_SOUND);
    }
    await m.startSession('listen', display);
  }

  async function watch() {
    setWatchOpen(false);
    setError(null);
    const display = await m.pickDisplay();
    if (!display) return;
    await m.startSession('watch', display);
    void m.setShareMode(mode);
  }

  return (
    <section aria-label="Together, live" className="space-y-3">
      <div className="grid gap-5 md:grid-cols-2">
        {/* Listen together */}
        <div className="relative isolate flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[28px] bg-plum-800 p-6 text-paper shadow-[0_24px_48px_-28px_rgba(36,25,51,0.6)] sm:min-h-[300px] sm:p-7">
          <span aria-hidden className="absolute -right-16 -top-20 -z-10 h-72 w-72 rounded-full bg-rose-400/85" />
          <Record playing className="absolute right-5 top-5 -z-10 w-28 sm:w-48" />
          <div className="flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/10">
              <Headphones className="h-5 w-5" aria-hidden />
            </span>
            <SoundBars playing className="h-5" />
          </div>
          <div className="mt-16 max-w-sm space-y-2.5 sm:mt-0">
            <h2 className="font-display text-[26px] leading-tight sm:text-[30px]">Listen together</h2>
            <p className="text-small text-plum-200">
              {m.canShareSound
                ? `Play a song on this computer. ${name} hears it live, wherever they are, like you’re sharing one pair of headphones.`
                : `Hear what ${name} plays on their computer, live, like you’re sharing one pair of headphones.`}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button disabled={busy} onClick={() => void listen()}>
                {m.canShareSound ? <Play className="h-4 w-4" fill="currentColor" /> : <Music className="h-4 w-4" />}
                {m.canShareSound ? 'Start listening' : `Ask ${name} to play`}
              </Button>
              {m.canShareSound ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAsk('listen')}
                  className="rounded text-small text-plum-200 underline-offset-4 hover:text-paper hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 disabled:opacity-50"
                >
                  or ask {name} to play
                </button>
              ) : (
                <span className="text-micro text-plum-300">Mic off · tap to talk</span>
              )}
            </div>
          </div>
        </div>

        {/* Watch together */}
        <div className="relative isolate flex min-h-[260px] flex-col justify-between overflow-hidden rounded-[28px] bg-teal-900 p-6 text-paper shadow-[0_24px_48px_-28px_rgba(5,47,44,0.7)] sm:min-h-[300px] sm:p-7">
          <span aria-hidden className="absolute -bottom-28 -right-10 -z-10 h-64 w-64 rounded-full bg-teal-500/80" />
          <span aria-hidden className="absolute right-6 top-7 -z-10 flex h-[76px] w-[120px] items-center justify-center overflow-hidden rounded-xl border-[5px] border-plum-900 bg-plum-700 sm:h-[130px] sm:w-[208px]">
            <span className="absolute -bottom-8 -left-5 h-20 w-28 rounded-full bg-gold-400/80" />
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-paper/90 text-plum-800 sm:h-11 sm:w-11">
              <Play className="ml-0.5 h-4 w-4" fill="currentColor" />
            </span>
          </span>
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/10">
            <Tv className="h-5 w-5" aria-hidden />
          </span>
          <div className="mt-16 max-w-sm space-y-2.5 sm:mt-0">
            <h2 className="font-display text-[26px] leading-tight sm:text-[30px]">Watch together</h2>
            <p className="text-small text-teal-200">Share a film, a show or a video, picture and sound. Talk over it like you’re on the same sofa.</p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => (m.canScreenShare ? setWatchOpen(true) : setAsk('watch'))}
                className="inline-flex h-11 items-center gap-2 rounded-control bg-paper px-5 text-body font-medium text-teal-900 transition-colors hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-900 disabled:opacity-50"
              >
                {m.canScreenShare ? 'Pick something to watch' : `Ask ${name} to share`}
              </button>
              <span className="text-micro text-teal-300">Up to 1080p · 60 fps</span>
            </div>
          </div>
        </div>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {busy ? <p className="text-micro text-ink-muted">You’re on a call. Finish it to start something new.</p> : null}

      <Dialog open={watchOpen} onOpenChange={setWatchOpen} title="Watch together" description={`Pick what to share, then we ring ${name}. Your camera stays off, your mic stays on.`}>
        <div className="space-y-5">
          <ol className="grid gap-2 text-small sm:grid-cols-3">
            {['Pick a tab or window', `We ring ${name}`, 'Watch and talk'].map((step, i) => (
              <li key={step} className={cn('flex items-center gap-2 rounded-full px-3 py-1.5', i === 0 ? 'bg-teal-50 font-medium text-teal-800' : 'bg-paper-sunken text-ink-soft')}>
                <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-micro', i === 0 ? 'bg-teal-600 text-white' : 'border border-paper-edge')}>{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <div>
            <p className="mb-2 text-small font-medium text-ink">Picture</p>
            <div role="radiogroup" aria-label="Picture" className="flex rounded-control bg-paper-sunken p-1">
              {(
                [
                  ['smooth', 'Smooth, for films'],
                  ['sharp', 'Sharp, for text'],
                ] as [ShareMode, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => setMode(value)}
                  className={cn(
                    'h-10 flex-1 rounded-[10px] text-small transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                    mode === value ? 'bg-paper-raised font-semibold text-ink shadow-sm' : 'text-ink-soft hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-micro text-ink-muted">
            A browser tab is best: it sends picture and sound. Turn on <b className="text-ink">Also share tab audio</b> in the picker so {name} hears it too.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="quiet" onClick={() => setWatchOpen(false)}>
              Not now
            </Button>
            <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => void watch()}>
              Choose and ring {name}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={ask !== null}
        onOpenChange={(o) => !o && setAsk(null)}
        title={ask === 'watch' ? 'Watch together' : 'Listen together'}
        description={
          ask === 'watch'
            ? `Screens are shared from a computer. We’ll ring ${name} with a button to share theirs, and you watch here.`
            : `The music plays from a computer, where Us can hear what’s playing. We’ll ring ${name} with a button to share it, and you listen here.`
        }
      >
        <div className="space-y-4">
          <div aria-hidden className="flex items-center justify-center gap-5 rounded-sheet bg-plum-800 py-6 text-paper">
            <span className="flex flex-col items-center gap-1.5 text-micro text-plum-200">
              <Laptop className="h-10 w-10 text-paper" strokeWidth={1.5} />
              {name}’s computer
            </span>
            <SoundBars playing count={3} className="h-4" />
            <span className="flex flex-col items-center gap-1.5 text-micro text-plum-200">
              <Smartphone className="h-10 w-10 text-paper" strokeWidth={1.5} />
              You
            </span>
          </div>
          <p className={cn('rounded-control px-3 py-2 text-small', partnerOnline ? 'bg-sage-50 text-sage-700' : 'bg-paper-sunken text-ink-soft')}>
            {partnerOnline ? `${name} has Us open right now.` : `${name} isn’t in Us right now. They’ll get a notification.`}
          </p>
          <Button
            block
            onClick={() => {
              const what = ask;
              setAsk(null);
              if (what) void m.startSession(what);
            }}
          >
            {ask === 'watch' ? <Tv className="h-4 w-4" /> : <Music className="h-4 w-4" />}
            {ask === 'watch' ? `Ask ${name} to share their screen` : `Ask ${name} to play something`}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
