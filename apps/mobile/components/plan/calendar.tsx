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
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { EmptyNote, ErrorNote } from '../module-screen';
import { Button, IconButton } from '../ui/button';
import { cn } from '../ui/cn';
import { Field } from '../ui/field';
import { DateStepper, FormSheet, parseTime } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { Sheet } from '../ui/sheet';
import { Display, Text } from '../ui/text';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const SLOT_DOT = { a: 'bg-rose-400', b: 'bg-teal-500' };

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
  const c = usePalette();
  const today = toDateKey(new Date());
  const [cursor, setCursor] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const [selected, setSelected] = useState(today);
  const [draft, setDraft] = useState<Draft | null>(null);

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const from = grid[0]!;
  const to = addDays(grid[grid.length - 1]!, 1);
  const events = useCoupleData('plan:calendar', () => listEvents(sb, couple.id, from, to), [sb, couple.id, from.getTime()]);
  const byDay = useMemo(() => eventsByDay(events.data ?? []), [events.data]);
  const dayEvents = byDay.get(selected) ?? [];

  const shift = (n: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + n, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  return (
    <View className="gap-5">
      <View>
        <View className="mb-3 flex-row items-center justify-between">
          <Display className="text-heading">
            {new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </Display>
          <View className="flex-row">
            <IconButton label="Previous month" size="sm" onPress={() => shift(-1)}>
              <ChevronLeft size={20} color={c.ink} />
            </IconButton>
            <IconButton label="Next month" size="sm" onPress={() => shift(1)}>
              <ChevronRight size={20} color={c.ink} />
            </IconButton>
          </View>
        </View>
        <View className="flex-row">
          {WEEKDAYS.map((d, i) => (
            <Text key={i} className="flex-1 text-center text-micro text-ink-muted">
              {d}
            </Text>
          ))}
        </View>
        <View className="mt-1 flex-row flex-wrap">
          {grid.map((d) => {
            const key = toDateKey(d);
            const list = byDay.get(key) ?? [];
            const inMonth = d.getMonth() === cursor.month;
            const isSel = key === selected;
            return (
              <Pressable
                key={key}
                onPress={() => setSelected(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={`${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}${list.length ? `, ${list.length} events` : ''}`}
                className="w-[14.28%] items-center py-1"
              >
                <View
                  className={cn(
                    'h-9 w-9 items-center justify-center rounded-full',
                    key === today ? 'bg-rose-600' : isSel ? 'bg-plum-100' : undefined,
                  )}
                >
                  <Text className={cn('text-small', key === today ? 'font-sans-semibold text-white' : inMonth ? 'text-ink' : 'text-ink-muted')}>
                    {d.getDate()}
                  </Text>
                </View>
                <View className="mt-0.5 h-1.5 flex-row gap-0.5">
                  {list.slice(0, 3).map((e) => (
                    <View key={e.id} className={cn('h-1.5 w-1.5 rounded-full', SLOT_DOT[personFor(ctx, e.created_by).slot])} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-3">
        <View className="flex-row items-center justify-between">
          <Display italic className="text-lead">
            {fromDateKey(selected).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </Display>
          <Button size="sm" icon={<Plus size={16} color="#fff" />} onPress={() => setDraft(draftFor(selected))}>
            Add
          </Button>
        </View>
        {events.error ? <ErrorNote>{events.error}</ErrorNote> : null}
        {dayEvents.length === 0 ? (
          <EmptyNote title="Nothing planned">A free day is a plan too.</EmptyNote>
        ) : (
          dayEvents.map((e) => {
            const who = personFor(ctx, e.created_by);
            return (
              <Pressable key={e.id} onPress={() => setDraft(draftFor(selected, e))} accessibilityRole="button" accessibilityLabel={`Edit ${e.title}`}>
                <Sheet tone="note" accent={who.slot === 'a' ? 'rose' : 'teal'} pad="sm">
                  <Text className="text-micro text-ink-muted">{formatEventTime(e)}</Text>
                  <Text className="mt-0.5 font-sans-medium">{e.title}</Text>
                  {e.notes ? (
                    <Text numberOfLines={2} className="mt-1 text-small text-ink-soft">
                      {e.notes}
                    </Text>
                  ) : null}
                  <Text className="mt-2 text-micro text-ink-muted">Added by {who.mine ? 'you' : who.name}</Text>
                </Sheet>
              </Pressable>
            );
          })
        )}
      </View>

      <FormSheet open={!!draft} title={draft?.id ? 'Edit plan' : 'New plan'} onClose={() => setDraft(null)}>
        {draft ? (
          <EventForm
            key={draft.id ?? draft.date}
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
              if (ends && ends < starts) ends = addDays(ends, 1);
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
        ) : null}
      </FormSheet>
    </View>
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
      <Field label="What" value={d.title} onChangeText={(title) => set({ title })} maxLength={200} placeholder="Dinner at the new place" autoFocus />
      <DateStepper label="Day" value={d.date} onChange={(date) => set({ date })} />
      <View className="flex-row items-center justify-between">
        <Text>All day</Text>
        <Switch value={d.allDay} onValueChange={(allDay) => set({ allDay })} trackColor={{ true: c.roseStrong, false: c.edge }} />
      </View>
      {!d.allDay && (
        <View className="flex-row gap-3">
          <Field
            className="flex-1"
            label="From"
            value={d.start}
            onChangeText={(start) => set({ start })}
            placeholder="19:00"
            keyboardType="numbers-and-punctuation"
            error={start === null ? 'Like 19:30' : null}
          />
          <Field
            className="flex-1"
            label="Until (optional)"
            value={d.end}
            onChangeText={(end) => set({ end })}
            placeholder="21:00"
            keyboardType="numbers-and-punctuation"
            error={end === null ? 'Like 21:00' : null}
          />
        </View>
      )}
      <Field label="Notes (optional)" value={d.notes} onChangeText={(notes) => set({ notes })} multiline inputClassName="h-24 py-3" maxLength={2000} />
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button
        loading={busy}
        disabled={!valid}
        onPress={() => run(() => onSave({ ...d, start: start ?? d.start, end: end || '' }))}
      >
        {initial.id ? 'Save' : 'Add to calendar'}
      </Button>
      {initial.id ? (
        <Button variant="quiet" disabled={busy} onPress={() => run(() => onDelete(initial.id!))}>
          Delete
        </Button>
      ) : null}
    </>
  );
}
