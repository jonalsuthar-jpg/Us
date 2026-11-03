'use client';

import { QUIZ_INFO, quizState, type QuizKind } from '@us/shared';
import { useCouple, useFeature, useQuizzes } from '@us/shared/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';

const QUIZ_TINT: Record<QuizKind, string> = {
  know_me: 'border-teal-100 bg-teal-50',
  this_or_that: 'border-sage-100 bg-sage-50',
};

/** Connect's quizzes: the two to start, and any round waiting on one of us. */
export function PlaySection() {
  const on = useFeature('quizzes');
  const { me, partner } = useCouple();
  const quizzes = useQuizzes(on);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [knowMe, setKnowMe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!on) return null;

  const openQuiz = async (kind: QuizKind, subject?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      router.push(`/connect/play/quiz/${await quizzes.start(kind, subject)}`);
    } catch {
      setError('Couldn’t start that. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const waiting = quizzes.rounds
    .filter((r) => quizState(r) !== 'revealed')
    .map((r) => ({ round: r, mine: quizState(r) === 'mine' }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || b.round.created_at.localeCompare(a.round.created_at));

  return (
    <section id="quizzes" aria-labelledby="quizzes-title" className="space-y-3">
      <h2 id="quizzes-title" className="font-display text-heading text-ink">
        Quizzes
      </h2>

      {waiting.length ? (
        <ul className="flex gap-2.5 overflow-x-auto pb-1">
          {waiting.slice(0, 8).map(({ round: r, mine }) => (
            <li key={r.id} className="shrink-0">
              <Link
                href={`/connect/play/quiz/${r.id}`}
                className={cn('flex flex-col rounded-[18px] border px-3.5 py-2.5', mine ? 'border-rose-200 bg-rose-50' : 'border-paper-edge bg-paper-raised')}
              >
                <span className="text-small font-semibold text-ink">
                  {QUIZ_INFO[r.kind].emoji} {QUIZ_INFO[r.kind].title}
                </span>
                <span className={cn('text-micro', mine ? 'font-semibold text-rose-700' : 'text-ink-soft')}>{mine ? 'Your turn to answer' : `Waiting for ${partner.display_name}`}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {(Object.keys(QUIZ_INFO) as QuizKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={busy}
            onClick={() => (kind === 'know_me' ? setKnowMe(true) : void openQuiz(kind))}
            className={cn(
              'flex h-[132px] flex-col justify-between rounded-[24px] border p-4 text-left transition-transform active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
              QUIZ_TINT[kind],
            )}
          >
            <span className="text-[30px] leading-none" aria-hidden>
              {QUIZ_INFO[kind].emoji}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="font-display text-[17px] leading-[21px] text-ink">{QUIZ_INFO[kind].title}</span>
              <span className="text-micro text-ink-soft">{QUIZ_INFO[kind].blurb}</span>
            </span>
          </button>
        ))}
      </div>
      {error ? <p className="text-small text-rose-700">{error}</p> : null}

      <Dialog open={knowMe} onOpenChange={setKnowMe} title="How well do you know me?" description="One of you answers about yourself, the other guesses. Ten questions.">
        <div className="grid gap-2.5">
          {[
            { title: 'About me', line: `I answer, ${partner.display_name} guesses`, subject: me.id },
            { title: `About ${partner.display_name}`, line: `${partner.display_name} answers, I guess`, subject: partner.id },
          ].map((o) => (
            <button
              key={o.subject}
              type="button"
              onClick={() => {
                setKnowMe(false);
                void openQuiz('know_me', o.subject);
              }}
              className="rounded-[18px] border-2 border-paper-edge px-4 py-3 text-left hover:border-teal-400 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              <span className="block font-semibold text-ink">{o.title}</span>
              <span className="block text-small text-ink-soft">{o.line}</span>
            </button>
          ))}
        </div>
      </Dialog>
    </section>
  );
}
