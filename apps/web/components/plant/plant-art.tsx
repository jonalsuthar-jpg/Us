'use client';

import { PLANT_ORIGIN, PLANT_VIEWBOX, type ArtLayerId, type ArtShape, type PlantScene } from '@us/shared';
import { useId, type CSSProperties } from 'react';

/** The plant scene from plant-art.ts, as SVG, with its layers gently moving. */
export function PlantArt({
  scene,
  pouring,
  className,
  title,
  still,
}: {
  scene: PlantScene;
  /** Which cans are tipped over the pot today. */
  pouring: { left: boolean; right: boolean };
  className?: string;
  title: string;
  still?: boolean;
}) {
  // Gradient ids are per instance: the card and the sheet draw the scene at the same time.
  const prefix = useId().replace(/:/g, '');
  const fill = (f?: string) => (f?.startsWith('grad:') ? `url(#${prefix}-${f.slice(5)})` : (f ?? 'none'));

  const motion: Partial<Record<ArtLayerId, CSSProperties>> = still
    ? {}
    : {
        plant: { animation: 'us-sway 4.5s ease-in-out infinite', transformOrigin: `${PLANT_ORIGIN.x}px ${PLANT_ORIGIN.y}px`, transformBox: 'view-box' },
        petals: { animation: 'us-drift 6s ease-in infinite' },
        ...(pouring.left ? { canLeft: { animation: 'us-pour 2.4s ease-in-out infinite', transformOrigin: '98px 106px', transformBox: 'view-box' } } : {}),
        ...(pouring.right ? { canRight: { animation: 'us-pour 2.4s ease-in-out infinite reverse', transformOrigin: '222px 106px', transformBox: 'view-box' } } : {}),
        drops: { animation: 'us-drip 1.2s ease-in infinite' },
      };

  return (
    <svg viewBox={`0 0 ${PLANT_VIEWBOX.width} ${PLANT_VIEWBOX.height}`} className={className} role="img" aria-label={title}>
      <defs>
        {scene.gradients.map((g) => {
          const stops = g.stops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity ?? 1} />);
          return g.type === 'linear' ? (
            <linearGradient key={g.id} id={`${prefix}-${g.id}`} x1={g.coords[0]} y1={g.coords[1]} x2={g.coords[2]} y2={g.coords[3]}>
              {stops}
            </linearGradient>
          ) : (
            <radialGradient key={g.id} id={`${prefix}-${g.id}`} cx={g.coords[0]} cy={g.coords[1]} r={g.coords[2]}>
              {stops}
            </radialGradient>
          );
        })}
      </defs>
      {scene.layers.map((layer) => (
        <g key={layer.id} style={motion[layer.id]}>
          {layer.shapes.map((s, i) => (
            <Shape key={i} s={s} fill={fill} />
          ))}
        </g>
      ))}
    </svg>
  );
}

function Shape({ s, fill }: { s: ArtShape; fill: (f?: string) => string }) {
  if (s.kind === 'path')
    return <path d={s.d} fill={fill(s.fill)} stroke={s.stroke ?? 'none'} strokeWidth={s.strokeWidth} strokeLinecap="round" opacity={s.opacity} />;
  if (s.kind === 'circle') return <circle cx={s.cx} cy={s.cy} r={s.r} fill={fill(s.fill)} opacity={s.opacity} />;
  return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={fill(s.fill)} opacity={s.opacity} />;
}
