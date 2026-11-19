'use client';

import { addDays, addLabor, deleteLabor, describeBalance, laborBalance, laborByTask, listLabor, personFor, setLaborThanked, toDateKey } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { Heart, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { EmptyNote, ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/cn';
import { AddPill, GroupLabel, Initial, Pick, SplitBar } from './bits';
import { SLOT_FILL } from './tones';

const WINDOW_DAYS = 30;
const SUGGESTIONS = ['Cooking', 'Dishes', 'Laundry', 'Groceries', 'Cleaning', 'Planning ahead', 'Remembering birthdays', 'Bills & admin'];
const EFFORT = ['A little', 'Some', 'A fair bit', 'A lot', 'Huge'];

/** The invisible work, made visible: who's been carrying what, and a thank-you for it. */
export function PlanLabour({ adding, onAdded }: { adding?: boolean; onAdded?: () => void }) {
  const ctx = useCouple();
  const { sb, couple, me, partner, mySlot, partnerSlot } = ctx;
  const since = toDateKey(addDays(new Date(), -WINDOW_DAYS));
  const entries = useCoupleData('plan:labour', () => listLabor(sb, couple.id, since), [sb, couple.id, since, true]);
  const [days, setDays] = useState<'7' | '30'>('30');
  const [sheet, setSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: Error) => setError(e.message);

  useEffect(() => {
    if (adding) setSheet(true);
  }, [adding]);

  const cutoff = toDateKey(addDays(new Date(), -Number(days)));
  const list = (entries.data ?? []).filter((e) => e.done_on >= cutoff);
  const balance = laborBalance(list, couple);
  const myShare = mySlot === 'a' ? balance.aShare : 1 - balance.aShare;
  const myPct = Math.round(myShare * 100);
  const tasks = laborByTask(list, couple);
  const R = 52;
  const C = 2 * Math.PI * R;
  const close = () => {
    setSheet(false);
    if (adding) onAdded?.();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Segmented
          label="Period"
          className="flex-1 sm:flex-none"
          options={[
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
          ]}
          value={days}
          onChange={setDays}
        />
        <span className="hidden flex-1 sm:block" />
        <AddPill label="Notice something" onClick={() => setSheet(true)} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4 rounded-sheet border border-paper-edge bg-paper-raised p-5">
          <div className="flex items-center gap-5">
            <div
              role="img"
              aria-label={balance.total ? `You ${myPct}%, ${partner.display_name} ${100 - myPct}%` : 'Nothing logged yet'}
              className="relative flex h-32 w-32 shrink-0 flex-col items-center justify-center"
            >
              <svg width={128} height={128} className="absolute inset-0 text-ink" aria-hidden>
                <circle cx={64} cy={64} r={R} stroke={balance.total ? SLOT_FILL[partnerSlot] : 'currentColor'} strokeOpacity={balance.total ? 1 : 0.08} strokeWidth={16} fill="none" />
                {balance.total ? (
                  <circle
                    cx={64}
                    cy={64}
                    r={R}
                    stroke={SLOT_FILL[mySlot]}
                    strokeWidth={16}
                    fill="none"
                    strokeDasharray={`${myShare * C} ${C}`}
                    transform="rotate(-90 64 64)"
                    className="transition-[stroke-dasharray] duration-500"
                  />
                ) : null}
              </svg>
              <span className="text-micro text-ink-muted">noticed</span>
              <span className="font-display text-[26px] leading-tight text-ink">{list.length}</span>
            </div>
            <div className="space-y-3">
              {[
                { name: 'You', slot: mySlot, pct: myPct },
                { name: partner.display_name, slot: partnerSlot, pct: 100 - myPct },
              ].map((p) => (
                <div key={p.name} className="flex items-center gap-2.5">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: SLOT_FILL[p.slot] }} />
                  <div>
                    <p className="text-small text-ink-soft">{p.name}</p>
                    <p className="font-display text-heading text-ink">{balance.total ? `${p.pct}%` : '–'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="font-serif text-lead italic text-ink">{describeBalance(myShare, balance.total, partner.display_name)}</p>
          <p className="text-micro text-ink-muted">A balance, never a scoreboard.</p>
        </div>

        {tasks.length ? (
          <section className="space-y-3">
            <GroupLabel>Who’s been doing what</GroupLabel>
            <div className="space-y-3 rounded-sheet border border-paper-edge bg-paper-raised p-4">
              {tasks.map((t) => {
                const mine = mySlot === 'a' ? t.a : t.b;
                const theirs = mySlot === 'a' ? t.b : t.a;
                return (
                  <div key={t.task} className="space-y-1.5">
                    <p className="flex justify-between gap-3 text-small">
                      <span className="font-medium text-ink">{t.task}</span>
                      <span className="text-micro text-ink-soft">
                        You {mine} · {partner.display_name} {theirs}
                      </span>
                    </p>
                    <SplitBar left={mine + theirs ? mine / (mine + theirs) : 0.5} leftColor={SLOT_FILL[mySlot]} rightColor={SLOT_FILL[partnerSlot]} />
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>

      <section className="space-y-2">
        <GroupLabel>Noticed lately</GroupLabel>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {list.length === 0 ? (
          <EmptyNote title="Nothing yet">Log something you did, or better, something you saw {partner.display_name} do.</EmptyNote>
        ) : (
          <ul>
            {list.map((e) => {
              const p = personFor(ctx, e.done_by);
              return (
                <li key={e.id} className="flex items-center gap-3 border-b border-paper-edge py-2">
                  <Initial slot={p.slot} name={p.mine ? me.display_name : partner.display_name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-ink">{e.task}</span>
                    <span className="block text-micro text-ink-muted">
                      {p.mine ? 'You' : p.name} · {EFFORT[e.effort - 1]?.toLowerCase()} ·{' '}
                      {new Date(e.done_on + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </span>
                  </span>
                  {p.mine ? (
                    e.thanked_at ? <span className="text-micro font-medium text-rose-700">{partner.display_name} said thanks</span> : null
                  ) : (
                    <button
                      type="button"
                      aria-pressed={!!e.thanked_at}
                      onClick={() => void entries.mutate(() => setLaborThanked(sb, e.id, !e.thanked_at)).catch(fail)}
                      className={cn(
                        'inline-flex h-9 items-center gap-1.5 rounded-full border-[1.5px] px-3 text-micro font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                        e.thanked_at ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-paper-edge text-ink-soft hover:text-ink',
                      )}
                    >
                      <Heart className={cn('h-3.5 w-3.5', e.thanked_at && 'animate-[us-grow_.35s_ease] fill-rose-400 text-rose-500')} />
                      {e.thanked_at ? 'Thanked' : 'Thank'}
                    </button>
                  )}
                  <IconButton label={`Remove ${e.task}`} size="sm" onClick={() => void entries.mutate(() => deleteLabor(sb, e.id)).catch(fail)}>
                    <X className="h-4 w-4" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Dialog open={sheet} onOpenChange={(o) => !o && close()} title="Notice something" description={`Even better when it’s something you saw ${partner.display_name} do.`} className="max-h-[92dvh] overflow-y-auto">
        {sheet ? (
          <NoticeForm
            onSave={async (row) => {
              await entries.mutate(() => addLabor(sb, { couple_id: couple.id, task: row.task, effort: row.effort, done_by: row.mine ? me.id : partner.id }));
              close();
            }}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function NoticeForm({ onSave }: { onSave: (row: { task: string; effort: number; mine: boolean }) => Promise<void> }) {
  const { me, partner, mySlot, partnerSlot } = useCouple();
  const [task, setTask] = useState('');
  const [mine, setMine] = useState(false);
  const [effort, setEffort] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!task.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSave({ task: task.trim(), effort, mine });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="What" value={task} onChange={(e) => setTask(e.target.value)} maxLength={200} placeholder="Booked the dentist" autoFocus />
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <Pick key={s} selected={task === s} onClick={() => setTask(s)}>
            {s}
          </Pick>
        ))}
      </div>
      <div className="space-y-1.5">
        <p className="text-small font-medium text-ink">Who did it</p>
        <div role="radiogroup" aria-label="Who did it" className="grid grid-cols-2 gap-2.5">
          {[
            { v: false, name: partner.display_name, label: partner.display_name, slot: partnerSlot },
            { v: true, name: me.display_name, label: 'Me', slot: mySlot },
          ].map((o) => (
            <button
              key={String(o.v)}
              type="button"
              role="radio"
              aria-checked={mine === o.v}
              onClick={() => setMine(o.v)}
              className={cn('flex h-14 items-center gap-2.5 rounded-control border-[1.5px] px-3 font-medium text-ink', mine === o.v ? 'border-plum-400 bg-plum-50' : 'border-paper-edge bg-paper-raised')}
            >
              <Initial slot={o.slot} name={o.name} size={28} />
              <span className="truncate">{o.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="flex justify-between text-small">
          <span className="font-medium text-ink">Effort</span>
          <span className="font-semibold text-ink">{EFFORT[effort - 1]}</span>
        </p>
        <div role="radiogroup" aria-label="Effort" className="grid grid-cols-5 gap-1.5">
          {EFFORT.map((label, i) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={effort === i + 1}
              aria-label={label}
              title={label}
              onClick={() => setEffort(i + 1)}
              className={cn('h-11 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400', i < effort ? 'bg-sage-400' : 'bg-paper-sunken')}
            />
          ))}
        </div>
      </div>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button type="submit" block loading={busy} disabled={!task.trim()}>
        Log it
      </Button>
    </form>
  );
}
