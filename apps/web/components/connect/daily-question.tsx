'use client';

import { answerDaily, dailyState, DAILY_ANSWER_MAX, fromDateKey, getDaily, type DailyEntry } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { ChevronRight, Flame, Hourglass } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ErrorNote } from '@/components/app/module-header';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextAreaField } from '@/components/ui/field';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Sheet } from '@/components/ui/sheet';

export const dayLabel = (key: string, long = false) =>
  fromDateKey(key).toLocaleDateString(undefined, long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });

/** Today's question and recent days. Connect and the archive share one load. */
export function useDaily() {
  const { sb } = useCouple();
  return useCoupleData('connect:daily', () => getDaily(sb), [sb]);
}

/** Today's question, with Our answers beside it. */
export function DailyQuestion() {
  const daily = useDaily();
  if (daily.error && !daily.data) return <ErrorNote>{daily.error}</ErrorNote>;
  if (!daily.data)
    return (
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]" aria-busy>
        <Sheet tone="inset" pad="lg" className="h-72 animate-pulse" />
        <Sheet tone="inset" pad="lg" className="h-72 animate-pulse" />
      </div>
    );
  return (
    <section aria-label="Daily question" className="grid gap-5 lg:grid-cols-[2fr_1fr]">
      <TodayQuestion daily={daily} />
      <AnswersCard past={daily.data.past} streak={daily.data.streak} together={daily.data.together} />
    </section>
  );
}

function TodayQuestion({ daily }: { daily: ReturnType<typeof useDaily> }) {
  const { sb, me, partner, partnerSlot } = useCouple();
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const today = daily.data!.today;
  const state = dailyState(today);

  async function send() {
    setConfirming(false);
    setError(null);
    setSending(true);
    try {
      await daily.mutate(() => answerDaily(sb, { question_id: today.question_id, owner_id: me.id, answer }));
      setAnswer('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet pad="none" className="space-y-5 rounded-[24px] p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-small font-semibold text-teal-700">
          <span className="h-2 w-2 rounded-full bg-teal-500" aria-hidden />
          Today’s question · {dayLabel(today.for_date)}
        </p>
        <PrivacyBadge privacy="private-until-reveal" partnerName={partner.display_name} />
      </div>
      <h2 className="text-balance font-serif text-[28px] leading-tight text-ink sm:text-[32px]">{today.prompt}</h2>

      {state === 'ask' || state === 'nudge' ? (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (answer.trim()) setConfirming(true);
          }}
          className="space-y-4"
        >
          {state === 'nudge' && (
            <p className="flex items-center gap-2.5 rounded-control bg-teal-50 px-3.5 py-2.5 text-small text-teal-800">
              <Avatar name={partner.display_name} slot={partnerSlot} size="sm" className="[&>span]:ring-0 [&>span]:ring-offset-0" />
              <span>
                <b className="font-semibold">{partner.display_name} has answered.</b> Write yours to see what they said.
              </span>
            </p>
          )}
          <TextAreaField
            label="Your answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={3}
            maxLength={DAILY_ANSWER_MAX}
            placeholder="Take your time…"
            hint="Hidden until you’ve both answered. Sealed once sent."
          />
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex justify-end">
            <Button type="submit" disabled={!answer.trim()} loading={sending} className="bg-teal-600 hover:bg-teal-700">
              Send my answer
            </Button>
          </div>
        </form>
      ) : (
        <Answers entry={today} myName={me.display_name} partnerName={partner.display_name} />
      )}

      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Send your answer?"
        description={`Answers are sealed once sent. ${partner.display_name} sees yours once they’ve answered too.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={() => setConfirming(false)}>
            Not yet
          </Button>
          <Button className="bg-teal-600 hover:bg-teal-700" onClick={() => void send()}>
            Send
          </Button>
        </div>
      </Dialog>
    </Sheet>
  );
}

/** Streak, how many we've answered together, and the last few prompts. Opens the archive. */
function AnswersCard({ past, streak, together }: { past: DailyEntry[]; streak: number; together: number }) {
  return (
    <Link
      href="/connect/questions"
      className="group flex flex-col gap-4 rounded-[24px] bg-gold-50 p-6 text-ink transition-shadow hover:shadow-[0_12px_32px_-18px_rgba(124,80,6,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
    >
      <span className="flex items-center justify-between">
        <span className="text-small font-semibold text-gold-700">Our answers</span>
        <ChevronRight className="h-5 w-5 text-gold-700 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
      <span className="flex items-baseline gap-2.5">
        <span className="font-display text-[52px] leading-none tracking-tight">{together}</span>
        <span className="text-small text-ink-soft">{together === 1 ? 'question answered together' : 'questions answered together'}</span>
      </span>
      {streak > 1 ? (
        <span className="inline-flex items-center gap-2 self-start rounded-full bg-paper-raised px-3 py-1.5 text-micro font-semibold">
          <Flame className="h-4 w-4 text-gold-500" aria-hidden />
          {streak} days in a row
        </span>
      ) : null}
      {past.length ? (
        <ul className="space-y-2">
          {past.slice(0, 3).map((e) => (
            <li key={e.question_id} className="truncate rounded-control bg-paper-raised px-3 py-2.5 font-serif text-small">
              {e.prompt}
            </li>
          ))}
        </ul>
      ) : (
        <span className="font-serif text-small italic text-ink-soft">Your answers collect here, a little archive of the two of you.</span>
      )}
      <span className="mt-auto text-small font-semibold text-gold-700">Open our answers</span>
    </Link>
  );
}

export function Answers({ entry, myName, partnerName, compact }: { entry: DailyEntry; myName: string; partnerName: string; compact?: boolean }) {
  const text = compact ? 'text-small' : 'text-body';
  return (
    <dl className={compact ? 'space-y-2' : 'space-y-4'}>
      <div>
        <dt className="text-micro font-medium text-ink-muted">{myName}</dt>
        <dd className={`whitespace-pre-wrap text-ink ${text}`}>{entry.my_answer ?? <span className="italic text-ink-muted">Didn’t answer</span>}</dd>
      </div>
      <div>
        <dt className="text-micro font-medium text-ink-muted">{partnerName}</dt>
        <dd className={`whitespace-pre-wrap text-ink ${text}`}>
          {entry.partner_answer ?? (
            <span className="inline-flex items-center gap-1.5 italic text-ink-muted">
              <Hourglass className="h-3.5 w-3.5" aria-hidden />
              {entry.partner_answered
                ? compact
                  ? 'Answered. It stays hidden, since you didn’t.'
                  : 'Answered. Answer yours to see it.'
                : compact
                  ? 'Didn’t answer'
                  : 'Not yet. You’ll see it here once they answer.'}
            </span>
          )}
        </dd>
      </div>
    </dl>
  );
}
