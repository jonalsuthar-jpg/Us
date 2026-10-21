'use client';

import {
  addDays,
  createEvent,
  deleteEvent,
  eventsByDay,
  formatEventTime,
  fromDateKey,
  listEvents,
  monthGrid,
  personFor,
  toDateKey,
  updateEvent,
  type CalendarEvent,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { EmptyNote, ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, TextAreaField } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SLOT_DOT = { a: 'bg-rose-400', b: 'bg-teal-500' };
const SLOT_CHIP = { a: 'bg-rose-50 text-rose-800', b: 'bg-teal-50 text-teal-800' };

type Draft = { id?: string; title: string; date: string; allDay: boolean; start: string; end: string; notes: string };

function draftFor(dateKey: string, e?: CalendarEvent): Draft {
  if (!e) return { title: '', date: dateKey, allDay: false, start: '19:00', end: '', notes: '' };
  const hm = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
  return {
    id: e.id,
    title: e.title,
    date: toDateKey(new Date(e.starts_at)),
    allDay: e.all_day,
    start: e.all_day ? '19:00' : hm(e.starts_at),
    end: e.ends_at && !e.all_day ? hm(e.ends_at) : '',
    notes: e.notes ?? '',
  };
}

export function PlanCalendar() {
  const ctx = useCouple();
  const { sb, couple, me } = ctx;
  const today = toDateKey(new Date());
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selected, setSelected] = useState(today);
  const [draft, setDraft] = useState<Draft | null>(null);

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const from = grid[0]!;
  const to = addDays(grid[grid.length - 1]!, 1);
  const events = useCoupleData('plan:calendar', () => listEvents(sb, couple.id, from, to), [sb, couple.id, from.getTime()]);
  const byDay = useMemo(() => eventsByDay(events.data ?? []), [events.data]);
  const dayEvents = byDay.get(selected) ?? [];

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shift = (n: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + n, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section aria-label="Month">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-heading text-ink">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                const d = new Date();
                setCursor({ year: d.getFullYear(), month: d.getMonth() });
                setSelected(today);
              }}
            >
              Today
            </Button>
            <IconButton label="Previous month" size="sm" onClick={() => shift(-1)}>
              <ChevronLeft className="h-5 w-5" />
            </IconButton>
            <IconButton label="Next month" size="sm" onClick={() => shift(1)}>
              <ChevronRight className="h-5 w-5" />
            </IconButton>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-sheet border border-paper-edge bg-paper-edge">
          {WEEKDAYS.map((d) => (
            <div key={d} className="bg-paper-sunken py-2 text-center text-micro font-medium text-ink-muted">
              {d}
            </div>
          ))}
          {grid.map((d) => {
            const key = toDateKey(d);
            const list = byDay.get(key) ?? [];
            const inMonth = d.getMonth() === cursor.month;
            const isSelected = key === selected;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(key)}
                onDoubleClick={() => setDraft(draftFor(key))}
                aria-pressed={isSelected}
                aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${list.length ? `, ${list.length} event${list.length > 1 ? 's' : ''}` : ''}`}
                className={cn(
                  'flex min-h-[64px] flex-col items-stretch gap-1 bg-paper-raised p-1.5 text-left transition-colors sm:min-h-[92px]',
                  'focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                  !inMonth && 'bg-paper text-ink-muted',
                  isSelected && 'bg-plum-50',
                )}
              >
                <span
                  className={cn(
                    'inline-flex h-6 w-6 items-center justify-center self-start rounded-full text-small',
                    key === today ? 'bg-rose-600 font-semibold text-white' : inMonth ? 'text-ink' : 'text-ink-muted',
                  )}
                >
                  {d.getDate()}
                </span>
                {/* Titles on wide screens, dots on narrow ones. */}
                <span className="hidden flex-col gap-0.5 sm:flex">
                  {list.slice(0, 2).map((e) => (
                    <span key={e.id} className={cn('truncate rounded-hair px-1 py-px text-[11px] leading-4', SLOT_CHIP[personFor(ctx, e.created_by).slot])}>
                      {e.title}
                    </span>
                  ))}
                  {list.length > 2 && <span className="px-1 text-[11px] text-ink-muted">+{list.length - 2} more</span>}
                </span>
                <span className="flex gap-0.5 px-1 sm:hidden">
                  {list.slice(0, 3).map((e) => (
                    <span key={e.id} className={cn('h-1.5 w-1.5 rounded-full', SLOT_DOT[personFor(ctx, e.created_by).slot])} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        {events.error && <div className="mt-3"><ErrorNote>{events.error}</ErrorNote></div>}
      </section>

      <section aria-label="Selected day" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-serif text-lead italic text-ink">
            {fromDateKey(selected).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </h3>
          <Button size="sm" onClick={() => setDraft(draftFor(selected))}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        {dayEvents.length === 0 ? (
          <EmptyNote title="Nothing planned">A free day is a plan too.</EmptyNote>
        ) : (
          <ul className="space-y-2">
            {dayEvents.map((e) => {
              const who = personFor(ctx, e.created_by);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setDraft(draftFor(selected, e))}
                    className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 rounded-sheet"
                  >
                    <Sheet tone="note" accent={who.slot === 'a' ? 'rose' : 'teal'} pad="sm" className="hover:bg-paper-sunken">
                      <p className="text-micro font-medium text-ink-muted">{formatEventTime(e)}</p>
                      <p className="mt-0.5 font-medium text-ink">{e.title}</p>
                      {e.notes ? <p className="mt-1 line-clamp-2 text-small text-ink-soft">{e.notes}</p> : null}
                      <p className="mt-2 text-micro text-ink-muted">Added by {who.mine ? 'you' : who.name}</p>
                    </Sheet>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <EventDialog
        draft={draft}
        onClose={() => setDraft(null)}
        onSave={async (d) => {
          const day = fromDateKey(d.date);
          const at = (hm: string) => {
            const [h, m] = hm.split(':').map(Number);
            const x = new Date(day);
            x.setHours(h!, m!, 0, 0);
            return x;
          };
          const starts = d.allDay ? day : at(d.start);
          let ends = d.allDay || !d.end ? null : at(d.end);
          if (ends && ends < starts) ends = addDays(ends, 1); // e.g. 22:00 – 01:00
          const row = {
            title: d.title.trim(),
            starts_at: starts.toISOString(),
            ends_at: ends?.toISOString() ?? null,
            all_day: d.allDay,
            notes: d.notes.trim() || null,
          };
          await events.mutate(() =>
            d.id ? updateEvent(sb, d.id, row) : createEvent(sb, { ...row, couple_id: couple.id, created_by: me.id }),
          );
          setSelected(d.date);
          setDraft(null);
        }}
        onDelete={async (id) => {
          await events.mutate(() => deleteEvent(sb, id));
          setDraft(null);
        }}
      />
    </div>
  );
}

function EventDialog({
  draft,
  onClose,
  onSave,
  onDelete,
}: {
  draft: Draft | null;
  onClose: () => void;
  onSave: (d: Draft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <Dialog open={!!draft} onOpenChange={(o) => !o && onClose()} title={draft?.id ? 'Edit plan' : 'New plan'}>
      {draft ? <EventForm key={draft.id ?? draft.date} initial={draft} onSave={onSave} onDelete={onDelete} /> : null}
    </Dialog>
  );
}

function EventForm({
  initial,
  onSave,
  onDelete,
}: {
  initial: Draft;
  onSave: (d: Draft) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(d);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="What" value={d.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} required autoFocus placeholder="Dinner at the new place" />
      <Field label="Day" type="date" value={d.date} onChange={(e) => e.target.value && set({ date: e.target.value })} required />
      <label className="flex items-center gap-2 text-small text-ink">
        <input type="checkbox" checked={d.allDay} onChange={(e) => set({ allDay: e.target.checked })} className="h-4 w-4 accent-rose-600" />
        All day
      </label>
      {!d.allDay && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" type="time" value={d.start} onChange={(e) => set({ start: e.target.value })} required />
          <Field label="Until (optional)" type="time" value={d.end} onChange={(e) => set({ end: e.target.value })} />
        </div>
      )}
      <TextAreaField label="Notes (optional)" value={d.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} maxLength={2000} />
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex items-center justify-between gap-3 pt-2">
        {initial.id ? (
          <Button
            type="button"
            variant="quiet"
            onClick={async () => {
              setBusy(true);
              try {
                await onDelete(initial.id!);
              } catch (err) {
                setError((err as Error).message);
                setBusy(false);
              }
            }}
            disabled={busy}
          >
            Delete
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" loading={busy} disabled={!d.title.trim()}>
          {initial.id ? 'Save' : 'Add to calendar'}
        </Button>
      </div>
    </form>
  );
}
