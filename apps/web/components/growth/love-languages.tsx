'use client';

import {
  ideaOfTheDay,
  LOVE_LANGUAGE_QUIZ,
  LOVE_LANGUAGES,
  loveLanguageResults,
  rankedLanguages,
  saveLoveLanguage,
  scoreLoveLanguages,
  setLoveLanguageShared,
  type LoveLanguage,
  type LoveLanguageResult,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { Lightbulb } from 'lucide-react';
import { useState } from 'react';
import { ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';

export function GrowthLoveLanguages() {
  const { sb, me, partner } = useCouple();
  const results = useCoupleData('growth:love-languages', () => loveLanguageResults(sb, me.id), [sb, me.id]);
  const [taking, setTaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = results.data?.mine ?? null;
  const theirs = results.data?.partner ?? null;

  if (taking || (!results.loading && !mine)) {
    return (
      <Quiz
        onCancel={mine ? () => setTaking(false) : undefined}
        onDone={async (answers, share) => {
          const { scores, primary } = scoreLoveLanguages(answers);
          await results.mutate(() => saveLoveLanguage(sb, { owner_id: me.id, scores, primary_language: primary, shared: share }));
          setTaking(false);
        }}
        partnerName={partner.display_name}
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section aria-labelledby="ll-mine" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ll-mine" className="font-display text-heading text-ink">
            How you feel loved
          </h2>
          <PrivacyBadge privacy={mine?.shared ? 'shared' : 'private'} partnerName={partner.display_name} />
        </div>
        {mine && <Result result={mine} />}
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex flex-wrap gap-2">
          {mine && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void results.mutate(() => setLoveLanguageShared(sb, me.id, !mine.shared)).catch((e) => setError(e.message))}
            >
              {mine.shared ? `Stop sharing with ${partner.display_name}` : `Share with ${partner.display_name}`}
            </Button>
          )}
          <Button variant="quiet" size="sm" onClick={() => setTaking(true)}>
            Retake the quiz
          </Button>
        </div>
      </section>

      <section aria-labelledby="ll-theirs" className="space-y-4">
        <h2 id="ll-theirs" className="font-display text-heading text-ink">
          How {partner.display_name} feels loved
        </h2>
        {theirs ? (
          <>
            <Result result={theirs} />
            <Sheet tone="note" accent="sage" pad="sm" className="flex gap-3">
              <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-sage-700" aria-hidden />
              <div>
                <p className="text-micro font-medium text-sage-700">A gentle idea for today</p>
                <p className="mt-1 text-ink">{ideaOfTheDay(theirs.primary_language)}</p>
              </div>
            </Sheet>
          </>
        ) : (
          <Sheet tone="inset" pad="md">
            <p className="font-display text-lead italic text-ink">Not shared yet.</p>
            <p className="mt-1 text-small text-ink-soft">
              If {partner.display_name} takes the quiz and chooses to share, you’ll see what helps them feel loved — and an idea now and then.
            </p>
          </Sheet>
        )}
      </section>
    </div>
  );
}

function Result({ result }: { result: LoveLanguageResult }) {
  const ranked = rankedLanguages(result.scores);
  const scores = (result.scores ?? {}) as Partial<Record<LoveLanguage, number>>;
  const max = Math.max(1, ...Object.values(scores).map((n) => n ?? 0));
  const top = LOVE_LANGUAGES[result.primary_language];
  return (
    <Sheet pad="md" className="space-y-4">
      <div>
        <p className="font-display text-[32px] italic leading-tight text-ink">{top.title}</p>
        <p className="mt-1 text-small text-ink-soft">{top.blurb}</p>
      </div>
      <ul className="space-y-2">
        {ranked.map((l) => (
          <li key={l} className="grid grid-cols-[64px_1fr] items-center gap-3 text-small">
            <span className="text-ink-soft">{LOVE_LANGUAGES[l].title}</span>
            <span className="h-2 overflow-hidden rounded-full bg-paper-sunken">
              <span className={cn('block h-full rounded-full', l === result.primary_language ? 'bg-rose-400' : 'bg-plum-200')} style={{ width: `${((scores[l] ?? 0) / max) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function Quiz({
  onDone,
  onCancel,
  partnerName,
}: {
  onDone: (answers: ('a' | 'b')[], share: boolean) => Promise<void>;
  onCancel?: () => void;
  partnerName: string;
}) {
  const [answers, setAnswers] = useState<('a' | 'b')[]>([]);
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const i = answers.length;
  const q = LOVE_LANGUAGE_QUIZ[i];
  const total = LOVE_LANGUAGE_QUIZ.length;

  return (
    <Sheet pad="lg" className="mx-auto max-w-xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-small text-ink-muted">{q ? `${i + 1} of ${total}` : 'All done'}</p>
        <PrivacyBadge privacy="private" partnerName={partnerName} />
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-paper-sunken">
        <div className="h-full bg-rose-400 transition-[width] duration-base" style={{ width: `${(i / total) * 100}%` }} />
      </div>
      {q ? (
        <>
          <h2 className="font-display text-heading text-ink">Which would mean more to you?</h2>
          <div className="grid gap-3">
            {(['a', 'b'] as const).map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => setAnswers([...answers, side])}
                className="rounded-control border border-paper-edge bg-paper-raised px-5 py-4 text-left text-ink transition-colors hover:border-rose-300 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              >
                {q[side].text}
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <Button variant="quiet" size="sm" disabled={i === 0} onClick={() => setAnswers(answers.slice(0, -1))}>
              Back
            </Button>
            {onCancel && (
              <Button variant="quiet" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <h2 className="font-display text-heading text-ink">That’s everything.</h2>
          <label className="flex items-start gap-3 text-small text-ink">
            <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-0.5 h-4 w-4 accent-rose-600" />
            <span>
              Share my result with {partnerName}
              <span className="block text-micro text-ink-soft">You can change this any time.</span>
            </span>
          </label>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex justify-between">
            <Button variant="quiet" onClick={() => setAnswers(answers.slice(0, -1))}>
              Back
            </Button>
            <Button
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDone(answers, share);
                } catch (e) {
                  setError((e as Error).message);
                  setBusy(false);
                }
              }}
            >
              See my result
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
