'use client';

import { addDays, addLabor, deleteLabor, describeBalance, laborBalance, listLabor, personFor, toDateKey } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { EmptyNote, ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Chip, Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';

const WINDOW_DAYS = 30;
/** The tasks that tend to go unnoticed. */
const SUGGESTIONS = ['Dishes', 'Laundry', 'Groceries', 'Cooking', 'Cleaning', 'Planning ahead', 'Remembering birthdays', 'Bills & admin'];
const EFFORT = ['A little', 'Some', 'A fair bit', 'A lot', 'Huge'];
const SLOT_BAR = { a: 'bg-rose-400', b: 'bg-teal-500' };

export function PlanLabour() {
  const ctx = useCouple();
  const { sb, couple, me, partner, mySlot, partnerSlot } = ctx;
  const since = toDateKey(addDays(new Date(), -WINDOW_DAYS));
  const entries = useCoupleData('plan:labour', () => listLabor(sb, couple.id, since), [sb, couple.id, since]);
  const list = entries.data ?? [];
  const balance = laborBalance(list, couple);
  const myShare = mySlot === 'a' ? balance.aShare : 1 - balance.aShare;

  const [task, setTask] = useState('');
  const [who, setWho] = useState<'me' | 'partner'>('me');
  const [effort, setEffort] = useState(2);
  const [error, setError] = useState<string | null>(null);

  async function log(e: FormEvent) {
    e.preventDefault();
    const text = task.trim();
    if (!text) return;
    setError(null);
    try {
      await entries.mutate(() =>
        addLabor(sb, { couple_id: couple.id, done_by: who === 'me' ? me.id : partner.id, task: text, effort }),
      );
      setTask('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-8">
        <Sheet pad="md" className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-heading text-ink">The last {WINDOW_DAYS} days</h2>
            <span className="text-micro text-ink-muted">a balance, never a scoreboard</span>
          </div>
          <div
            className="flex h-4 overflow-hidden rounded-full bg-paper-sunken"
            role="img"
            aria-label={balance.total ? `You ${Math.round(myShare * 100)}%, ${partner.display_name} ${Math.round((1 - myShare) * 100)}%` : 'Nothing logged yet'}
          >
            {balance.total > 0 && (
              <>
                <span className={cn('h-full transition-[width] duration-gentle ease-out', SLOT_BAR[mySlot])} style={{ width: `${myShare * 100}%` }} />
                <span className={cn('h-full flex-1', SLOT_BAR[partnerSlot])} />
              </>
            )}
          </div>
          <div className="flex justify-between text-small text-ink-soft">
            <span>You</span>
            <span>{partner.display_name}</span>
          </div>
          <p className="font-display text-lead italic text-ink">{describeBalance(myShare, balance.total, partner.display_name)}</p>
        </Sheet>

        <section aria-labelledby="recent-labour" className="space-y-3">
          <h3 id="recent-labour" className="font-display text-lead text-ink">
            Noticed lately
          </h3>
          {list.length === 0 ? (
            <EmptyNote title="Nothing yet">Log something you did — or better, something you saw {partner.display_name} do.</EmptyNote>
          ) : (
            <ul className="divide-y divide-paper-edge rounded-sheet border border-paper-edge bg-paper-raised">
              {list.map((e) => {
                const p = personFor(ctx, e.done_by);
                return (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', SLOT_BAR[p.slot])} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ink">{e.task}</p>
                      <p className="text-micro text-ink-muted">
                        {p.mine ? 'You' : p.name} · {EFFORT[e.effort - 1]?.toLowerCase()} ·{' '}
                        {new Date(e.done_on + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <IconButton label={`Remove ${e.task}`} size="sm" onClick={() => void entries.mutate(() => deleteLabor(sb, e.id)).catch((x) => setError(x.message))}>
                      <X className="h-4 w-4" />
                    </IconButton>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="log-labour">
        <Sheet tone="inset" pad="md">
          <h3 id="log-labour" className="font-display text-lead text-ink">
            Notice something
          </h3>
          <form onSubmit={log} className="mt-4 space-y-4">
            <Field label="What" value={task} onChange={(e) => setTask(e.target.value)} maxLength={200} placeholder="Booked the dentist" />
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <Chip key={s} selected={task === s} onClick={() => setTask(s)} className="px-2.5 py-1 text-micro">
                  {s}
                </Chip>
              ))}
            </div>
            <div className="space-y-1.5">
              <p className="text-small font-medium text-ink">Who did it</p>
              <Segmented
                label="Who did it"
                className="w-full"
                options={[
                  { value: 'me', label: 'Me' },
                  { value: 'partner', label: partner.display_name },
                ]}
                value={who}
                onChange={setWho}
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-small font-medium text-ink">
                Effort · <span className="font-normal text-ink-soft">{EFFORT[effort - 1]}</span>
              </p>
              <input
                type="range"
                min={1}
                max={5}
                value={effort}
                onChange={(e) => setEffort(Number(e.target.value))}
                aria-valuetext={EFFORT[effort - 1]}
                aria-label="Effort"
                className="w-full accent-plum-500"
              />
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" block disabled={!task.trim()}>
              Log it
            </Button>
          </form>
        </Sheet>
      </section>
    </div>
  );
}
