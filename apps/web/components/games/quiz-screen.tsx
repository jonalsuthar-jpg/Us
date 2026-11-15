'use client';

import { fromDateKey, knowMePrompt, mostLikelyPrompt, QUIZ_INFO, quizMatches, quizState, quizVerdict, rateGap, type QuizItem, type QuizRound } from '@us/shared';
import { useCouple, useQuizzes } from '@us/shared/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, Clock, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { Confetti } from './confetti';

const ACCENT: Record<QuizRound['kind'], { eyebrow: string; bar: string; next: string }> = {
  this_or_that: { eyebrow: 'text-sage-700', bar: 'bg-sage-400', next: 'bg-sage-200' },
  know_me: { eyebrow: 'text-teal-700', bar: 'bg-teal-500', next: 'bg-teal-200' },
  most_likely: { eyebrow: 'text-plum-600', bar: 'bg-plum-500', next: 'bg-plum-200' },
  rate_it: { eyebrow: 'text-gold-700', bar: 'bg-gold-500', next: 'bg-gold-200' },
};

/** A quiz round: answer card by card, wait for my partner, then the reveal. */
export function QuizScreen({ id }: { id: string }) {
  const { me, partner } = useCouple();
  const { rounds, loading, answer } = useQuizzes();
  const round = rounds.find((r) => r.id === id);
  const [picks, setPicks] = useState<number[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!round) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <p className="font-serif text-lead italic text-ink-soft">{loading ? 'Shuffling the questions…' : 'This quiz isn’t here any more.'}</p>
      </div>
    );
  }

  const kind = round.kind;
  const accent = ACCENT[kind];
  const state = quizState(round);
  const items = round.items;
  const total = items.length;
  const iAmSubject = round.subject_id === me.id;
  const subjectName = iAmSubject ? me.display_name : partner.display_name;
  const prompt = (item: QuizItem, mine: boolean) =>
    kind === 'know_me'
      ? knowMePrompt(item.prompt ?? '', subjectName, mine && iAmSubject)
      : kind === 'most_likely'
        ? mostLikelyPrompt(item.prompt ?? '')
        : kind === 'rate_it'
          ? (item.prompt ?? '')
          : `${item.options[0]} or ${item.options[1]}?`;
  const done = state === 'mine' && picks.length >= total;

  const header = (
    <header className="flex items-center gap-3">
      <Link href="/connect" aria-label="Back to Connect" className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-paper-sunken hover:text-ink">
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className={cn('text-micro font-semibold uppercase tracking-[0.08em]', accent.eyebrow)}>
          {round.for_date ? `Daily · ${fromDateKey(round.for_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}` : 'Quiz'}
        </p>
        <h1 className="font-display text-title text-ink">{QUIZ_INFO[kind].title}</h1>
      </div>
      {state === 'mine' ? (
        <span className="rounded-full bg-paper-sunken px-3 py-1.5 text-micro font-semibold text-ink-soft">{done ? 'Done' : `${picks.length + 1} of ${total}`}</span>
      ) : null}
    </header>
  );

  if (state === 'mine') {
    const i = Math.min(picks.length, total - 1);
    const item = items[i]!;
    const pick = (k: number) => setPicks((p) => (p.length < total ? [...p, k] : p));
    const submit = async () => {
      setSending(true);
      setError(null);
      try {
        await answer(round.id, picks);
      } catch {
        setError('Couldn’t send your answers. Try again.');
      } finally {
        setSending(false);
      }
    };
    return (
      <div className="mx-auto max-w-xl space-y-5 px-5 py-6 sm:py-10">
        {header}
        {kind === 'know_me' ? (
          <p className="rounded-[18px] border border-teal-100 bg-teal-50 px-4 py-3 text-small text-teal-800">
            {iAmSubject
              ? `Today is about you. Answer honestly; ${partner.display_name} will try to guess.`
              : `Today is about ${partner.display_name}. Guess what they said about themselves.`}
          </p>
        ) : null}
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} aria-hidden>
          {items.map((_, k) => (
            <span key={k} className={cn('h-1.5 rounded-full', k < picks.length ? accent.bar : k === picks.length ? accent.next : 'bg-paper-sunken')} />
          ))}
        </div>

        {!done ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: 40, rotate: 1.5 }}
              animate={{ opacity: 1, x: 0, rotate: 0 }}
              exit={{ opacity: 0, x: -40, rotate: -1.5 }}
              transition={{ duration: 0.22 }}
            >
              {kind === 'this_or_that' ? (
                <div className="relative grid gap-2.5">
                  {item.options.map((o, k) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => pick(k)}
                      className={cn(
                        'flex h-40 items-center justify-center rounded-[28px] px-5 text-center font-display text-[28px] leading-tight text-white transition-transform hover:scale-[1.01] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold-400 sm:h-48',
                        k === 0 ? 'bg-rose-500' : 'bg-teal-600',
                      )}
                    >
                      {o}
                    </button>
                  ))}
                  <span aria-hidden className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[5px] border-paper bg-paper-raised font-serif text-[20px] italic text-ink">
                    or
                  </span>
                </div>
              ) : (
                <div className="space-y-5 rounded-[28px] border border-paper-edge bg-paper-raised p-5 shadow-[0_18px_40px_-28px_rgba(36,25,51,0.5)] sm:p-6">
                  <p className="text-balance font-serif text-[24px] leading-[1.3] text-ink sm:text-[28px]">{prompt(item, true)}</p>
                  {kind === 'know_me' ? (
                    <div className="grid gap-2.5">
                      {item.options.map((o, k) => (
                        <button
                          key={o}
                          type="button"
                          onClick={() => pick(k)}
                          className="flex min-h-[52px] items-center gap-3 rounded-[18px] border-2 border-paper-edge px-3.5 py-2.5 text-left font-semibold text-ink transition-colors hover:border-teal-400 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-paper-sunken text-micro font-bold text-ink-soft">{'ABCDEF'[k]}</span>
                          {o}
                        </button>
                      ))}
                    </div>
                  ) : kind === 'most_likely' ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      {[
                        { label: 'Me', name: me.display_name, cls: 'bg-rose-500' },
                        { label: partner.display_name, name: partner.display_name, cls: 'bg-teal-600' },
                      ].map((p, k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => pick(k)}
                          className={cn(
                            'flex h-32 flex-col items-center justify-center gap-2 rounded-[24px] text-white transition-transform hover:scale-[1.02] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold-400',
                            p.cls,
                          )}
                        >
                          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/25 text-[18px] font-bold">{p.name.slice(0, 1).toUpperCase()}</span>
                          <span className="max-w-full truncate px-2 font-display text-[19px]">{p.label}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-5 gap-2">
                        {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => pick(n)}
                            aria-label={`${n} out of 10`}
                            className="flex h-12 items-center justify-center rounded-[14px] border-2 border-paper-edge text-lead font-bold text-ink transition-colors hover:border-gold-400 hover:bg-gold-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                      <p className="flex justify-between text-micro text-ink-muted">
                        <span>Not for me</span>
                        <span>Love it</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="space-y-3 rounded-[28px] border border-dashed border-paper-edge px-6 py-10 text-center">
            <p className="font-serif text-lead italic text-ink">All done. Send them off?</p>
            <p className="text-small text-ink-soft">Sealed once sent. You’ll see {partner.display_name}’s once they’ve played too.</p>
            {error ? <p className="text-small text-rose-700">{error}</p> : null}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button variant="quiet" size="sm" disabled={!picks.length || sending} onClick={() => setPicks((p) => p.slice(0, -1))}>
            Back
          </Button>
          {done ? (
            <Button disabled={sending} onClick={() => void submit()}>
              {sending ? 'Sending…' : 'Send my answers'}
            </Button>
          ) : (
            <p className="text-right text-micro text-ink-muted">{partner.display_name}’s answers stay hidden until you finish.</p>
          )}
        </div>
      </div>
    );
  }

  if (state === 'waiting') {
    return (
      <div className="mx-auto max-w-xl space-y-6 px-5 py-6 sm:py-10">
        {header}
        <div className="rounded-[28px] border border-dashed border-paper-edge px-6 py-12 text-center">
          <p className="text-[40px]">⏳</p>
          <p className="mt-2 font-serif text-lead italic text-ink">Your answers are sealed.</p>
          <p className="mt-1 text-small text-ink-soft">We’ll show you both once {partner.display_name} has played too.</p>
        </div>
        <BackLink />
      </div>
    );
  }

  const mine = round.my_answers!;
  const theirs = round.partner_answers!;
  const matches = quizMatches(kind, mine, theirs);
  const score = matches.filter(Boolean).length;
  // Know me: the subject's picks are the truth; the other's are the guesses.
  const truth = iAmSubject ? mine : theirs;
  const guess = iAmSubject ? theirs : mine;
  const guesser = iAmSubject ? partner.display_name : 'You';
  const person = (pick: number | undefined, fromMe: boolean) => ((pick === 0) === fromMe ? 'You' : partner.display_name);
  const summary =
    kind === 'know_me'
      ? `${guesser} guessed ${score} right about ${iAmSubject ? 'you' : subjectName}`
      : kind === 'rate_it'
        ? `Within a point on ${score} of ${total} · ${rateGap(mine, theirs)} apart on average`
        : `You agreed on ${score} of ${total}`;

  return (
    <div className="mx-auto max-w-xl space-y-5 px-5 py-6 sm:py-10">
      {score / total >= 0.7 ? <Confetti key={round.id} /> : null}
      {header}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="flex items-center gap-5 rounded-[28px] bg-teal-600 px-6 py-6 text-white"
      >
        <p className="font-display text-[54px] leading-none">
          {score}
          <span className="text-[24px] opacity-70">/{total}</span>
        </p>
        <div className="min-w-0">
          <p className="text-lead font-semibold">{quizVerdict(kind, score, total)}</p>
          <p className="mt-0.5 text-small opacity-85">{summary}</p>
        </div>
      </motion.div>
      <ol className="space-y-2.5">
        {items.map((item, k) => {
          const match = matches[k];
          return (
            <motion.li
              key={item.id}
              initial={{ opacity: 0, rotateX: -80 }}
              animate={{ opacity: 1, rotateX: 0 }}
              transition={{ delay: 0.15 + k * 0.12, duration: 0.35 }}
              className={cn('flex items-start gap-3 rounded-[20px] border px-4 py-3', match ? 'border-sage-200 bg-sage-50' : 'border-paper-edge bg-paper-raised')}
            >
              <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white', match ? 'bg-sage-500' : 'bg-rose-400')}>
                {match ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-small font-semibold text-ink">{prompt(item, false)}</p>
                <p className="text-small text-ink-soft">
                  {kind === 'know_me' ? (
                    <>
                      {iAmSubject ? 'You' : subjectName}: <b className="text-ink">{item.options[truth[k]!]}</b>
                      {!match ? (
                        <>
                          {' '}
                          · {guesser} guessed: <b className="text-ink">{item.options[guess[k]!]}</b>
                        </>
                      ) : null}
                    </>
                  ) : kind === 'most_likely' ? (
                    <>
                      You said <b className="text-ink">{person(mine[k], true)}</b> · {partner.display_name} said <b className="text-ink">{person(theirs[k], false)}</b>
                    </>
                  ) : kind === 'rate_it' ? (
                    <>
                      You: <b className="text-ink">{mine[k]}</b> · {partner.display_name}: <b className="text-ink">{theirs[k]}</b>
                    </>
                  ) : (
                    <>
                      You: <b className="text-ink">{item.options[mine[k]!]}</b> · {partner.display_name}: <b className="text-ink">{item.options[theirs[k]!]}</b>
                    </>
                  )}
                </p>
              </div>
            </motion.li>
          );
        })}
      </ol>
      <BackLink />
    </div>
  );
}

function BackLink() {
  return (
    <div className="flex flex-col items-center gap-3 pt-1">
      <p className="inline-flex items-center gap-1.5 text-small text-ink-soft">
        <Clock className="h-4 w-4" aria-hidden />
        New questions tomorrow
      </p>
      <Link href="/connect" className="font-semibold text-rose-600 hover:text-rose-700">
        Back to Connect
      </Link>
    </div>
  );
}
