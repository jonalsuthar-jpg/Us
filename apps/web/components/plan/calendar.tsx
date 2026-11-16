'use client';

import {
  addDays,
  createEvent,
  daysUntil,
  deleteEvent,
  EVENT_KIND_ORDER,
  EVENT_KINDS,
  eventsByDay,
  formatEventTime,
  fromDateKey,
  listEvents,
  listUpcoming,
  monthGrid,
  personFor,
  PLAN_IDEAS,
  toDateKey,
  updateEvent,
  whenLabel,
  type CalendarEvent,
  type EventKind,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, TextAreaField } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/cn';
import { AddPill, GroupLabel, Pick } from './bits';
import { KIND_STYLE, SLOT_FILL, TONE } from './tones';

type Draft = { id?: string; title: string; date: string; allDay: boolean; start: string; end: string; notes: string; kind: EventKind };

function draftFor(dateKey: string, e?: CalendarEvent, title = ''): Draft {
  if (!e) return { title, date: dateKey, allDay: false, start: '19:00', end: '', notes: '', kind: 'date' };
  const hm = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
  return {
    id: e.id,
    title: e.title,
    date: toDateKey(new Date(e.starts_at)),
    allDay: e.all_day,
    start: e.all_day ? '19:00' : hm(e.starts_at),
    end: e.ends_at && !e.all_day ? hm(e.ends_at) : '',
    notes: e.notes ?? '',
    kind: e.kind ?? 'other',
  };
}

const mondayOf = (d: Date) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -((d.getDay() + 6) % 7));

/** Shared calendar: a week or a month, a countdown to the next big thing, and what's coming up. */
export function PlanCalendar({ adding, onAdded }: { adding?: boolean; onAdded?: () => void }) {
  const ctx = useCouple();
  const { sb, couple, me, mySlot, partnerSlot } = ctx;
  const today = toDateKey(new Date());
  const [view, setView] = useState<'week' | 'month'>('week');
  const [selected, setSelected] = useState(today);
  const [cursor, setCursor] = useState(() => new Date());
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (adding) setDraft(draftFor(today));
  }, [adding]);

  const days = useMemo(() => {
    if (view === 'week') {
      const start = mondayOf(cursor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    return monthGrid(cursor.getFullYear(), cursor.getMonth());
  }, [view, cursor]);
  const from = days[0]!;
  const to = addDays(days[days.length - 1]!, 1);
  const events = useCoupleData('plan:calendar', () => listEvents(sb, couple.id, from, to), [sb, couple.id, from.getTime(), to.getTime()]);
  const upcoming = useCoupleData('plan:calendar', () => listUpcoming(sb, couple.id, new Date(new Date().setHours(0, 0, 0, 0)), 12), [sb, couple.id, 'upcoming', today, true]);
  const byDay = useMemo(() => eventsByDay(events.data ?? []), [events.data]);
  const dayEvents = byDay.get(selected) ?? [];
  const soon = (upcoming.data ?? []).filter((e) => daysUntil(toDateKey(new Date(e.starts_at))) >= 0);
  const big = soon.find((e) => e.kind === 'trip' || e.kind === 'birthday') ?? soon.find((e) => daysUntil(toDateKey(new Date(e.starts_at))) > 0);
  const bigDays = big ? daysUntil(toDateKey(new Date(big.starts_at))) : 0;

  const shift = (n: number) => setCursor((d) => (view === 'week' ? addDays(d, 7 * n) : new Date(d.getFullYear(), d.getMonth() + n, 1)));
  const jump = (k: string) => {
    setSelected(k);
    setCursor(fromDateKey(k));
  };
  const close = () => {
    setDraft(null);
    if (adding) onAdded?.();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Segmented
          label="View"
          className="flex-1 sm:flex-none"
          options={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
          value={view}
          onChange={(v) => {
            setView(v);
            setCursor(fromDateKey(selected));
          }}
        />
        <span className="hidden flex-1 sm:block" />
        <AddPill label="Plan" onClick={() => setDraft(draftFor(selected))} />
      </div>

      {big ? (
        <button
          type="button"
          onClick={() => jump(toDateKey(new Date(big.starts_at)))}
          className="flex w-full items-center gap-4 rounded-sheet bg-gold-50 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          <span className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-paper-raised text-gold-700">
            <span className="text-[26px] font-bold leading-7">{bigDays}</span>
            <span className="text-micro font-medium">{bigDays === 1 ? 'day' : 'days'}</span>
          </span>
          <span className="min-w-0">
            <span className="block font-serif text-small font-light italic text-gold-700">Something to look forward to</span>
            <span className="mt-0.5 block truncate text-lead font-semibold text-ink">{big.title}</span>
            <span className="mt-0.5 block text-micro text-ink-soft">
              {new Date(big.starts_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {formatEventTime(big)}
            </span>
          </span>
        </button>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-sheet border border-paper-edge bg-paper-raised px-3 py-4">
          <div className="mb-2 flex items-center justify-between px-2">
            <h2 className="font-display text-lead text-ink">
              {view === 'week'
                ? `${days[0]!.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${days[6]!.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                : cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </h2>
            <div className="flex">
              <IconButton label={view === 'week' ? 'Previous week' : 'Previous month'} size="sm" onClick={() => shift(-1)}>
                <ChevronLeft className="h-5 w-5" />
              </IconButton>
              <IconButton label={view === 'week' ? 'Next week' : 'Next month'} size="sm" onClick={() => shift(1)}>
                <ChevronRight className="h-5 w-5" />
              </IconButton>
            </div>
          </div>
          <div className="grid grid-cols-7">
            {days.map((d, i) => {
              const key = toDateKey(d);
              const list = byDay.get(key) ?? [];
              const inMonth = view === 'week' || d.getMonth() === cursor.getMonth();
              const isSel = key === selected;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key)}
                  aria-pressed={isSel}
                  aria-label={`${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${list.length ? `, ${list.length} plans` : ''}`}
                  className="flex flex-col items-center gap-0.5 rounded-control py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                >
                  {i < 7 ? <span className="mb-1 text-micro text-ink-muted">{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span> : null}
                  <span
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full text-small transition-colors',
                      key === today ? 'bg-rose-600 font-semibold text-white' : isSel ? 'bg-plum-100 font-semibold text-ink' : inMonth ? 'text-ink hover:bg-paper-sunken' : 'text-ink-muted',
                      key === today && isSel && 'ring-2 ring-plum-300 ring-offset-2 ring-offset-paper-raised',
                    )}
                  >
                    {d.getDate()}
                  </span>
                  <span className="flex h-1.5 gap-0.5">
                    {list.slice(0, 3).map((e) => (
                      <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SLOT_FILL[e.created_by === me.id ? mySlot : partnerSlot] }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <section className="space-y-3">
          <h2 className="font-serif text-lead italic text-ink">{fromDateKey(selected).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          {events.error ? <ErrorNote>{events.error}</ErrorNote> : null}
          {dayEvents.length === 0 ? (
            <div className="space-y-3 rounded-sheet border border-dashed border-paper-edge px-4 py-6 text-center">
              <p className="font-serif text-lead italic text-ink">A free day.</p>
              <p className="text-small text-ink-soft">Keep it free, or try one of these:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {PLAN_IDEAS.slice(0, 3).map((idea) => (
                  <Pick key={idea} selected={false} onClick={() => setDraft(draftFor(selected, undefined, idea))}>
                    <Plus className="h-3.5 w-3.5" /> {idea}
                  </Pick>
                ))}
              </div>
            </div>
          ) : (
            dayEvents.map((e) => {
              const who = personFor(ctx, e.created_by);
              const { tone, Icon } = KIND_STYLE[e.kind ?? 'other'];
              const n = daysUntil(toDateKey(new Date(e.starts_at)));
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setDraft(draftFor(selected, e))}
                  className="flex w-full items-center gap-3 rounded-sheet border border-paper-edge bg-paper-raised p-3 text-left transition-colors hover:bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                >
                  <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', TONE[tone].wash, TONE[tone].ink)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{e.title}</span>
                    <span className="mt-0.5 block text-micro text-ink-soft">
                      {formatEventTime(e)} · {who.mine ? 'you planned it' : `${who.name} planned it`}
                    </span>
                    {e.notes ? <span className="mt-1 line-clamp-2 block text-small text-ink-soft">{e.notes}</span> : null}
                  </span>
                  {n >= 0 ? <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-micro font-semibold', TONE[tone].wash, TONE[tone].ink)}>{whenLabel(n)}</span> : null}
                </button>
              );
            })
          )}
        </section>
      </div>

      {soon.length ? (
        <section className="space-y-1">
          <GroupLabel>Coming up</GroupLabel>
          <ul>
            {soon.slice(0, 6).map((e) => {
              const d = new Date(e.starts_at);
              const tone = KIND_STYLE[e.kind ?? 'other'].tone;
              return (
                <li key={e.id}>
                  <button type="button" onClick={() => jump(toDateKey(d))} className="flex w-full items-center gap-3 border-b border-paper-edge py-2.5 text-left hover:bg-paper-sunken/60">
                    <span className="w-10 text-center">
                      <span className="block text-[10px] font-semibold uppercase text-ink-muted">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                      <span className="block text-lead font-bold text-ink">{d.getDate()}</span>
                    </span>
                    <span className={cn('w-1 self-stretch rounded-full', TONE[tone].wash)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{e.title}</span>
                      <span className="block text-micro text-ink-soft">{formatEventTime(e)}</span>
                    </span>
                    <span className="text-micro text-ink-muted">{whenLabel(daysUntil(toDateKey(d)))}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <Dialog open={!!draft} onOpenChange={(o) => !o && close()} title={draft?.id ? 'Edit plan' : 'New plan'} className="max-h-[92dvh] overflow-y-auto">
        {draft ? (
          <EventForm
            key={draft.id ?? draft.date + draft.title}
            initial={draft}
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
              const row = { title: d.title.trim(), starts_at: starts.toISOString(), ends_at: ends?.toISOString() ?? null, all_day: d.allDay, notes: d.notes.trim() || null, kind: d.kind };
              await events.mutate(() => (d.id ? updateEvent(sb, d.id, row) : createEvent(sb, { ...row, couple_id: couple.id, created_by: me.id })));
              void upcoming.reload();
              jump(d.date);
              close();
            }}
            onDelete={async (id) => {
              await events.mutate(() => deleteEvent(sb, id));
              void upcoming.reload();
              close();
            }}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function EventForm({ initial, onSave, onDelete }: { initial: Draft; onSave: (d: Draft) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
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
      <Field label="What" value={d.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} required autoFocus={!initial.title} placeholder="Dinner at the new place" />
      <div className="space-y-1.5">
        <p className="text-small font-medium text-ink">Kind</p>
        <div className="flex flex-wrap gap-2">
          {EVENT_KIND_ORDER.map((k) => {
            const { tone, Icon } = KIND_STYLE[k];
            return (
              <Pick key={k} selected={d.kind === k} onClick={() => set({ kind: k })}>
                <Icon className={cn('h-4 w-4', d.kind === k && TONE[tone].ink)} /> {EVENT_KINDS[k].label}
              </Pick>
            );
          })}
        </div>
      </div>
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
