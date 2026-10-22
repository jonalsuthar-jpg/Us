'use client';

import { sparkNextLine, SPARK_DIVISIONS, type SparkDivision, type SparkState } from '@us/shared';
import { useCouple, useSpark } from '@us/shared/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { Emblem } from './emblem';
import { RankSheet } from './rank-sheet';
import { RankUp } from './rank-up';

const R = 14;
const AROUND = 2 * Math.PI * R;

/** The border warms to gold with each step of a tier. */
const STEP_BORDER = ['border-paper-edge', 'border-gold-200 border-[1.5px]', 'border-gold-400 border-[1.5px]'] as const;

/**
 * Our Spark Rank, in the Home header: the emblem in a ring that fills toward
 * the next step. Sparks float off it as we earn them; click for the details.
 */
export function RankChip() {
  const { couple } = useCouple();
  const { state, gain } = useSpark();
  const [open, setOpen] = useState(false);
  const rankUp = useRankUp(couple.id, state);
  const [celebrating, setCelebrating] = useState<SparkDivision | null>(null);
  useEffect(() => {
    if (rankUp) setCelebrating(rankUp);
  }, [rankUp]);

  if (!state) return null;
  const { division } = state.rank;

  return (
    <>
      <div className="relative shrink-0">
        <ChipFace
          division={division}
          progress={state.rank.progress}
          label={`Our rank: ${division.name}. ${sparkNextLine(state)}. Open Spark Rank`}
          onClick={() => setOpen(true)}
        />
        {gain ? (
          <span
            key={gain.id}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-6 flex justify-center opacity-0 animate-[us-spark-float_1.3s_ease-out_forwards]"
          >
            <span className="whitespace-nowrap rounded-full border border-gold-200 bg-gold-50 px-2.5 py-0.5 text-micro font-semibold text-gold-700">
              {gain.firstMove ? `+${gain.sparks} First move ✨` : `+${gain.sparks}`}
            </span>
          </span>
        ) : null}
      </div>

      <RankSheet open={open} onOpenChange={setOpen} state={state} />
      <RankUp division={celebrating} state={state} onClose={() => setCelebrating(null)} />
    </>
  );
}

/** The chip itself: the emblem in its progress ring, and the rank's name. */
export function ChipFace({ division, progress, label, onClick }: { division: SparkDivision; progress: number; label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex h-10 items-center gap-1.5 rounded-full border bg-paper-raised pl-1 pr-3.5 shadow-[0_1px_2px_rgba(36,25,51,0.06)] transition-transform duration-base hover:-translate-y-px',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
        STEP_BORDER[division.step],
      )}
    >
      <span className="relative flex h-8 w-8 items-center justify-center">
        <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="16" cy="16" r={R} fill="none" strokeWidth="3" className="stroke-paper-sunken" />
          <circle
            cx="16"
            cy="16"
            r={R}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            stroke={division.tier.colors[1]}
            strokeDasharray={AROUND}
            strokeDashoffset={AROUND * (1 - progress)}
            style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1), stroke 400ms' }}
          />
        </svg>
        <Emblem division={division} className="h-[19px] w-[19px]" />
      </span>
      <span className="whitespace-nowrap text-small font-semibold text-ink">{division.name}</span>
    </button>
  );
}

/**
 * A division we've reached since this device last looked, within the same
 * season (a new season starting lower is not a moment).
 */
function useRankUp(coupleId: string, state: SparkState | undefined): SparkDivision | null {
  const [up, setUp] = useState<SparkDivision | null>(null);
  const season = state?.season;
  const index = state?.rank.division.index;
  useEffect(() => {
    if (season === undefined || index === undefined) return;
    const key = `us.spark.rank.${coupleId}`;
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
      localStorage.setItem(key, `${season}:${index}`);
    } catch {
      return;
    }
    const [seen, seenIndex] = (raw ?? '').split(':');
    // First sight on this device is not a rank-up.
    if (seen !== season || index <= Number(seenIndex)) return;
    setUp(SPARK_DIVISIONS[index]!);
  }, [coupleId, season, index]);
  return up;
}
