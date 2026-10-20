'use client';

import {
  addCountdown,
  COUNTDOWN_PRESETS,
  deleteCountdown,
  describeDaysLeft,
  fromDateKey,
  toDateKey,
  updateCountdown,
  upcoming,
  type Countdown,
} from '@us/shared';
import { useCouple } from '@us/shared/react';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Chip } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';

const longDate = (key: string) => fromDateKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' });

/** Trips, birthdays and "100 days together", soonest first. */
export function ComingUp({ countdowns, mutate }: { countdowns: Countdown[]; mutate: <R>(write: () => Promise<R>) => Promise<R> }) {
  const { couple } = useCouple();
  const [editing, setEditing] = useState<Countdown | 'new' | null>(null);
  const items = upcoming(countdowns, couple.paired_at, new Date(), 5);

  return (
    <Sheet pad="md" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-heading text-ink">Coming up</h2>
        <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Countdown
        </Button>
      </div>
      <ul className="space-y-2">
        {items.map((u) => {
          const inner = (
            <>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-50 text-[22px]" aria-hidden>
                {u.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">
                  {u.title}
                  {u.kind === 'countdown' && u.years > 0 ? <span className="font-normal text-ink-muted"> · {u.years}</span> : null}
                </span>
                <span className="block text-micro text-ink-muted">{longDate(u.date)}</span>
              </span>
              <span className={cn('shrink-0 text-right font-display text-lead', u.daysLeft <= 1 ? 'text-rose-700' : 'text-ink')}>
                {u.daysLeft > 1 ? (
                  <>
                    {u.daysLeft}
                    <span className="block text-micro font-sans text-ink-muted">days</span>
                  </>
                ) : (
                  describeDaysLeft(u.daysLeft)
                )}
              </span>
            </>
          );
          return (
            <li key={u.key}>
              {u.countdown ? (
                <button
                  type="button"
                  onClick={() => setEditing(u.countdown!)}
                  className="flex w-full items-center gap-3 rounded-control p-2 text-left hover:bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                >
                  {inner}
                </button>
              ) : (
                <div className="flex items-center gap-3 p-2">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing === 'new' ? 'New countdown' : 'Countdown'}
        description="You both see it on Home."
      >
        {editing ? <CountdownForm initial={editing === 'new' ? null : editing} mutate={mutate} onDone={() => setEditing(null)} /> : null}
      </Dialog>
    </Sheet>
  );
}

function CountdownForm({
  initial,
  mutate,
  onDone,
}: {
  initial: Countdown | null;
  mutate: <R>(write: () => Promise<R>) => Promise<R>;
  onDone: () => void;
}) {
  const { sb, couple, me } = useCouple();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [date, setDate] = useState(initial?.on_date ?? toDateKey(new Date()));
  const [yearly, setYearly] = useState(initial?.yearly ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await mutate(fn);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    const row = { title: title.trim(), emoji: emoji.trim() || null, on_date: date, yearly };
    void run(() => (initial ? updateCountdown(sb, initial.id, row) : addCountdown(sb, { ...row, couple_id: couple.id, created_by: me.id })));
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {!initial ? (
        <div className="flex flex-wrap gap-2">
          {COUNTDOWN_PRESETS.map((p) => (
            <Chip
              key={p.title}
              selected={title === p.title && emoji === p.emoji}
              onClick={() => {
                setTitle(p.title);
                setEmoji(p.emoji);
                setYearly(p.yearly);
              }}
            >
              <span aria-hidden>{p.emoji}</span> {p.title}
            </Chip>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-[5rem_1fr] gap-3">
        <Field label="Emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} className="text-center text-lead" />
        <Field label="What" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Lisbon" required />
      </div>
      <Field label={yearly ? 'Date (any year, e.g. a birth date)' : 'Date'} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      <label className="flex items-center gap-2 text-small text-ink">
        <input type="checkbox" checked={yearly} onChange={(e) => setYearly(e.target.checked)} className="h-4 w-4 accent-rose-600" />
        Every year (birthdays, anniversaries)
      </label>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <div className="flex items-center justify-between gap-3">
        {initial ? (
          <Button type="button" variant="quiet" disabled={busy} onClick={() => window.confirm('Delete this countdown?') && void run(() => deleteCountdown(sb, initial.id))}>
            Delete
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" loading={busy} disabled={!title.trim() || !date}>
          {initial ? 'Save' : 'Add countdown'}
        </Button>
      </div>
    </form>
  );
}
