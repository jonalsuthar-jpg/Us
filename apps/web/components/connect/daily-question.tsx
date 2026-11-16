'use client';

import { answerDaily, dailyState, DAILY_ANSWER_MAX, fromDateKey, getDaily, type DailyEntry } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { Hourglass, Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorNote } from '@/components/app/module-header';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextAreaField } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';

export const dayLabel = (key: string, long = false) =>
  fromDateKey(key).toLocaleDateString(undefined, long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });

/** Today's question and recent days. Connect and the archive share one load. */
export function useDaily() {
  const { sb } = useCouple();
  return useCoupleData('connect:daily', () => getDaily(sb), [sb]);
}

/** Today's question: the prompt, a sealed answer, and both answers once we have each written ours. */
export function TodayQuestion({ daily }: { daily: ReturnType<typeof useDaily> }) {
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
    <Sheet pad="none" className="space-y-4 rounded-[26px] p-5 shadow-[0_18px_40px_-32px_rgba(36,25,51,0.55)] sm:space-y-5 sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-small font-semibold text-teal-700">
          <span className="h-2 w-2 rounded-full bg-teal-500" aria-hidden />
          {dayLabel(today.for_date)}
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-plum-50 px-2.5 py-1 text-micro font-medium text-plum-600">
          <Lock className="h-3 w-3" aria-hidden />
          <span>
            Hidden until both<span className="sr-only"> of you have answered</span>
          </span>
        </span>
      </div>
      <p className="text-balance font-serif text-[24px] leading-[1.25] text-ink sm:text-[30px] sm:leading-tight">{today.prompt}</p>

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
        <AnswerBubbles entry={today} partnerName={partner.display_name} />
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

/** Today, once mine is in: my answer, and theirs beside it when they have answered too. */
function AnswerBubbles({ entry, partnerName }: { entry: DailyEntry; partnerName: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-[88%] self-start whitespace-pre-wrap rounded-[18px] rounded-bl-md bg-rose-50 px-4 py-2.5 text-body text-ink">
        <span className="block text-micro font-bold text-rose-700">You</span>
        {entry.my_answer}
      </div>
      {entry.partner_answer !== null ? (
        <div className="max-w-[88%] self-end whitespace-pre-wrap rounded-[18px] rounded-br-md bg-teal-50 px-4 py-2.5 text-body text-ink">
          <span className="block text-micro font-bold text-teal-700">{partnerName}</span>
          {entry.partner_answer}
        </div>
      ) : (
        <p className="inline-flex items-center gap-2 text-small text-ink-muted">
          <Hourglass className="h-4 w-4" aria-hidden />
          You’ll see {partnerName}’s when they answer.
        </p>
      )}
    </div>
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
