'use client';

import { CAN_COLORS, PLANT_STAGES, plantLine, plantScene, type PlantState } from '@us/shared';
import { useCouple, usePlant } from '@us/shared/react';
import { Check, Droplet } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { PlantArt } from './plant-art';

const WATERS = ['📸 A snap', '💗 Thinking of you', '💬 A message', '❓ Today’s question', '📞 A call you both pick up'];

/** Our little plant: grows on days we both show up for each other. */
export function PlantCard() {
  const { couple, partner, mySlot, partnerSlot } = useCouple();
  const { state } = usePlant();
  const [open, setOpen] = useState(false);
  const grew = useStageUp(couple.id, state);

  const scene = useMemo(
    () =>
      state
        ? plantScene({
            stage: state.stage.key,
            drooping: state.drooping,
            daypart: state.daypart,
            fresh: state.grewToday,
            left: { ...CAN_COLORS[mySlot], watered: state.today.me },
            right: { ...CAN_COLORS[partnerSlot], watered: state.today.partner },
          })
        : null,
    [state, mySlot, partnerSlot],
  );
  if (!state || !scene) return null;

  const pouring = { left: state.today.me, right: state.today.partner };
  const title = `Our plant, ${state.stage.name}`;

  return (
    <section aria-label="Our little plant">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group grid w-full overflow-hidden rounded-[28px] border border-paper-edge bg-paper-raised text-left shadow-[0_1px_0_rgba(36,25,51,0.04),0_18px_40px_-24px_rgba(36,25,51,0.35)] transition-transform duration-base hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 md:grid-cols-[1.35fr_1fr]"
      >
        <div className="relative">
          <div className={cn(grew && 'animate-[us-grow_1.2s_ease-out]')} style={{ transformOrigin: '50% 70%' }}>
            <PlantArt scene={scene} pouring={pouring} title={title} className="block aspect-[8/5] w-full" />
          </div>
          {grew ? <Burst label={`It grew! Now ${state.stage.name}`} /> : null}
        </div>
        <div className="flex flex-col justify-center gap-3 p-6">
          <p className="text-micro font-medium uppercase tracking-[0.12em] text-sage-600">Our little plant</p>
          <p className="font-display text-heading text-ink sm:text-title">
            {state.togetherDays === 0 ? 'A seed, waiting for you both' : `Day ${state.togetherDays} together`}
            {state.togetherDays > 0 ? <span className="block font-serif text-lead italic text-ink-soft">{state.stage.name}</span> : null}
          </p>
          <p className="text-small text-ink-soft">{plantLine(state, partner.display_name)}</p>
          <div className="flex flex-wrap gap-2">
            <Can who="You" slot={mySlot} watered={state.today.me} />
            <Can who={partner.display_name} slot={partnerSlot} watered={state.today.partner} />
          </div>
          {state.next ? (
            <p className="text-micro text-ink-muted">
              {state.daysToNext} more {state.daysToNext === 1 ? 'day' : 'days'} together until it’s {state.next.name}
            </p>
          ) : null}
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen} title="Our little plant" description="It grows one step on every day you both do something for each other." className="sm:w-[min(92vw,520px)]">
        <div className="max-h-[70dvh] space-y-5 overflow-y-auto">
          <PlantArt scene={scene} pouring={pouring} title={title} className="block aspect-[8/5] w-full rounded-sheet" />
          <Stages state={state} />
          <Last30 state={state} />
          <div>
            <p className="mb-2 text-small font-medium text-ink">What waters it</p>
            <ul className="grid grid-cols-2 gap-1.5 text-small text-ink-soft">
              {WATERS.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p className="mt-2 text-micro text-ink-muted">One from each of you on the same day. It never shrinks, and it perks up as soon as you’re back.</p>
          </div>
        </div>
      </Dialog>
    </section>
  );
}

function Can({ who, slot, watered }: { who: string; slot: 'a' | 'b'; watered: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-small',
        watered ? (slot === 'a' ? 'bg-rose-50 text-rose-700' : 'bg-teal-50 text-teal-700') : 'bg-paper-sunken text-ink-muted',
      )}
    >
      <Droplet className={cn('h-3.5 w-3.5', watered && 'fill-current')} aria-hidden />
      {who}
      <span className="sr-only">{watered ? 'watered today' : 'not yet today'}</span>
    </span>
  );
}

function Stages({ state }: { state: PlantState }) {
  return (
    <ol className="flex items-start justify-between gap-1" aria-label="Stages">
      {PLANT_STAGES.slice(1).map((s, i) => {
        const reached = state.level >= i + 1;
        return (
          <li key={s.key} className="flex flex-1 flex-col items-center gap-1 text-center">
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-micro',
                reached ? 'bg-sage-500 text-white' : 'border border-dashed border-ink/20 text-ink-muted',
              )}
            >
              {reached ? <Check className="h-3.5 w-3.5" aria-hidden /> : s.at}
            </span>
            <span className={cn('text-[10px] leading-tight', reached ? 'text-ink' : 'text-ink-muted')}>{s.name}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Last30({ state }: { state: PlantState }) {
  return (
    <div>
      <p className="mb-2 text-small font-medium text-ink">The last 30 days</p>
      <div className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1.5" role="img" aria-label={`${state.last30.filter((d) => d === 'both').length} of the last 30 days together`}>
        {state.last30.map((d, i) => (
          <span
            key={i}
            className={cn('aspect-square rounded-full', d === 'both' ? 'bg-sage-400' : d === 'one' ? 'bg-sage-100 ring-1 ring-inset ring-sage-300' : 'bg-paper-sunken')}
          />
        ))}
      </div>
      <p className="mt-2 flex gap-4 text-micro text-ink-muted">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-sage-400" /> both of you
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-sage-100 ring-1 ring-inset ring-sage-300" /> one of you
        </span>
      </p>
    </div>
  );
}

/** Petals bursting outward once, when the plant reaches a new stage. */
function Burst({ label }: { label: string }) {
  return (
    <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="absolute" style={{ transform: `rotate(${i * 36}deg)` }}>
          <span
            className={cn('block h-3 w-2 rounded-full opacity-0 animate-[us-burst_1.4s_ease-out_forwards]', i % 3 ? 'bg-rose-300' : 'bg-gold-300')}
            style={{ animationDelay: `${i * 30}ms` }}
          />
        </span>
      ))}
      <span className="rounded-full bg-paper-raised/90 px-4 py-1.5 text-small font-medium text-ink shadow-sm">{label} 🌸</span>
    </div>
  );
}

/** True for a moment when the plant has grown since this device last saw it. */
function useStageUp(coupleId: string, state: PlantState | undefined) {
  const [grew, setGrew] = useState(false);
  const level = state?.level;
  useEffect(() => {
    if (level === undefined) return;
    const key = `us.plant.level.${coupleId}`;
    let seen: number | null = null;
    try {
      const raw = localStorage.getItem(key);
      seen = raw === null ? null : Number(raw);
      localStorage.setItem(key, String(level));
    } catch {
      return;
    }
    // First sight on this device is not a "grew" moment.
    if (seen === null || level <= seen) return;
    setGrew(true);
    const t = setTimeout(() => setGrew(false), 2800);
    return () => clearTimeout(t);
  }, [coupleId, level]);
  return grew;
}
