import { addDays, addLabor, deleteLabor, describeBalance, laborBalance, listLabor, personFor, toDateKey } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { EmptyNote, ErrorNote, SectionTitle } from '../module-screen';
import { Button, IconButton } from '../ui/button';
import { cn } from '../ui/cn';
import { Field } from '../ui/field';
import { usePalette } from '../ui/palette';
import { Chip, Segmented } from '../ui/segmented';
import { Sheet } from '../ui/sheet';
import { Display, Text } from '../ui/text';

const WINDOW_DAYS = 30;
const SUGGESTIONS = ['Dishes', 'Laundry', 'Groceries', 'Cooking', 'Cleaning', 'Planning ahead', 'Remembering birthdays', 'Bills & admin'];
const EFFORT = ['A little', 'Some', 'A fair bit', 'A lot', 'Huge'];
const SLOT_BAR = { a: 'bg-rose-400', b: 'bg-teal-500' };

export function PlanLabour() {
  const ctx = useCouple();
  const { sb, couple, me, partner, mySlot, partnerSlot } = ctx;
  const c = usePalette();
  const since = toDateKey(addDays(new Date(), -WINDOW_DAYS));
  const entries = useCoupleData('plan:labour', () => listLabor(sb, couple.id, since), [sb, couple.id, since]);
  const list = entries.data ?? [];
  const balance = laborBalance(list, couple);
  const myShare = mySlot === 'a' ? balance.aShare : 1 - balance.aShare;

  const [task, setTask] = useState('');
  const [who, setWho] = useState<'me' | 'partner'>('me');
  const [effort, setEffort] = useState('2');
  const [error, setError] = useState<string | null>(null);

  return (
    <View className="gap-6">
      <Sheet className="gap-3">
        <Display className="text-heading">The last {WINDOW_DAYS} days</Display>
        <View
          accessible
          accessibilityLabel={balance.total ? `You ${Math.round(myShare * 100)}%, ${partner.display_name} ${Math.round((1 - myShare) * 100)}%` : 'Nothing logged yet'}
          className="h-4 flex-row overflow-hidden rounded-full bg-paper-sunken"
        >
          {balance.total > 0 ? (
            <>
              <View className={cn('h-full', SLOT_BAR[mySlot])} style={{ width: `${myShare * 100}%` }} />
              <View className={cn('h-full flex-1', SLOT_BAR[partnerSlot])} />
            </>
          ) : null}
        </View>
        <View className="flex-row justify-between">
          <Text className="text-small text-ink-soft">You</Text>
          <Text className="text-small text-ink-soft">{partner.display_name}</Text>
        </View>
        <Display italic className="text-lead">
          {describeBalance(myShare, balance.total, partner.display_name)}
        </Display>
        <Text className="text-micro text-ink-muted">A balance, never a scoreboard.</Text>
      </Sheet>

      <Sheet tone="inset" className="gap-4">
        <SectionTitle>Notice something</SectionTitle>
        <Field label="What" value={task} onChangeText={setTask} maxLength={200} placeholder="Booked the dentist" />
        <View className="flex-row flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <Chip key={s} selected={task === s} onPress={() => setTask(s)} className="px-2.5 py-1">
              {s}
            </Chip>
          ))}
        </View>
        <View className="gap-1.5">
          <Text className="font-sans-medium text-small">Who did it</Text>
          <Segmented
            label="Who did it"
            options={[
              { value: 'me', label: 'Me' },
              { value: 'partner', label: partner.display_name },
            ]}
            value={who}
            onChange={setWho}
          />
        </View>
        <View className="gap-1.5">
          <Text className="font-sans-medium text-small">Effort</Text>
          <Segmented size="sm" label="Effort" options={EFFORT.map((e, i) => ({ value: String(i + 1), label: e.replace('A fair bit', 'Fair') }))} value={effort} onChange={setEffort} />
        </View>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button
          disabled={!task.trim()}
          onPress={() =>
            void entries
              .mutate(() =>
                addLabor(sb, { couple_id: couple.id, done_by: who === 'me' ? me.id : partner.id, task: task.trim(), effort: Number(effort) }),
              )
              .then(() => setTask(''))
              .catch((e: Error) => setError(e.message))
          }
        >
          Log it
        </Button>
      </Sheet>

      <View className="gap-3">
        <SectionTitle>Noticed lately</SectionTitle>
        {list.length === 0 ? (
          <EmptyNote title="Nothing yet">{`Log something you did — or better, something you saw ${partner.display_name} do.`}</EmptyNote>
        ) : (
          <Sheet pad="none">
            {list.map((e, i) => {
              const p = personFor(ctx, e.done_by);
              return (
                <View key={e.id} className={cn('flex-row items-center gap-3 px-4 py-3', i > 0 && 'border-t border-paper-edge')}>
                  <View className={cn('h-2 w-2 rounded-full', SLOT_BAR[p.slot])} />
                  <View className="flex-1">
                    <Text>{e.task}</Text>
                    <Text className="text-micro text-ink-muted">
                      {p.mine ? 'You' : p.name} · {EFFORT[e.effort - 1]?.toLowerCase()} ·{' '}
                      {new Date(e.done_on + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </Text>
                  </View>
                  <IconButton label={`Remove ${e.task}`} size="sm" onPress={() => void entries.mutate(() => deleteLabor(sb, e.id)).catch((x: Error) => setError(x.message))}>
                    <X size={16} color={c.inkSoft} />
                  </IconButton>
                </View>
              );
            })}
          </Sheet>
        )}
      </View>
    </View>
  );
}
