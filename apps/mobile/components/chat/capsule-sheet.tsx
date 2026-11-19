import {
  CAPSULE_TIMES,
  CAPSULE_TOPIC,
  capsuleDatePicks,
  capsuleMoment,
  capsuleProblem,
  editCapsule,
  formatCapsuleMoment,
  listCountdowns,
  sealCapsule,
  toDateKey,
  type Capsule,
} from '@us/shared';
import { useChatKey, useCouple, useCoupleData } from '@us/shared/react';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ErrorNote } from '../module-screen';
import { Button } from '../ui/button';
import { Field } from '../ui/field';
import { DateStepper, FormSheet, parseTime } from '../ui/form-sheet';
import { Chip } from '../ui/segmented';
import { Text } from '../ui/text';

const hm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * Write a message now and seal it until a date and time. Both are always
 * asked for, in this phone's time zone, and shown together before it's sealed.
 */
export function CapsuleSheet({ open, editing, onClose, onDone }: { open: boolean; editing?: { capsule: Capsule; text: string } | null; onClose: () => void; onDone: (sealedFor: string) => void }) {
  const { sb, couple, me, partner, channel } = useCouple();
  const { sealer } = useChatKey();
  const countdowns = useCoupleData('home', () => listCountdowns(sb, couple.id), [sb, couple.id, 'capsule']);
  const [text, setText] = useState('');
  const [date, setDate] = useState(() => toDateKey(new Date(Date.now() + 30 * 86_400_000)));
  const [time, setTime] = useState('20:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    if (editing) {
      const at = new Date(editing.capsule.deliver_at);
      setText(editing.text);
      setDate(toDateKey(at));
      setTime(hm(at));
    } else {
      setText('');
      setDate(toDateKey(new Date(Date.now() + 30 * 86_400_000)));
      setTime('20:00');
    }
  }, [open, editing]);

  const parsed = parseTime(time);
  const at = parsed ? capsuleMoment(date, parsed) : null;
  const problem = capsuleProblem(at);
  const picks = capsuleDatePicks(countdowns.data ?? [], partner.display_name);

  async function seal() {
    if (!at || problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const cipher = await sealer();
      if (!cipher) throw new Error('Time capsules need encrypted chat. It turns on once you both have the new app.');
      if (editing) await editCapsule(sb, editing.capsule, { text, at }, cipher);
      else await sealCapsule(sb, { coupleId: couple.id, me: me.id }, text, at, cipher);
      channel.sendChanged(CAPSULE_TOPIC);
      onDone(formatCapsuleMoment(at));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <FormSheet open={open} title={editing ? 'Edit time capsule' : 'Time capsule'} onClose={onClose}>
      <Text className="text-ink-soft">{`Write it now. ${partner.display_name} can read it only when it opens: they’ll know something is waiting, nothing more.`}</Text>
      <Field label="Your message" value={text} onChangeText={setText} multiline inputClassName="h-36 py-3" maxLength={4000} placeholder="Dear future us…" />

      <View className="gap-2">
        <Text className="font-sans-medium text-small">Opens on</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {picks.map((p) => (
            <Chip key={p.label} selected={date === p.date} onPress={() => setDate(p.date)}>
              {p.label}
            </Chip>
          ))}
        </ScrollView>
        <DateStepper label="Date" value={date} onChange={setDate} />
      </View>

      <View className="gap-2">
        <Text className="font-sans-medium text-small">At</Text>
        <View className="flex-row flex-wrap gap-2">
          {CAPSULE_TIMES.map((t) => (
            <Chip key={t.time} selected={parsed === t.time} onPress={() => setTime(t.time)}>
              {`${t.label} ${t.time}`}
            </Chip>
          ))}
        </View>
        <Field label="Time" value={time} onChangeText={setTime} placeholder="Like 21:00" keyboardType="numbers-and-punctuation" error={parsed ? null : 'Like 21:00'} />
      </View>

      <View className="rounded-[16px] bg-gold-50 px-4 py-3">
        <Text className="font-sans-semibold text-gold-800">{at ? `Opens ${formatCapsuleMoment(at)}` : 'Pick a date and a time'}</Text>
        {at && problem ? <Text className="text-small text-rose-700">{problem}</Text> : null}
      </View>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button loading={busy} disabled={!text.trim() || !at || !!problem} onPress={() => void seal()}>
        {editing ? 'Save' : 'Seal it 💌'}
      </Button>
    </FormSheet>
  );
}
