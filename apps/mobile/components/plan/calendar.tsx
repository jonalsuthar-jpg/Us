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
  deviceTimeZone,
  REMINDERS,
  REPEATS,
  skipOccurrence,
  type PlanEvent,
  whenLabel,
  type CalendarEvent,
  type EventKind,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { ErrorNote } from '../module-screen';
import { Button, IconButton } from '../ui/button';
import { cn } from '../ui/cn';
import { Field } from '../ui/field';
import { DateStepper, FormSheet, parseTime } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { Segmented } from '../ui/segmented';
import { Display, Text } from '../ui/text';
import { AddPill, GroupLabel, Pick } from './bits';
import { KIND_STYLE, SLOT_FILL, TONE, toneIcon } from './tones';

type Draft = {
  id?: string;
  title: string;
  date: string;
  allDay: boolean;
  start: string;
  end: string;
  notes: string;
  kind: EventKind;
  repeat: CalendarEvent['repeat'];
  remind: number | null;
  /** Opened from one occurrence of a repeating plan: "Just this one" can take it out. */
  occurrence?: Pick<PlanEvent, 'series_id' | 'occurrence' | 'skip_dates'>;
};

function draftFor(dateKey: string, e?: CalendarEvent | PlanEvent, title = ''): Draft {
  if (!e) return { title, date: dateKey, allDay: false, start: '19:00', end: '', notes: '', kind: 'date', repeat: 'none', remind: null };
  const hm = (iso: string) => new Date(iso).toTimeString().slice(0, 5);
  const occ = 'series_id' in e && e.repeat !== 'none' ? { series_id: e.series_id, occurrence: e.occurrence, skip_dates: e.skip_dates } : undefined;
  return {
    id: e.id,
    repeat: e.repeat ?? 'none',
    remind: e.remind_before ?? null,
    occurrence: occ,
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

export function PlanCalendar({ adding, onAdded }: { adding?: boolean; onAdded?: () => void }) {
  const ctx = useCouple();
  const { sb, couple, me, mySlot, partnerSlot } = ctx;
  const c = usePalette();
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

  const shift = (n: number) =>
    setCursor((d) => (view === 'week' ? addDays(d, 7 * n) : new Date(d.getFullYear(), d.getMonth() + n, 1)));
  const save = async (d: Draft) => {
    const day = fromDateKey(d.date);
    const at = (hm: string) => {
      const [h, m] = hm.split(':').map(Number);
      const x = new Date(day);
      x.setHours(h!, m!, 0, 0);
      return x;
    };
    const starts = d.allDay ? day : at(d.start);
    let ends = d.allDay || !d.end ? null : at(d.end);
    if (ends && ends < starts) ends = addDays(ends, 1);
    const row = {
      title: d.title.trim(),
      starts_at: starts.toISOString(),
      ends_at: ends?.toISOString() ?? null,
      all_day: d.allDay,
      notes: d.notes.trim() || null,
      kind: d.kind,
      repeat: d.repeat,
      // Repeats land on this calendar (see recurrence.ts).
      repeat_tz: deviceTimeZone(),
      remind_before: d.remind,
    };
    await events.mutate(() => (d.id ? updateEvent(sb, d.id, row) : createEvent(sb, { ...row, couple_id: couple.id, created_by: me.id })));
    void upcoming.reload();
    setSelected(d.date);
    setCursor(fromDateKey(d.date));
    setDraft(null);
    onAdded?.();
  };

  return (
    <View className="gap-5">
      <View className="flex-row items-center gap-3">
        <Segmented
          className="flex-1"
          label="View"
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
        <AddPill label="Plan" onPress={() => setDraft(draftFor(selected))} />
      </View>

      {big ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const k = toDateKey(new Date(big.starts_at));
            setSelected(k);
            setCursor(fromDateKey(k));
          }}
          className="flex-row items-center gap-4 rounded-sheet bg-gold-50 p-4"
        >
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-paper-raised">
            <Text className="font-sans-bold text-[26px] leading-[30px] text-gold-700">{daysUntil(toDateKey(new Date(big.starts_at)))}</Text>
            <Text className="text-micro font-sans-medium text-gold-700">{daysUntil(toDateKey(new Date(big.starts_at))) === 1 ? 'day' : 'days'}</Text>
          </View>
          <View className="flex-1">
            <Display light italic className="text-small text-gold-700">
              Something to look forward to
            </Display>
            <Text numberOfLines={1} className="mt-0.5 font-sans-semibold text-lead">
              {big.title}
            </Text>
            <Text className="mt-0.5 text-micro text-ink-soft">
              {new Date(big.starts_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {formatEventTime(big)}
            </Text>
          </View>
        </Pressable>
      ) : null}

      <View className="rounded-sheet border border-paper-edge bg-paper-raised px-2 py-3">
        <View className="mb-2 flex-row items-center justify-between px-2">
          <Display className="text-lead">
            {view === 'week'
              ? `${days[0]!.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${days[6]!.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
              : cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </Display>
          <View className="flex-row">
            <IconButton label={view === 'week' ? 'Previous week' : 'Previous month'} size="sm" onPress={() => shift(-1)}>
              <ChevronLeft size={20} color={c.ink} />
            </IconButton>
            <IconButton label={view === 'week' ? 'Next week' : 'Next month'} size="sm" onPress={() => shift(1)}>
              <ChevronRight size={20} color={c.ink} />
            </IconButton>
          </View>
        </View>
        <View className="flex-row flex-wrap">
          {days.map((d, i) => {
            const key = toDateKey(d);
            const list = byDay.get(key) ?? [];
            const inMonth = view === 'week' || d.getMonth() === cursor.getMonth();
            const isSel = key === selected;
            return (
              <Pressable
                key={key}
                onPress={() => setSelected(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={`${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${list.length ? `, ${list.length} plans` : ''}`}
                className="w-[14.28%] items-center gap-0.5 py-1"
              >
                {i < 7 ? <Text className="mb-1 text-micro text-ink-muted">{d.toLocaleDateString(undefined, { weekday: 'narrow' })}</Text> : null}
                <View
                  className={cn(
                    'h-9 w-9 items-center justify-center rounded-full',
                    key === today ? 'bg-rose-600' : isSel ? 'bg-plum-100' : undefined,
                    key === today && isSel && 'border-2 border-plum-300',
                  )}
                >
                  <Text className={cn('text-small', key === today ? 'font-sans-semibold text-white' : isSel ? 'font-sans-semibold' : inMonth ? '' : 'text-ink-muted')}>
                    {d.getDate()}
                  </Text>
                </View>
                <View className="h-1.5 flex-row gap-0.5">
                  {list.slice(0, 3).map((e) => (
                    <View key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SLOT_FILL[e.created_by === me.id ? mySlot : partnerSlot] }} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-2.5">
        <Display italic className="text-lead">
          {fromDateKey(selected).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Display>
        {events.error ? <ErrorNote>{events.error}</ErrorNote> : null}
        {dayEvents.length === 0 ? (
          <View className="items-center gap-3 rounded-sheet border border-dashed border-paper-edge px-4 py-5">
            <Display italic className="text-lead">
              A free day.
            </Display>
            <Text className="text-small text-ink-soft">Keep it free, or try one of these:</Text>
            <View className="flex-row flex-wrap justify-center gap-2">
              {PLAN_IDEAS.slice(0, 3).map((idea) => (
                <Pick key={idea} selected={false} onPress={() => setDraft(draftFor(selected, undefined, idea))} icon={<Plus size={14} color={c.inkSoft} />}>
                  {idea}
                </Pick>
              ))}
            </View>
          </View>
        ) : (
          dayEvents.map((e) => eventRow(e))
        )}
      </View>

      {soon.length ? (
        <View className="gap-1">
          <GroupLabel>Coming up</GroupLabel>
          {soon.slice(0, 6).map((e) => {
            const d = new Date(e.starts_at);
            const tone = KIND_STYLE[e.kind ?? 'other'].tone;
            return (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                onPress={() => {
                  const k = toDateKey(d);
                  setSelected(k);
                  setCursor(d);
                }}
                className="flex-row items-center gap-3 border-b border-paper-edge py-2.5"
              >
                <View className="w-10 items-center">
                  <Text className="font-sans-semibold text-[10px] uppercase text-ink-muted">{d.toLocaleDateString(undefined, { weekday: 'short' })}</Text>
                  <Text className="font-sans-bold text-lead">{d.getDate()}</Text>
                </View>
                <View className={cn('w-1 self-stretch rounded-full', TONE[tone].wash)} />
                <View className="flex-1">
                  <Text numberOfLines={1} className="font-sans-semibold">
                    {e.title}
                  </Text>
                  <Text className="text-micro text-ink-soft">{formatEventTime(e)}</Text>
                </View>
                <Text className="text-micro text-ink-muted">{whenLabel(daysUntil(toDateKey(d)))}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <FormSheet open={!!draft} title={draft?.id ? 'Edit plan' : 'New plan'} onClose={() => (setDraft(null), adding && onAdded?.())}>
        {draft ? (
          <EventForm
            key={draft.id ?? draft.date + draft.title}
            initial={draft}
            onSave={save}
            onDelete={async (id, justThis) => {
              await events.mutate(() => (justThis && draft.occurrence ? skipOccurrence(sb, draft.occurrence) : deleteEvent(sb, id)));
              void upcoming.reload();
              setDraft(null);
            }}
          />
        ) : null}
      </FormSheet>
    </View>
  );

  function eventRow(e: CalendarEvent) {
    const who = personFor(ctx, e.created_by);
    const { tone, Icon } = KIND_STYLE[e.kind ?? 'other'];
    const n = daysUntil(toDateKey(new Date(e.starts_at)));
    return (
      <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`Edit ${e.title}`} onPress={() => setDraft(draftFor(selected, e))} className="flex-row items-center gap-3 rounded-sheet border border-paper-edge bg-paper-raised p-3 active:bg-paper-sunken">
        <View className={cn('h-11 w-11 items-center justify-center rounded-2xl', TONE[tone].wash)}>
          <Icon size={20} color={toneIcon(c, tone)} />
        </View>
        <View className="flex-1">
          <Text className="font-sans-semibold">{e.title}</Text>
          <Text className="mt-0.5 text-micro text-ink-soft">
            {formatEventTime(e)} · {who.mine ? 'you planned it' : `${who.name} planned it`}
          </Text>
          {e.notes ? (
            <Text numberOfLines={2} className="mt-1 text-small text-ink-soft">
              {e.notes}
            </Text>
          ) : null}
        </View>
        {n >= 0 ? (
          <View className={cn('rounded-full px-2.5 py-1', TONE[tone].wash)}>
            <Text className={cn('font-sans-semibold text-micro', TONE[tone].ink)}>{whenLabel(n)}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }
}

function EventForm({ initial, onSave, onDelete }: { initial: Draft; onSave: (d: Draft) => Promise<void>; onDelete: (id: string, justThis: boolean) => Promise<void> }) {
  const c = usePalette();
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const start = parseTime(d.start);
  const end = d.end ? parseTime(d.end) : '';
  const valid = !!d.title.trim() && (d.allDay || (start !== null && end !== null));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <Field label="What" value={d.title} onChangeText={(title) => set({ title })} maxLength={200} placeholder="Dinner at the new place" autoFocus={!initial.title} />
      <View className="gap-1.5">
        <Text className="font-sans-medium text-small">Kind</Text>
        <View className="flex-row flex-wrap gap-2">
          {EVENT_KIND_ORDER.map((k) => {
            const { tone, Icon } = KIND_STYLE[k];
            return (
              <Pick key={k} selected={d.kind === k} onPress={() => set({ kind: k })} icon={<Icon size={15} color={d.kind === k ? toneIcon(c, tone) : c.inkSoft} />}>
                {EVENT_KINDS[k].label}
              </Pick>
            );
          })}
        </View>
      </View>
      <DateStepper label="Day" value={d.date} onChange={(date) => set({ date })} />
      <View className="flex-row items-center justify-between">
        <Text>All day</Text>
        <Switch value={d.allDay} onValueChange={(allDay) => set({ allDay })} trackColor={{ true: c.roseStrong, false: c.edge }} />
      </View>
      {!d.allDay && (
        <View className="flex-row gap-3">
          <Field className="flex-1" label="From" value={d.start} onChangeText={(start) => set({ start })} placeholder="19:00" keyboardType="numbers-and-punctuation" error={start === null ? 'Like 19:30' : null} />
          <Field className="flex-1" label="Until (optional)" value={d.end} onChangeText={(end) => set({ end })} placeholder="21:00" keyboardType="numbers-and-punctuation" error={end === null ? 'Like 21:00' : null} />
        </View>
      )}
      <View className="gap-1.5">
        <Text className="font-sans-medium text-small">Repeats</Text>
        <View className="flex-row flex-wrap gap-2">
          {REPEATS.map((r) => (
            <Pick key={r.value} selected={d.repeat === r.value} onPress={() => set({ repeat: r.value })}>
              {r.label}
            </Pick>
          ))}
        </View>
        {initial.occurrence ? <Text className="text-micro text-ink-muted">Changes apply to every time it repeats.</Text> : null}
      </View>
      <View className="gap-1.5">
        <Text className="font-sans-medium text-small">Remind us</Text>
        <View className="flex-row flex-wrap gap-2">
          {REMINDERS.filter((r) => !d.allDay || r.value === null || r.value === 1440 || r.value === 0).map((r) => (
            <Pick key={String(r.value)} selected={d.remind === r.value} onPress={() => set({ remind: r.value })}>
              {d.allDay && r.value === 0 ? 'That morning' : r.label}
            </Pick>
          ))}
        </View>
      </View>
      <Field label="Notes (optional)" value={d.notes} onChangeText={(notes) => set({ notes })} multiline inputClassName="h-24 py-3" maxLength={2000} />
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button loading={busy} disabled={!valid} onPress={() => run(() => onSave({ ...d, start: start ?? d.start, end: end || '' }))}>
        {initial.id ? 'Save' : 'Add to calendar'}
      </Button>
      {initial.id && initial.occurrence ? (
        <Button variant="quiet" disabled={busy} onPress={() => run(() => onDelete(initial.id!, true))}>
          Delete this one
        </Button>
      ) : null}
      {initial.id ? (
        <Button variant="quiet" disabled={busy} onPress={() => run(() => onDelete(initial.id!, false))}>
          {initial.occurrence ? 'Delete all' : 'Delete'}
        </Button>
      ) : null}
    </>
  );
}
