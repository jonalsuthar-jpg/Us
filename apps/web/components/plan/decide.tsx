'use client';

import {
  addDecisionOption,
  decisionCategories,
  listDecisionOptions,
  pickDecision,
  removeDecisionOption,
  updateDecisionOption,
  type DecisionOption,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dices, Plus, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { EmptyNote, ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Chip, Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';

const STARTERS = ['Dinner', 'Film night', 'Weekend'];
const WEIGHTS = [
  { value: '1', label: 'Sure' },
  { value: '2', label: 'Keen' },
  { value: '3', label: 'Really want' },
] as const;

export function PlanDecide() {
  const { sb, couple } = useCouple();
  const options = useCoupleData('plan:decisions', () => listDecisionOptions(sb, couple.id), [sb, couple.id]);
  const all = options.data ?? [];
  const categories = decisionCategories(all);
  const [category, setCategory] = useState<string | null>(null);
  const [newList, setNewList] = useState('');
  const [label, setLabel] = useState('');
  const [picked, setPicked] = useState<DecisionOption | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to the first list once loaded; keep a just-created (still empty) list selected.
  useEffect(() => {
    if (category === null && categories[0]) setCategory(categories[0]);
  }, [category, categories]);

  const current = category ?? '';
  const inList = all.filter((o) => o.category === current);

  async function add(e: FormEvent) {
    e.preventDefault();
    const text = label.trim();
    if (!text || !current) return;
    setError(null);
    try {
      await options.mutate(() => addDecisionOption(sb, { couple_id: couple.id, category: current, label: text }));
      setLabel('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function choose() {
    setError(null);
    setSpinning(true);
    setPicked(null);
    try {
      // A short beat of anticipation; the pick itself is instant and server-side.
      const [result] = await Promise.all([
        options.mutate(() => pickDecision(sb, current)),
        new Promise((r) => setTimeout(r, 650)),
      ]);
      setPicked(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSpinning(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section aria-label="Lists" className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {categories.map((c) => (
            <Chip key={c} selected={c === current} onClick={() => (setCategory(c), setPicked(null))}>
              {c}
            </Chip>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = newList.trim();
              if (!name) return;
              setCategory(name);
              setNewList('');
              setPicked(null);
            }}
            className="flex items-center gap-1"
          >
            <label className="sr-only" htmlFor="new-list">
              New list
            </label>
            <input
              id="new-list"
              value={newList}
              onChange={(e) => setNewList(e.target.value)}
              maxLength={60}
              placeholder="New list…"
              className="h-9 w-32 rounded-full border border-dashed border-paper-edge bg-transparent px-3 text-small text-ink placeholder:text-ink-muted focus:border-rose-400 focus:outline-none"
            />
          </form>
        </div>

        {!current ? (
          <div className="space-y-3">
            <EmptyNote title="Can’t choose? Let it choose — fairly.">
              Make a list of options. Anything picked recently gets less likely for a couple of weeks, so the same thing doesn’t win every time.
            </EmptyNote>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <Chip key={s} onClick={() => setCategory(s)}>
                  <Plus className="h-3.5 w-3.5" /> {s}
                </Chip>
              ))}
            </div>
          </div>
        ) : (
          <>
            <form onSubmit={add} className="flex items-end gap-2">
              <div className="flex-1">
                <Field label={`Add to “${current}”`} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="Ramen" />
              </div>
              <Button type="submit" variant="secondary" disabled={!label.trim()}>
                Add
              </Button>
            </form>
            {inList.length === 0 ? (
              <p className="text-small text-ink-muted">This list is empty. Add at least two options.</p>
            ) : (
              <ul className="divide-y divide-paper-edge rounded-sheet border border-paper-edge bg-paper-raised">
                {inList.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-ink">{o.label}</p>
                      <p className="text-micro text-ink-muted">
                        {o.times_picked ? `Picked ${o.times_picked}×` : 'Never picked'}
                        {o.last_picked_at ? ` · last ${new Date(o.last_picked_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
                      </p>
                    </div>
                    <Segmented
                      size="sm"
                      label={`How much you want ${o.label}`}
                      options={WEIGHTS.map((w) => ({ ...w }))}
                      value={String(Math.min(3, Math.max(1, Math.round(o.weight)))) as '1' | '2' | '3'}
                      onChange={(v) => void options.mutate(() => updateDecisionOption(sb, o.id, { weight: Number(v) })).catch((e) => setError(e.message))}
                    />
                    <IconButton label={`Remove ${o.label}`} size="sm" onClick={() => void options.mutate(() => removeDecisionOption(sb, o.id)).catch((e) => setError(e.message))}>
                      <X className="h-4 w-4" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {(error || options.error) && <ErrorNote>{error ?? options.error}</ErrorNote>}
      </section>

      <section aria-label="Choose" aria-live="polite">
        <Sheet tone="night" pad="lg" className="flex min-h-[260px] flex-col items-center justify-center text-center">
          <AnimatePresence mode="wait">
            {spinning ? (
              <motion.div key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1, rotate: 360 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }}>
                <Dices className="h-10 w-10 text-gold-200" aria-hidden />
                <span className="sr-only">Choosing…</span>
              </motion.div>
            ) : picked ? (
              <motion.div key={picked.id + picked.times_picked} initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }}>
                <p className="text-small text-paper/70">It’s</p>
                <p className="mt-1 font-display text-[36px] italic leading-tight text-paper">{picked.label}</p>
              </motion.div>
            ) : (
              <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-display text-lead italic text-paper/80">
                {current ? `Can’t decide on ${current.toLowerCase()}?` : 'Pick a list first.'}
              </motion.p>
            )}
          </AnimatePresence>
          <Button variant="night" className="mt-8" onClick={choose} disabled={inList.length < 2 || spinning}>
            <Dices className="h-4 w-4" /> {picked ? 'Choose again' : 'Choose for us'}
          </Button>
        </Sheet>
      </section>
    </div>
  );
}
