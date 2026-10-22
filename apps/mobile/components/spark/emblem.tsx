import { EMBLEM_VIEWBOX, sparkEmblem, type SparkDivision } from '@us/shared';
import { useId, useMemo } from 'react';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/** A Spark Rank emblem from spark-art.ts: more gold with each step of a tier. */
export function Emblem({ division, size }: { division: SparkDivision; size: number }) {
  const emblem = useMemo(() => sparkEmblem(division), [division]);
  // Gradient ids are per emblem: the chip and the sheet draw at the same time.
  const prefix = useId().replace(/[^a-zA-Z0-9]/g, '');
  const paint = (f?: string) => (f?.startsWith('grad:') ? `url(#${prefix}${f.slice(5)})` : (f ?? 'none'));
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${EMBLEM_VIEWBOX} ${EMBLEM_VIEWBOX}`}>
      <Defs>
        {emblem.gradients.map((g) => (
          <LinearGradient key={g.id} id={`${prefix}${g.id}`} x1={g.coords[0]} y1={g.coords[1]} x2={g.coords[2]} y2={g.coords[3]}>
            {g.stops.map((s, i) => (
              <Stop key={i} offset={s.offset} stopColor={s.color} />
            ))}
          </LinearGradient>
        ))}
      </Defs>
      {emblem.shapes.map((s, i) => (
        <Path
          key={i}
          d={s.d}
          fill={paint(s.fill)}
          stroke={s.stroke ? paint(s.stroke) : undefined}
          strokeWidth={s.strokeWidth}
          strokeOpacity={s.strokeOpacity}
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}
