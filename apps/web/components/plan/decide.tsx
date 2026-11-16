'use client';

import {
  addDecisionOption,
  decisionCategories,
  listDecisionOptions,
  pickDecision,
  removeDecisionOption,
  updateDecisionOption,
  wheelSlicePath,
  wheelSpinTarget,
  type DecisionOption,
} from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { Heart, Plus, RotateCw, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { EmptyNote, ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/cn';
import { GroupLabel, Pick } from './bits';

const STARTERS = ['Dinner', 'Film night', 'Weekend'];
const FILLS = ['#FF86A3', '#FCC24F', '#50CBB9', '#B39ACC', '#FFB8C9', '#91E3D5', '#FFD98A', '#D4C2E6'];
const SIZE = 300;
const SPIN_MS = 3200;
const WEIGHTS = ['Sure', 'Keen', 'Really keen'];

/** A wheel for the small decisions. The server picks (weighted, fair), the wheel shows it. */
export function PlanDecide({ initialCategory }: { initialCategory?: string }) {
  const { sb, couple } = useCouple();
  const options = useCoupleData('plan:decisions', () => listDecisionOptions(sb, couple.id), [sb, couple.id]);
  const all = options.data ?? [];
  const categories = decisionCategories(all);
  const [category, setCategory] = useState<string | null>(initialCategory ?? null);
  const [newList, setNewList] = useState('');
  const [label, setLabel] = useState('');
  const [picked, setPicked] = useState<DecisionOption | null>(null);
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'reveal' | 'locked'>('idle');
  const [vetoes, setVetoes] = useState(1);
  const [rot, setRot] = useState({ deg: 0, ms: 0 });
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (category === null && categories[0]) setCategory(categories[0]);
  }, [category, categories]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const current = category ?? '';
  const inList = all.filter((o) => o.category === current);
  const fail = (e: Error) => setError(e.message);

  const switchTo = (cat: string) => {
    clearTimeout(timer.current);
    setCategory(cat);
    setPicked(null);
    setPhase('idle');
    setVetoes(1);
    setRot({ deg: 0, ms: 0 });
  };

  async function spin(avoid?: string) {
    setError(null);
    setPhase('spinning');
    try {
      let result = await options.mutate(() => pickDecision(sb, current));
      // A veto shouldn't land on the same thing again; the picker already makes repeats rare.
      for (let i = 0; avoid && result.id === avoid && i < 3; i++) result = await options.mutate(() => pickDecision(sb, current));
      const index = Math.max(0, inList.findIndex((o) => o.id === result.id));
      setRot((r) => ({ deg: wheelSpinTarget(r.deg, index, inList.length), ms: SPIN_MS }));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setPicked(result);
        setPhase('reveal');
      }, SPIN_MS + 100);
    } catch (e) {
      fail(e as Error);
      setPhase('idle');
    }
  }

  async function addOption(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    try {
      await options.mutate(() => addDecisionOption(sb, { couple_id: couple.id, category: current, label: label.trim() }));
      setLabel('');
    } catch (err) {
      fail(err as Error);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4 rounded-sheet bg-plum-800 p-5 text-paper sm:p-6">
        <h2 className="font-serif text-[28px] font-light italic leading-tight">{current ? `Can’t decide on ${current.toLowerCase()}?` : 'Can’t decide?'}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              aria-pressed={cat === current}
              onClick={() => switchTo(cat)}
              className={cn(
                'h-10 rounded-full border px-4 text-small font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                cat === current ? 'border-paper bg-paper text-plum-800' : 'border-white/25 text-paper/85 hover:border-white/50',
              )}
            >
              {cat}
            </button>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = newList.trim();
              if (!name) return;
              switchTo(name);
              setNewList('');
            }}
          >
            <input
              value={newList}
              onChange={(e) => setNewList(e.target.value)}
              maxLength={60}
              placeholder="+ New list"
              aria-label="New list"
              className="h-10 w-32 rounded-full border border-dashed border-white/35 bg-transparent px-4 text-small text-paper placeholder:text-paper/60 focus:border-white/70 focus:outline-none"
            />
          </form>
        </div>

        {current && inList.length > 1 ? (
          <>
            <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }}>
              <svg
                width={SIZE}
                height={SIZE}
                role="img"
                aria-label={`Wheel of ${inList.length} options`}
                className="motion-reduce:!transition-none"
                style={{ transform: `rotate(${rot.deg}deg)`, transition: `transform ${rot.ms}ms cubic-bezier(.12,.75,.12,1)` }}
              >
                <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 2} fill="#392751" />
                {inList.map((o, i) => (
                  <g key={o.id}>
                    <path d={wheelSlicePath(i, inList.length, SIZE / 2 - 6, SIZE / 2)} fill={FILLS[i % FILLS.length]} stroke="#241933" strokeWidth={2} />
                    <text
                      x={SIZE / 2}
                      y={50}
                      fill="#170F21"
                      fontSize={13}
                      fontWeight={600}
                      textAnchor="middle"
                      transform={`rotate(${(360 / inList.length) * (i + 0.5)} ${SIZE / 2} ${SIZE / 2})`}
                    >
                      {o.label.length > 12 ? `${o.label.slice(0, 11)}…` : o.label}
                    </text>
                  </g>
                ))}
                <circle cx={SIZE / 2} cy={SIZE / 2} r={24} fill="#241933" stroke="#FFD98A" strokeWidth={3} />
              </svg>
              <svg aria-hidden width={26} height={30} className="absolute -top-2.5" style={{ left: SIZE / 2 - 13 }}>
                <polygon points="13,30 2,6 13,0 24,6" fill="#FFD98A" stroke="#241933" strokeWidth={2} />
              </svg>
            </div>

            {(phase === 'reveal' || phase === 'locked') && picked ? (
              <div className="animate-[us-grow_.45s_ease] rounded-sheet bg-gold-50 p-4 text-center text-ink" aria-live="polite">
                <p className="text-small font-medium text-gold-700">It’s</p>
                <p className="mt-0.5 font-serif text-[34px] italic leading-tight">{picked.label}</p>
                {phase === 'locked' ? (
                  <p className="mt-3 font-semibold text-sage-700">Locked in. Enjoy!</p>
                ) : (
                  <>
                    <div className="mt-4 flex gap-2">
                      <Button
                        variant="secondary"
                        className="flex-1"
                        disabled={!vetoes || inList.length < 3}
                        onClick={() => {
                          setVetoes((v) => v - 1);
                          void spin(picked.id);
                        }}
                      >
                        {vetoes ? 'Veto (1 left)' : 'No vetoes left'}
                      </Button>
                      <Button className="flex-1" onClick={() => setPhase('locked')}>
                        Lock it in
                      </Button>
                    </div>
                    <p className="mt-2 text-micro text-ink-soft">One veto per spin. Use it wisely.</p>
                  </>
                )}
              </div>
            ) : null}
            {phase !== 'reveal' ? (
              <button
                type="button"
                disabled={phase === 'spinning'}
                onClick={() => {
                  setVetoes(1);
                  void spin();
                }}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-control bg-gold-200 text-lead font-bold text-plum-800 transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <RotateCw className={cn('h-5 w-5', phase === 'spinning' && 'animate-spin')} />
                {phase === 'spinning' ? 'Spinning…' : phase === 'idle' ? 'Spin for us' : 'Spin again'}
              </button>
            ) : null}
          </>
        ) : current ? (
          <p className="text-small text-paper/75">Add at least two options to spin.</p>
        ) : null}
      </div>

      {!current ? (
        <div className="space-y-3">
          <EmptyNote title="Can’t choose? Let it choose, fairly.">Make a list of options. Anything picked recently gets less likely for a couple of weeks.</EmptyNote>
          <div className="flex flex-wrap justify-center gap-2">
            {STARTERS.map((s) => (
              <Pick key={s} selected={false} onClick={() => switchTo(s)}>
                <Plus className="h-3.5 w-3.5" /> {s}
              </Pick>
            ))}
          </div>
        </div>
      ) : (
        <section className="space-y-3">
          <GroupLabel right={<span className="text-micro text-ink-muted">More hearts = more likely</span>}>On the wheel</GroupLabel>
          <div className="rounded-sheet border border-paper-edge bg-paper-raised px-4">
            <ul>
              {inList.map((o, i) => (
                <li key={o.id} className="flex items-center gap-2 border-b border-paper-sunken py-1.5">
                  <span className="h-3 w-3 shrink-0 rounded" style={{ backgroundColor: FILLS[i % FILLS.length] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{o.label}</span>
                    <span className="block text-micro text-ink-muted">{o.times_picked ? `Picked ${o.times_picked}×` : 'Never picked'}</span>
                  </span>
                  <span role="radiogroup" aria-label={`How much you want ${o.label}`} className="flex">
                    {[1, 2, 3].map((h) => {
                      const lit = h <= Math.round(o.weight);
                      return (
                        <button
                          key={h}
                          type="button"
                          role="radio"
                          aria-checked={Math.round(o.weight) === h}
                          aria-label={WEIGHTS[h - 1]}
                          title={WEIGHTS[h - 1]}
                          onClick={() => void options.mutate(() => updateDecisionOption(sb, o.id, { weight: h })).catch(fail)}
                          className="flex h-10 w-8 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                        >
                          <Heart className={cn('h-[18px] w-[18px]', lit ? 'fill-rose-400 text-rose-500' : 'text-plum-200')} />
                        </button>
                      );
                    })}
                  </span>
                  <IconButton label={`Remove ${o.label}`} size="sm" onClick={() => void options.mutate(() => removeDecisionOption(sb, o.id)).catch(fail)}>
                    <X className="h-4 w-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
            <form onSubmit={addOption} className="flex items-center gap-2 py-1.5">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={120}
                placeholder={`Add to “${current}”…`}
                aria-label={`Add to ${current}`}
                className="h-11 min-w-0 flex-1 bg-transparent text-body text-ink placeholder:text-ink-muted/70 focus:outline-none"
              />
              <Button type="submit" variant="quiet" size="sm" disabled={!label.trim()}>
                Add
              </Button>
            </form>
          </div>
          <p className="text-center font-serif text-small font-light italic text-ink-soft">Anything picked lately sits back for a couple of weeks. Fair to both of you.</p>
        </section>
      )}
      {error || options.error ? <ErrorNote>{error ?? options.error}</ErrorNote> : null}
    </div>
  );
}
