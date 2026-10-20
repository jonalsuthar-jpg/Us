'use client';

import { addGoal, deleteGoal, goalColumns, listGoals, updateGoal, type Goal } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { EmptyNote, ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';

export function GrowthGoals() {
  const { sb, couple, me, partner, mySlot } = useCouple();
  const goals = useCoupleData('growth:goals', () => listGoals(sb, couple.id), [sb, couple.id]);
  const cols = goalColumns(goals.data ?? [], me.id);
  const [title, setTitle] = useState('');
  const [whose, setWhose] = useState<'mine' | 'ours'>('ours');
  const [error, setError] = useState<string | null>(null);
  const fail = (e: Error) => setError(e.message);
  // Partner colours follow the couple's slots, not "me first".
  const bar = { mine: mySlot === 'a' ? 'bg-rose-400' : 'bg-teal-500', theirs: mySlot === 'a' ? 'bg-teal-500' : 'bg-rose-400', ours: 'bg-sage-400' };

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    try {
      await goals.mutate(() => addGoal(sb, { couple_id: couple.id, owner_id: whose === 'mine' ? me.id : null, title: title.trim() }));
      setTitle('');
    } catch (err) {
      fail(err as Error);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <Field label="A goal" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Learn to make pasta from scratch" />
        </div>
        <Segmented
          label="Whose goal"
          options={[
            { value: 'ours', label: 'Ours' },
            { value: 'mine', label: 'Mine' },
          ]}
          value={whose}
          onChange={setWhose}
        />
        <Button type="submit" disabled={!title.trim()}>
          Add
        </Button>
      </form>
      {(error || goals.error) && <ErrorNote>{error ?? goals.error}</ErrorNote>}

      <div className="grid gap-6 md:grid-cols-3">
        <Column title="Ours" goals={cols.ours} bar={bar.ours} editable onChange={goals.mutate} onError={fail} empty="Something to grow toward together." />
        <Column title="Yours" goals={cols.mine} bar={bar.mine} editable onChange={goals.mutate} onError={fail} empty="Just for you — still on the shared board." />
        <Column
          title={`${partner.display_name}’s`}
          goals={cols.theirs}
          bar={bar.theirs}
          editable={false}
          onChange={goals.mutate}
          onError={fail}
          empty={`Nothing from ${partner.display_name} yet.`}
        />
      </div>
    </div>
  );
}

function Column({
  title,
  goals,
  bar,
  editable,
  onChange,
  onError,
  empty,
}: {
  title: string;
  goals: Goal[];
  bar: string;
  editable: boolean;
  onChange: <R>(fn: () => Promise<R>) => Promise<R>;
  onError: (e: Error) => void;
  empty: string;
}) {
  const { sb } = useCouple();
  return (
    <section aria-label={title} className="space-y-3">
      <h3 className="font-display text-lead italic text-ink">{title}</h3>
      {goals.length === 0 ? (
        <EmptyNote title="No goals yet">{empty}</EmptyNote>
      ) : (
        goals.map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            bar={bar}
            editable={editable}
            onProgress={(p) => void onChange(() => updateGoal(sb, g.id, { progress: p })).catch(onError)}
            onDelete={() => void onChange(() => deleteGoal(sb, g.id)).catch(onError)}
          />
        ))
      )}
    </section>
  );
}

function GoalCard({
  goal,
  bar,
  editable,
  onProgress,
  onDelete,
}: {
  goal: Goal;
  bar: string;
  editable: boolean;
  onProgress: (p: number) => void;
  onDelete: () => void;
}) {
  // Local value while dragging; commit on release so we don't write per pixel.
  const [value, setValue] = useState(goal.progress);
  useEffect(() => setValue(goal.progress), [goal.progress]);
  const done = value >= 100;
  return (
    <Sheet pad="sm" className="space-y-3">
      <div className="flex items-start gap-2">
        <p className={cn('flex-1 font-medium text-ink', done && 'line-through decoration-sage-400 decoration-2')}>{goal.title}</p>
        {editable && (
          <IconButton label={`Remove ${goal.title}`} size="sm" className="-mr-1 -mt-1" onClick={onDelete}>
            <X className="h-4 w-4" />
          </IconButton>
        )}
      </div>
      {editable ? (
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          onPointerUp={() => value !== goal.progress && onProgress(value)}
          onKeyUp={() => value !== goal.progress && onProgress(value)}
          aria-label={`Progress on ${goal.title}`}
          aria-valuetext={`${value}%`}
          className="w-full accent-sage-500"
        />
      ) : (
        <div className="h-2 overflow-hidden rounded-full bg-paper-sunken" role="img" aria-label={`${value}% done`}>
          <div className={cn('h-full rounded-full', bar)} style={{ width: `${value}%` }} />
        </div>
      )}
      <p className="text-micro text-ink-muted">{done ? 'Done — well grown.' : `${value}% of the way`}</p>
    </Sheet>
  );
}
