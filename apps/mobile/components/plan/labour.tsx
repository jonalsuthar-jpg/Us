import { addDays, addLabor, deleteLabor, describeBalance, laborBalance, laborByTask, listLabor, personFor, setLaborThanked, toDateKey } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { Heart, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { EmptyNote, ErrorNote } from '../module-screen';
import { Button, IconButton } from '../ui/button';
import { cn } from '../ui/cn';
import { Field } from '../ui/field';
import { FormSheet } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { Segmented } from '../ui/segmented';
import { Display, Text } from '../ui/text';
import { AddPill, GroupLabel, Initial, Pick, SplitBar } from './bits';
import { SLOT_FILL } from './tones';

const WINDOW_DAYS = 30;
const SUGGESTIONS = ['Cooking', 'Dishes', 'Laundry', 'Groceries', 'Cleaning', 'Planning ahead', 'Remembering birthdays', 'Bills & admin'];
const EFFORT = ['A little', 'Some', 'A fair bit', 'A lot', 'Huge'];

export function PlanLabour({ adding, onAdded }: { adding?: boolean; onAdded?: () => void }) {
  const ctx = useCouple();
  const { sb, couple, me, partner, mySlot, partnerSlot } = ctx;
  const c = usePalette();
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

  return (
    <View className="gap-5">
      <View className="flex-row items-center gap-3">
        <Segmented
          className="flex-1"
          label="Period"
          options={[
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
          ]}
          value={days}
          onChange={setDays}
        />
        <AddPill label="Notice" onPress={() => setSheet(true)} />
      </View>

      <View className="gap-3.5 rounded-sheet border border-paper-edge bg-paper-raised p-5">
        <View className="flex-row items-center gap-5">
          <View
            accessible
            accessibilityLabel={balance.total ? `You ${myPct}%, ${partner.display_name} ${100 - myPct}%` : 'Nothing logged yet'}
            className="h-32 w-32 items-center justify-center"
          >
            <Svg width={128} height={128} style={{ position: 'absolute' }}>
              <Circle cx={64} cy={64} r={R} stroke={balance.total ? SLOT_FILL[partnerSlot] : c.paperSunken} strokeWidth={16} fill="none" />
              {balance.total ? (
                <Circle cx={64} cy={64} r={R} stroke={SLOT_FILL[mySlot]} strokeWidth={16} fill="none" strokeDasharray={`${myShare * C} ${C}`} transform="rotate(-90 64 64)" />
              ) : null}
            </Svg>
            <Text className="text-micro text-ink-muted">noticed</Text>
            <Display className="text-[26px] leading-[30px]">{list.length}</Display>
          </View>
          <View className="flex-1 gap-3">
            {[
              { name: 'You', slot: mySlot, pct: myPct },
              { name: partner.display_name, slot: partnerSlot, pct: 100 - myPct },
            ].map((p) => (
              <View key={p.name} className="flex-row items-center gap-2.5">
                <View className="h-3 w-3 rounded-full" style={{ backgroundColor: SLOT_FILL[p.slot] }} />
                <View>
                  <Text className="text-small text-ink-soft">{p.name}</Text>
                  <Display className="text-heading">{balance.total ? `${p.pct}%` : '–'}</Display>
                </View>
              </View>
            ))}
          </View>
        </View>
        <Display italic className="text-lead">
          {describeBalance(myShare, balance.total, partner.display_name)}
        </Display>
        <Text className="text-micro text-ink-muted">A balance, never a scoreboard.</Text>
      </View>

      {tasks.length ? (
        <View className="gap-2.5">
          <GroupLabel>Who’s been doing what</GroupLabel>
          <View className="gap-3 rounded-sheet border border-paper-edge bg-paper-raised p-4">
            {tasks.map((t) => {
              const mine = mySlot === 'a' ? t.a : t.b;
              const theirs = mySlot === 'a' ? t.b : t.a;
              return (
                <View key={t.task} className="gap-1.5">
                  <View className="flex-row justify-between">
                    <Text className="font-sans-medium text-small">{t.task}</Text>
                    <Text className="text-micro text-ink-soft">
                      You {mine} · {partner.display_name} {theirs}
                    </Text>
                  </View>
                  <SplitBar left={mine + theirs ? mine / (mine + theirs) : 0.5} leftColor={SLOT_FILL[mySlot]} rightColor={SLOT_FILL[partnerSlot]} />
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <View className="gap-1">
        <GroupLabel>Noticed lately</GroupLabel>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {list.length === 0 ? (
          <EmptyNote title="Nothing yet">{`Log something you did, or better, something you saw ${partner.display_name} do.`}</EmptyNote>
        ) : (
          list.map((e) => {
            const p = personFor(ctx, e.done_by);
            return (
              <View key={e.id} className="flex-row items-center gap-3 border-b border-paper-edge py-2">
                <Initial slot={p.slot} name={p.mine ? me.display_name : partner.display_name} size={32} />
                <View className="flex-1">
                  <Text>{e.task}</Text>
                  <Text className="text-micro text-ink-muted">
                    {p.mine ? 'You' : p.name} · {EFFORT[e.effort - 1]?.toLowerCase()} ·{' '}
                    {new Date(e.done_on + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </Text>
                </View>
                {p.mine ? (
                  e.thanked_at ? <Text className="text-micro font-sans-medium text-rose-700">{partner.display_name} said thanks</Text> : null
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: !!e.thanked_at }}
                    onPress={() => void entries.mutate(() => setLaborThanked(sb, e.id, !e.thanked_at)).catch(fail)}
                    className={cn('h-9 flex-row items-center gap-1.5 rounded-full border-[1.5px] px-3', e.thanked_at ? 'border-rose-200 bg-rose-50' : 'border-paper-edge')}
                  >
                    <Heart size={14} color={e.thanked_at ? c.onRose : c.inkSoft} fill={e.thanked_at ? '#F5547C' : 'transparent'} />
                    <Text className={cn('font-sans-semibold text-micro', e.thanked_at ? 'text-rose-700' : 'text-ink-soft')}>{e.thanked_at ? 'Thanked' : 'Thank'}</Text>
                  </Pressable>
                )}
                <IconButton label={`Remove ${e.task}`} size="sm" onPress={() => void entries.mutate(() => deleteLabor(sb, e.id)).catch(fail)}>
                  <X size={16} color={c.inkMuted} />
                </IconButton>
              </View>
            );
          })
        )}
      </View>

      <FormSheet open={sheet} title="Notice something" onClose={() => (setSheet(false), adding && onAdded?.())}>
        {sheet ? (
          <NoticeForm
            onSave={async (row) => {
              await entries.mutate(() => addLabor(sb, { couple_id: couple.id, ...row, done_by: row.mine ? me.id : partner.id }));
              setSheet(false);
              onAdded?.();
            }}
          />
        ) : null}
      </FormSheet>
    </View>
  );
}

function NoticeForm({ onSave }: { onSave: (row: { task: string; effort: number; mine: boolean }) => Promise<void> }) {
  const { me, partner, mySlot, partnerSlot } = useCouple();
  const [task, setTask] = useState('');
  const [mine, setMine] = useState(false);
  const [effort, setEffort] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Text className="text-small text-ink-soft">Even better when it’s something you saw {partner.display_name} do.</Text>
      <Field label="What" value={task} onChangeText={setTask} maxLength={200} placeholder="Booked the dentist" />
      <View className="flex-row flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <Pick key={s} selected={task === s} onPress={() => setTask(s)}>
            {s}
          </Pick>
        ))}
      </View>
      <View className="gap-1.5">
        <Text className="font-sans-medium text-small">Who did it</Text>
        <View className="flex-row gap-2.5">
          {[
            { v: false, name: partner.display_name, slot: partnerSlot },
            { v: true, name: me.display_name, label: 'Me', slot: mySlot },
          ].map((o) => (
            <Pressable
              key={String(o.v)}
              accessibilityRole="radio"
              accessibilityState={{ checked: mine === o.v }}
              onPress={() => setMine(o.v)}
              className={cn('h-14 flex-1 flex-row items-center gap-2.5 rounded-control border-[1.5px] px-3', mine === o.v ? 'border-plum-400 bg-plum-50' : 'border-paper-edge bg-paper-raised')}
            >
              <Initial slot={o.slot} name={o.name} size={28} />
              <Text className="font-sans-medium">{o.label ?? o.name}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View className="gap-1.5">
        <View className="flex-row justify-between">
          <Text className="font-sans-medium text-small">Effort</Text>
          <Text className="font-sans-semibold text-small">{EFFORT[effort - 1]}</Text>
        </View>
        <View className="flex-row gap-1.5">
          {EFFORT.map((label, i) => (
            <Pressable
              key={label}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ checked: effort === i + 1 }}
              onPress={() => setEffort(i + 1)}
              className={cn('h-11 flex-1 rounded-xl', i < effort ? 'bg-sage-400' : 'bg-paper-sunken')}
            />
          ))}
        </View>
      </View>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button
        loading={busy}
        disabled={!task.trim()}
        onPress={() => {
          setBusy(true);
          setError(null);
          onSave({ task: task.trim(), effort, mine }).catch((e: Error) => {
            setError(e.message);
            setBusy(false);
          });
        }}
      >
        Log it
      </Button>
    </>
  );
}
