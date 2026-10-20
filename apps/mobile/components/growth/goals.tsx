import { addGoal, deleteGoal, goalColumns, listGoals, updateGoal, type Goal } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { Minus, Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { EmptyNote, ErrorNote, SectionTitle } from '../module-screen';
import { Button, IconButton } from '../ui/button';
import { cn } from '../ui/cn';
import { Field } from '../ui/field';
import { usePalette } from '../ui/palette';
import { Segmented } from '../ui/segmented';
import { Sheet } from '../ui/sheet';
import { Text } from '../ui/text';

export function GrowthGoals() {
  const { sb, couple, me, partner, mySlot } = useCouple();
  const goals = useCoupleData('growth:goals', () => listGoals(sb, couple.id), [sb, couple.id]);
  const cols = goalColumns(goals.data ?? [], me.id);
  const [title, setTitle] = useState('');
  const [whose, setWhose] = useState<'mine' | 'ours'>('ours');
  const [error, setError] = useState<string | null>(null);
  const fail = (e: Error) => setError(e.message);
  const bar = { mine: mySlot === 'a' ? 'bg-rose-400' : 'bg-teal-500', theirs: mySlot === 'a' ? 'bg-teal-500' : 'bg-rose-400', ours: 'bg-sage-400' };

  const column = (label: string, list: Goal[], color: string, editable: boolean, empty: string) => (
    <View className="gap-3">
      <SectionTitle>{label}</SectionTitle>
      {list.length === 0 ? (
        <EmptyNote title="No goals yet">{empty}</EmptyNote>
      ) : (
        list.map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            bar={color}
            editable={editable}
            onProgress={(p) => void goals.mutate(() => updateGoal(sb, g.id, { progress: p })).catch(fail)}
            onDelete={() => void goals.mutate(() => deleteGoal(sb, g.id)).catch(fail)}
          />
        ))
      )}
    </View>
  );

  return (
    <View className="gap-6">
      <Sheet tone="inset" className="gap-3">
        <Field label="A goal" value={title} onChangeText={setTitle} maxLength={200} placeholder="Learn to make pasta from scratch" />
        <Segmented
          label="Whose goal"
          options={[
            { value: 'ours', label: 'Ours' },
            { value: 'mine', label: 'Mine' },
          ]}
          value={whose}
          onChange={setWhose}
        />
        <Button
          disabled={!title.trim()}
          onPress={() =>
            void goals
              .mutate(() => addGoal(sb, { couple_id: couple.id, owner_id: whose === 'mine' ? me.id : null, title: title.trim() }))
              .then(() => setTitle(''))
              .catch(fail)
          }
        >
          Add goal
        </Button>
      </Sheet>
      {error || goals.error ? <ErrorNote>{error ?? goals.error}</ErrorNote> : null}
      {column('Ours', cols.ours, bar.ours, true, 'Something to grow toward together.')}
      {column('Yours', cols.mine, bar.mine, true, 'Just for you — still on the shared board.')}
      {column(`${partner.display_name}’s`, cols.theirs, bar.theirs, false, `Nothing from ${partner.display_name} yet.`)}
    </View>
  );
}

function GoalCard({ goal, bar, editable, onProgress, onDelete }: { goal: Goal; bar: string; editable: boolean; onProgress: (p: number) => void; onDelete: () => void }) {
  const c = usePalette();
  const done = goal.progress >= 100;
  const step = (d: number) => onProgress(Math.min(100, Math.max(0, goal.progress + d)));
  return (
    <Sheet pad="sm" className="gap-3">
      <View className="flex-row items-start gap-2">
        <Text className={cn('flex-1 font-sans-medium', done && 'line-through')}>{goal.title}</Text>
        {editable ? (
          <IconButton label={`Remove ${goal.title}`} size="sm" onPress={onDelete}>
            <X size={16} color={c.inkSoft} />
          </IconButton>
        ) : null}
      </View>
      <View className="flex-row items-center gap-2">
        {editable ? (
          <IconButton label="Less progress" size="sm" tone="rose" onPress={() => step(-10)} disabled={goal.progress <= 0}>
            <Minus size={16} color={c.roseStrong} />
          </IconButton>
        ) : null}
        <View className="h-2 flex-1 overflow-hidden rounded-full bg-paper-sunken" accessible accessibilityLabel={`${goal.progress}% done`}>
          <View className={cn('h-full rounded-full', bar)} style={{ width: `${goal.progress}%` }} />
        </View>
        {editable ? (
          <IconButton label="More progress" size="sm" tone="rose" onPress={() => step(10)} disabled={done}>
            <Plus size={16} color={c.roseStrong} />
          </IconButton>
        ) : null}
      </View>
      <Text className="text-micro text-ink-muted">{done ? 'Done — well grown.' : `${goal.progress}% of the way`}</Text>
    </Sheet>
  );
}
