'use client';

import { EMBLEM_VIEWBOX, sparkEmblem, type SparkDivision } from '@us/shared';
import { useId, useMemo } from 'react';

/** A Spark Rank emblem from spark-art.ts: more gold with each step of a tier. */
export function Emblem({ division, className }: { division: SparkDivision; className?: string }) {
  const emblem = useMemo(() => sparkEmblem(division), [division]);
  // Gradient ids are per emblem: the chip and the sheet draw at the same time.
  const prefix = useId().replace(/:/g, '');
  const paint = (f?: string) => (f?.startsWith('grad:') ? `url(#${prefix}-${f.slice(5)})` : (f ?? 'none'));
  return (
    <svg viewBox={`0 0 ${EMBLEM_VIEWBOX} ${EMBLEM_VIEWBOX}`} className={className} aria-hidden>
      <defs>
        {emblem.gradients.map((g) => (
          <linearGradient key={g.id} id={`${prefix}-${g.id}`} x1={g.coords[0]} y1={g.coords[1]} x2={g.coords[2]} y2={g.coords[3]}>
            {g.stops.map((s, i) => (
              <stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        ))}
      </defs>
      {emblem.shapes.map((s, i) => (
        <path
          key={i}
          d={s.d}
          fill={paint(s.fill)}
          stroke={s.stroke ? paint(s.stroke) : undefined}
          strokeWidth={s.strokeWidth}
          strokeOpacity={s.strokeOpacity}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
