'use client';

import {
  createInvite,
  formatInviteCode,
  friendlyError,
  getCoupleContext,
  redeemInvite,
  watchForPairing,
  type CoupleContext,
  type Invite,
} from '@us/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, Share2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Seal } from '@/components/ui/avatar';
import { Button, Spinner } from '@/components/ui/button';
import { inputStyles } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { getSupabase } from '@/lib/supabase/client';

type Step = 'loading' | 'choose' | 'invite' | 'join' | 'paired';

export default function PairPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('loading');
  const [userId, setUserId] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [paired, setPaired] = useState<CoupleContext | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    void sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return router.replace('/sign-in');
      setUserId(data.user.id);
      const ctx = await getCoupleContext(sb, data.user.id).catch(() => null);
      if (ctx) router.replace('/home');
      else setStep('choose');
    });
  }, [router]);

  // While my invite is out, wait for my partner to redeem it.
  useEffect(() => {
    if (step !== 'invite' || !userId) return;
    return watchForPairing(getSupabase(), userId, (ctx) => onPaired(ctx));
  }, [step, userId]);

  function onPaired(ctx: CoupleContext) {
    setPaired(ctx);
    setStep('paired');
    setTimeout(() => router.replace('/home'), 2200);
  }

  async function startInvite() {
    setBusy(true);
    setError(null);
    try {
      setInvite(await createInvite(getSupabase()));
      setStep('invite');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  async function join(e: FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      const sb = getSupabase();
      await redeemInvite(sb, code);
      const ctx = await getCoupleContext(sb, userId);
      if (ctx) onPaired(ctx);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function share() {
    if (!invite) return;
    const text = `Join me on Us — our code is ${invite.code}`;
    if (navigator.share) await navigator.share({ title: 'Us', text, url: location.origin }).catch(() => {});
    else await copy();
  }

  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-10 sm:py-16">
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2 font-serif text-heading italic text-ink">
          <Seal size={28} /> Us
        </span>
        <Button
          variant="quiet"
          size="sm"
          onClick={async () => {
            await getSupabase().auth.signOut();
            router.replace('/sign-in');
          }}
        >
          Sign out
        </Button>
      </header>

      <div className="flex flex-1 flex-col justify-center py-10">
        <AnimatePresence mode="wait">
          {step === 'loading' && (
            <motion.div key="loading" className="flex justify-center" exit={{ opacity: 0 }}>
              <Spinner className="h-6 w-6 text-rose-400" />
            </motion.div>
          )}

          {step === 'choose' && (
            <motion.section key="choose" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <h1 className="text-balance font-display text-title text-ink sm:text-[40px] sm:leading-[44px]">
                Now, find your person.
              </h1>
              <p className="mt-3 max-w-md text-ink-soft">
                Us only ever holds two people. One of you makes an invite; the other enters it. Once you’re paired, it’s
                permanent.
              </p>

              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                <ChoiceCard
                  accent="rose"
                  title="Invite my partner"
                  body="Get a code to send them however you usually talk."
                  onClick={startInvite}
                  busy={busy}
                />
                <ChoiceCard
                  accent="teal"
                  title="I have a code"
                  body="Your partner already invited you."
                  onClick={() => {
                    setError(null);
                    setStep('join');
                  }}
                />
              </div>
              {error && <p className="mt-6 text-small text-rose-700" role="alert">{error}</p>}
            </motion.section>
          )}

          {step === 'invite' && invite && (
            <motion.section key="invite" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <p className="text-small font-medium text-rose-700">Your invite</p>
              <h1 className="mt-1 font-display text-title text-ink">Send them this code.</h1>

              <Sheet pad="lg" className="mt-8 text-center">
                <p
                  className="select-all font-display text-[44px] font-medium tracking-[0.12em] text-ink sm:text-[56px]"
                  aria-label={`Invite code ${invite.code.split('').join(' ')}`}
                >
                  {invite.code}
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <Button variant="secondary" onClick={copy}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? 'Copied' : 'Copy code'}
                  </Button>
                  {canShare && (
                    <Button onClick={share}>
                      <Share2 className="h-4 w-4" /> Share
                    </Button>
                  )}
                </div>
                <p className="mt-6 text-micro text-ink-muted">
                  Works once · expires {new Date(invite.expires_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}
                </p>
              </Sheet>

              <p className="mt-8 flex items-center justify-center gap-3 text-ink-soft" aria-live="polite">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-breathe rounded-full bg-teal-400" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-500" />
                </span>
                Waiting for them to join…
              </p>
            </motion.section>
          )}

          {step === 'join' && (
            <motion.section key="join" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <h1 className="font-display text-title text-ink">Enter their code.</h1>
              <p className="mt-2 text-ink-soft">Eight letters and numbers — capitals don’t matter.</p>
              <form onSubmit={join} className="mt-8 space-y-4">
                <label htmlFor="code" className="sr-only">
                  Invite code
                </label>
                <input
                  id="code"
                  autoFocus
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  spellCheck={false}
                  inputMode="text"
                  placeholder="ABCD-EFGH"
                  value={code}
                  onChange={(e) => setCode(formatInviteCode(e.target.value))}
                  aria-invalid={error ? true : undefined}
                  className={cn(
                    inputStyles,
                    'h-20 text-center font-display text-[36px] tracking-[0.16em] placeholder:text-plum-200',
                  )}
                />
                {error && (
                  <p className="text-small text-rose-700" role="alert">
                    {error}
                  </p>
                )}
                <div className="flex gap-3">
                  <Button type="button" variant="secondary" onClick={() => setStep('choose')}>
                    Back
                  </Button>
                  <Button type="submit" block loading={busy} disabled={code.length < 9}>
                    Pair with them
                  </Button>
                </div>
              </form>
            </motion.section>
          )}

          {step === 'paired' && paired && (
            <motion.section
              key="paired"
              className="flex flex-col items-center text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <PairedSeal />
              <h1 className="mt-8 font-display text-title text-ink">
                You and <em>{paired.partner.display_name}</em>.
              </h1>
              <p className="mt-2 text-ink-soft">Your space is ready.</p>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

function ChoiceCard({
  accent,
  title,
  body,
  onClick,
  busy,
}: {
  accent: 'rose' | 'teal';
  title: string;
  body: string;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'group relative overflow-hidden rounded-sheet border border-paper-edge bg-paper-raised p-6 text-left',
        'transition-[transform,box-shadow] duration-base ease-out hover:-translate-y-0.5 hover:shadow-[0_16px_32px_-20px_rgba(36,25,51,0.4)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-80 transition-transform duration-gentle group-hover:scale-110',
          accent === 'rose' ? 'bg-rose-200' : 'bg-teal-200',
        )}
      />
      <span className="relative block font-display text-heading text-ink">{title}</span>
      <span className="relative mt-2 block text-small text-ink-soft">{body}</span>
      {busy && <Spinner className="relative mt-4 text-rose-500" />}
    </button>
  );
}

/** The pairing moment: the two circles meet. */
function PairedSeal() {
  return (
    <div className="relative h-32 w-48" aria-hidden>
      <motion.span
        className="absolute left-1/2 top-0 h-32 w-32 rounded-full bg-rose-400"
        initial={{ x: '-130%' }}
        animate={{ x: '-80%' }}
        transition={{ duration: 1.1, ease: [0.34, 1.32, 0.64, 1] }}
      />
      <motion.span
        className="absolute left-1/2 top-0 h-32 w-32 rounded-full bg-teal-500 mix-blend-multiply"
        initial={{ x: '30%' }}
        animate={{ x: '-20%' }}
        transition={{ duration: 1.1, ease: [0.34, 1.32, 0.64, 1] }}
      />
    </div>
  );
}
