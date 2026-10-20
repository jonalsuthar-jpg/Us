'use client';

import { answerDaily, dailyState, DAILY_ANSWER_MAX, fromDateKey, getDaily, type DailyEntry } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { Flame, Hourglass } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { EmptyNote, ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { TextAreaField } from '@/components/ui/field';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Sheet } from '@/components/ui/sheet';

const day = (key: string) => fromDateKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export function DailyQuestion() {
  const { sb, me, partner } = useCouple();
  const daily = useCoupleData('connect:daily', () => getDaily(sb), [sb]);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (daily.error && !daily.data) return <ErrorNote>{daily.error}</ErrorNote>;
  if (!daily.data) return <Sheet tone="inset" pad="lg" className="h-48 animate-pulse" aria-busy />;

  const { today, past, streak } = daily.data;
  const state = dailyState(today);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    if (!window.confirm(`Send it? Answers are sealed once sent, and ${partner.display_name} sees yours once they’ve answered too.`)) return;
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Sheet tone="note" accent="teal" pad="lg" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-small font-medium text-teal-700">Today’s question</p>
          <PrivacyBadge privacy="private-until-reveal" partnerName={partner.display_name} />
        </div>
        <h2 className="text-balance font-display text-[28px] leading-tight text-ink">{today.prompt}</h2>

        {state === 'ask' || state === 'nudge' ? (
          <form onSubmit={send} className="space-y-4">
            {state === 'nudge' && (
              <p className="text-small text-ink-soft">
                {partner.display_name} has answered. Answer yours to see what they said.
              </p>
            )}
            <TextAreaField
              label="Your answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={4}
              maxLength={DAILY_ANSWER_MAX}
              hint="Hidden until you’ve both answered. Sealed once sent."
            />
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" disabled={!answer.trim()} loading={sending}>
              Send my answer
            </Button>
          </form>
        ) : (
          <Answers entry={today} myName={me.display_name} partnerName={partner.display_name} />
        )}
      </Sheet>

      <aside className="space-y-4">
        {streak > 1 && (
          <Sheet tone="inset" pad="sm" className="flex items-center gap-3">
            <Flame className="h-5 w-5 text-gold-700" aria-hidden />
            <p className="text-small text-ink">
              <span className="font-medium">{streak} days</span> in a row, both of you.
            </p>
          </Sheet>
        )}
        <h3 className="font-display text-lead text-ink">Earlier days</h3>
        {past.length === 0 ? (
          <EmptyNote title="Just getting started">Your answers collect here, a little archive of the two of you.</EmptyNote>
        ) : (
          <ul className="space-y-3">
            {past.slice(0, 14).map((e) => (
              <li key={e.question_id}>
                <Sheet tone="inset" pad="sm" className="space-y-2">
                  <p className="text-micro text-ink-muted">{day(e.for_date)}</p>
                  <p className="font-display text-body text-ink">{e.prompt}</p>
                  <Answers entry={e} myName={me.display_name} partnerName={partner.display_name} compact />
                </Sheet>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

function Answers({ entry, myName, partnerName, compact }: { entry: DailyEntry; myName: string; partnerName: string; compact?: boolean }) {
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
