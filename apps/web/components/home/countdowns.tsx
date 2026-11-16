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
import { cn } from '@/lib/cn';

/** Each countdown gets its own wash, so the list reads at a glance. */
const TONES = [
  { wash: 'bg-teal-50', ink: 'text-teal-700' },
  { wash: 'bg-rose-50', ink: 'text-rose-700' },
  { wash: 'bg-gold-50', ink: 'text-gold-700' },
  { wash: 'bg-plum-50', ink: 'text-plum-600' },
  { wash: 'bg-sage-50', ink: 'text-sage-700' },
];

const longDate = (key: string) => fromDateKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' });

/** Trips, birthdays and "100 days together", soonest first. */
export function ComingUp({ countdowns, mutate }: { countdowns: Countdown[]; mutate: <R>(write: () => Promise<R>) => Promise<R> }) {
  const { couple } = useCouple();
  const [editing, setEditing] = useState<Countdown | 'new' | null>(null);
  const items = upcoming(countdowns, couple.paired_at, new Date(), 5);

  return (
    <section className="space-y-3 rounded-[26px] border border-paper-edge bg-paper-raised p-4 shadow-[0_18px_36px_-26px_rgba(99,72,130,0.55)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 font-display text-[20px] font-extrabold text-ink">
          <span aria-hidden className="h-5 w-1 rounded-full bg-gold-400" />
          Coming up
        </h2>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-1 rounded-full bg-gold-50 px-3 py-1.5 text-small font-extrabold text-gold-700 hover:bg-gold-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          <Plus className="h-4 w-4" strokeWidth={2.6} /> Countdown
        </button>
      </div>
      <ul className="space-y-1">
        {items.map((u, i) => {
          const tone = TONES[i % TONES.length]!;
          const inner = (
            <>
              <span className={cn('flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[15px] text-[22px]', tone.wash)} aria-hidden>
                {u.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">
                  {u.title}
                  {u.kind === 'countdown' && u.years > 0 ? <span className="font-normal text-ink-muted"> · {u.years}</span> : null}
                </span>
                <span className="block text-micro text-ink-muted">{longDate(u.date)}</span>
              </span>
              {u.daysLeft > 1 ? (
                <span className={cn('min-w-[56px] shrink-0 rounded-[14px] px-2.5 py-1.5 text-center', tone.wash, tone.ink)}>
                  <span className="block text-[18px] font-extrabold leading-5">{u.daysLeft}</span>
                  <span className="text-[10px] font-bold">days</span>
                </span>
              ) : (
                <span className="shrink-0 rounded-[14px] bg-rose-600 px-3 py-2 text-small font-extrabold text-white">{describeDaysLeft(u.daysLeft)}</span>
              )}
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
    </section>
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
