'use client';

import { knowMePrompt, knowMeQuestion, QUIZ_INFO, quizOptions, quizScore, quizState, quizVerdict } from '@us/shared';
import { useCouple, useQuizzes } from '@us/shared/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { Confetti } from './confetti';

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

  const info = QUIZ_INFO[round.kind];
  const state = quizState(round);
  const iAmSubject = round.subject_id === me.id;
  const subjectName = iAmSubject ? me.display_name : partner.display_name;
  const prompt = (qid: string, mine: boolean) => {
    if (round.kind === 'this_or_that') return 'This or that?';
    const q = knowMeQuestion(qid);
    return q ? knowMePrompt(q, subjectName, mine && iAmSubject) : '';
  };

  const header = (
    <header className="flex items-center gap-3">
      <Link href="/connect" aria-label="Back to Connect" className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-paper-sunken hover:text-ink">
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-micro font-semibold uppercase tracking-[0.08em] text-teal-700">Quiz</p>
        <h1 className="font-display text-title text-ink">
          {info.emoji} {info.title}
        </h1>
      </div>
    </header>
  );

  if (state === 'mine') {
    const i = picks.length;
    const done = i >= round.questions.length;
    const qid = round.questions[Math.min(i, round.questions.length - 1)]!;
    const options = quizOptions(round.kind, qid);
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
      <div className="mx-auto max-w-xl space-y-6 px-5 py-6 sm:py-10">
        {header}
        {round.kind === 'know_me' ? (
          <p className="rounded-[18px] bg-teal-50 px-4 py-3 text-small text-teal-800">
            {iAmSubject ? `Answer honestly about yourself. ${partner.display_name} will try to guess.` : `Guess what ${partner.display_name} will say about themselves.`}
          </p>
        ) : null}
        <div className="flex gap-1" aria-label={`Question ${Math.min(i + 1, round.questions.length)} of ${round.questions.length}`}>
          {round.questions.map((_, k) => (
            <span key={k} className={cn('h-1.5 flex-1 rounded-full', k < i ? 'bg-teal-500' : k === i ? 'bg-teal-300' : 'bg-paper-sunken')} />
          ))}
        </div>
        {!done ? (
          <AnimatePresence mode="wait">
            <motion.div
              key={qid}
              initial={{ opacity: 0, x: 40, rotate: 2 }}
              animate={{ opacity: 1, x: 0, rotate: 0 }}
              exit={{ opacity: 0, x: -40, rotate: -2 }}
              transition={{ duration: 0.22 }}
              className="space-y-4 rounded-[28px] border border-paper-edge bg-paper-raised p-6 shadow-[0_18px_40px_-28px_rgba(36,25,51,0.5)]"
            >
              <p className="font-display text-heading text-ink">{prompt(qid, true)}</p>
              <div className={cn('grid gap-2.5', round.kind === 'this_or_that' ? 'grid-cols-2' : 'grid-cols-1')}>
                {options.map((o, k) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setPicks((p) => [...p, k])}
                    className={cn(
                      'rounded-[18px] border-2 border-paper-edge px-4 text-left font-semibold text-ink transition-colors hover:border-teal-400 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                      round.kind === 'this_or_that' ? 'flex h-28 items-center justify-center text-center text-lead' : 'py-3.5',
                    )}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="space-y-3 text-center">
            <p className="font-serif text-lead italic text-ink-soft">All done. Send them off?</p>
            {error ? <p className="text-small text-rose-700">{error}</p> : null}
          </div>
        )}
        <div className="flex justify-between">
          <Button variant="quiet" size="sm" disabled={!i || sending} onClick={() => setPicks((p) => p.slice(0, -1))}>
            Back
          </Button>
          {done ? (
            <Button disabled={sending} onClick={() => void submit()}>
              {sending ? 'Sending…' : 'Send my answers'}
            </Button>
          ) : null}
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
          <p className="mt-1 text-small text-ink-soft">We’ll show you both once {partner.display_name} has answered too.</p>
        </div>
      </div>
    );
  }

  const score = quizScore(round.my_answers, round.partner_answers);
  const total = round.questions.length;
  // Know me: the subject's picks are the truth; the other's are the guesses.
  const truth = iAmSubject ? round.my_answers! : round.partner_answers!;
  const guess = iAmSubject ? round.partner_answers! : round.my_answers!;
  const guesser = iAmSubject ? partner.display_name : 'You';

  return (
    <div className="mx-auto max-w-xl space-y-6 px-5 py-6 sm:py-10">
      {score / total >= 0.7 ? <Confetti key={round.id} /> : null}
      {header}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        className="rounded-[28px] bg-teal-600 px-6 py-8 text-center text-white"
      >
        <p className="font-display text-[56px] leading-none">
          {score}
          <span className="text-[28px] opacity-70">/{total}</span>
        </p>
        <p className="mt-2 text-lead font-semibold">{quizVerdict(round.kind, score, total)}</p>
        <p className="mt-1 text-small opacity-80">
          {round.kind === 'know_me' ? `${guesser} guessed ${score} right about ${subjectName === me.display_name ? 'you' : subjectName}` : `You agreed on ${score} of ${total}`}
        </p>
      </motion.div>
      <ol className="space-y-2.5">
        {round.questions.map((qid, k) => {
          const options = quizOptions(round.kind, qid);
          const match = round.kind === 'know_me' ? truth[k] === guess[k] : round.my_answers![k] === round.partner_answers![k];
          return (
            <motion.li
              key={qid}
              initial={{ opacity: 0, rotateX: -80 }}
              animate={{ opacity: 1, rotateX: 0 }}
              transition={{ delay: 0.15 + k * 0.12, duration: 0.35 }}
              className={cn('rounded-[20px] border px-4 py-3', match ? 'border-sage-200 bg-sage-50' : 'border-paper-edge bg-paper-raised')}
            >
              <div className="flex items-start gap-3">
                <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white', match ? 'bg-sage-500' : 'bg-rose-400')}>
                  {match ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-small font-semibold text-ink">{round.kind === 'know_me' ? prompt(qid, false) : `${options[0]} or ${options[1]}?`}</p>
                  {round.kind === 'know_me' ? (
                    <p className="text-small text-ink-soft">
                      {subjectName === me.display_name ? 'You' : subjectName}: <b className="text-ink">{options[truth[k]!]}</b>
                      {!match ? (
                        <>
                          {' '}
                          · {guesser} guessed: <b className="text-ink">{options[guess[k]!]}</b>
                        </>
                      ) : null}
                    </p>
                  ) : (
                    <p className="text-small text-ink-soft">
                      You: <b className="text-ink">{options[round.my_answers![k]!]}</b> · {partner.display_name}: <b className="text-ink">{options[round.partner_answers![k]!]}</b>
                    </p>
                  )}
                </div>
              </div>
            </motion.li>
          );
        })}
      </ol>
      <div className="flex justify-center">
        <Link href="/connect#play" className="font-semibold text-rose-600 hover:text-rose-700">
          Play another
        </Link>
      </div>
    </div>
  );
}

