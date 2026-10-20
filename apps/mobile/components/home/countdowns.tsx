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
import { useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';
import { ErrorNote } from '../module-screen';
import { Button } from '../ui/button';
import { cn } from '../ui/cn';
import { Field } from '../ui/field';
import { FormSheet } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { Chip } from '../ui/segmented';
import { Sheet } from '../ui/sheet';
import { Display, Text } from '../ui/text';

type Mutate = <R>(write: () => Promise<R>) => Promise<R>;

const longDate = (key: string) => fromDateKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' });

/** Trips, birthdays and "100 days together", soonest first. */
export function ComingUp({ countdowns, mutate }: { countdowns: Countdown[]; mutate: Mutate }) {
  const { couple } = useCouple();
  const [editing, setEditing] = useState<Countdown | 'new' | null>(null);
  const items = upcoming(countdowns, couple.paired_at, new Date(), 5);

  return (
    <Sheet className="gap-3">
      <View className="flex-row items-center justify-between">
        <Display className="text-heading">Coming up</Display>
        <Button size="sm" variant="secondary" onPress={() => setEditing('new')}>
          + Countdown
        </Button>
      </View>
      {items.map((u) => {
        const inner = (
          <View className="flex-row items-center gap-3 py-1.5">
            <View className="h-11 w-11 items-center justify-center rounded-full bg-gold-50">
              <Text className="text-[22px] leading-[28px]">{u.emoji}</Text>
            </View>
            <View className="flex-1">
              <Text className="font-sans-medium" numberOfLines={1}>
                {u.title}
                {u.kind === 'countdown' && u.years > 0 ? <Text className="text-ink-muted">{` · ${u.years}`}</Text> : null}
              </Text>
              <Text className="text-micro text-ink-muted">{longDate(u.date)}</Text>
            </View>
            {u.daysLeft > 1 ? (
              <View className="items-end">
                <Display className="text-lead">{String(u.daysLeft)}</Display>
                <Text className="text-micro text-ink-muted">days</Text>
              </View>
            ) : (
              <Display className="text-lead text-rose-700">{describeDaysLeft(u.daysLeft)}</Display>
            )}
          </View>
        );
        return u.countdown ? (
          <Pressable key={u.key} accessibilityRole="button" accessibilityHint="Edit countdown" onPress={() => setEditing(u.countdown!)}>
            {inner}
          </Pressable>
        ) : (
          <View key={u.key}>{inner}</View>
        );
      })}
      <FormSheet open={editing !== null} title={editing === 'new' ? 'New countdown' : 'Countdown'} onClose={() => setEditing(null)}>
        {editing ? <CountdownForm initial={editing === 'new' ? null : editing} mutate={mutate} onDone={() => setEditing(null)} /> : null}
      </FormSheet>
    </Sheet>
  );
}

/** Day / month / year as typed numbers → "YYYY-MM-DD", or null if it isn't a real date. */
function toKey(day: string, month: string, year: string): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y) || y < 1900 || y > 2200) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return toDateKey(date);
}

function CountdownForm({ initial, mutate, onDone }: { initial: Countdown | null; mutate: Mutate; onDone: () => void }) {
  const { sb, couple, me } = useCouple();
  const c = usePalette();
  const start = fromDateKey(initial?.on_date ?? toDateKey(new Date()));
  const [title, setTitle] = useState(initial?.title ?? '');
  const [emoji, setEmoji] = useState(initial?.emoji ?? '');
  const [day, setDay] = useState(String(start.getDate()));
  const [month, setMonth] = useState(String(start.getMonth() + 1));
  const [year, setYear] = useState(String(start.getFullYear()));
  const [yearly, setYearly] = useState(initial?.yearly ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = toKey(day, month, year);

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

  return (
    <>
      {!initial ? (
        <View className="flex-row flex-wrap gap-2">
          {COUNTDOWN_PRESETS.map((p) => (
            <Chip
              key={p.title}
              selected={title === p.title && emoji === p.emoji}
              onPress={() => {
                setTitle(p.title);
                setEmoji(p.emoji);
                setYearly(p.yearly);
              }}
            >
              {`${p.emoji} ${p.title}`}
            </Chip>
          ))}
        </View>
      ) : null}
      <View className="flex-row gap-3">
        <Field label="Emoji" value={emoji} onChangeText={setEmoji} maxLength={8} className="w-20" inputClassName="text-center text-lead" />
        <Field label="What" value={title} onChangeText={setTitle} maxLength={80} placeholder="e.g. Lisbon" className="flex-1" />
      </View>
      <View className="flex-row gap-3">
        <Field label="Day" value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} className="flex-1" />
        <Field label="Month" value={month} onChangeText={setMonth} keyboardType="number-pad" maxLength={2} className="flex-1" />
        <Field label="Year" value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} className="flex-[1.4]" />
      </View>
      <Text className={cn('text-small', key ? 'text-ink-soft' : 'text-rose-700')}>{key ? longDate(key) : 'That isn’t a real date yet.'}</Text>
      <View className="flex-row items-center justify-between">
        <Text className="flex-1">Every year (birthdays, anniversaries)</Text>
        <Switch value={yearly} onValueChange={setYearly} trackColor={{ true: c.roseStrong }} accessibilityLabel="Every year" />
      </View>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button
        loading={busy}
        disabled={!title.trim() || !key}
        onPress={() => {
          const row = { title: title.trim(), emoji: emoji.trim() || null, on_date: key!, yearly };
          void run(() => (initial ? updateCountdown(sb, initial.id, row) : addCountdown(sb, { ...row, couple_id: couple.id, created_by: me.id })));
        }}
      >
        {initial ? 'Save' : 'Add countdown'}
      </Button>
      {initial ? (
        <Button
          variant="quiet"
          disabled={busy}
          onPress={() =>
            Alert.alert('Delete this countdown?', undefined, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => void run(() => deleteCountdown(sb, initial.id)) },
            ])
          }
        >
          Delete
        </Button>
      ) : null}
    </>
  );
}
