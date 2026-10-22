import type { ArtGradient } from './plant-art';
import { SPARK_DIVISIONS, type SparkDivision } from './api/spark';

/**
 * A Spark Rank emblem as plain shape data, drawn the same way by the web
 * (<svg>) and mobile (react-native-svg) renderers. ViewBox 48 × 48.
 *
 * A hexagon in the tier's colours with a white flame. The step within the
 * tier shows in gold: I is plain, II gets a gold rim, III a heavier rim,
 * wings and a crown gem. Fills and strokes like "grad:gold" name a gradient
 * in `gradients`; renderers give the ids a per-instance prefix.
 */

export const EMBLEM_VIEWBOX = 48;

export interface EmblemShape {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
}

export interface Emblem {
  gradients: ArtGradient[];
  shapes: EmblemShape[];
}

const HEX = 'M24 3 42 13 42 35 24 45 6 35 6 13Z';
const INNER = 'M24 8.5 37.2 16 37.2 32 24 39.5 10.8 32 10.8 16Z';
const FLAME = 'M24 13.5c1.6 4 6.3 6.4 6.3 12A6.3 6.3 0 0 1 17.7 25.5c0-2.9 1.4-4.7 2.9-6 0 2.5 1.2 3.9 2.5 4.3-.4-3.5-.2-6.8.9-10.3Z';
const WINGS = ['M6 15 1 11 2.5 20 .5 26 3 33 6 31Z', 'M42 15 47 11 45.5 20 47.5 26 45 33 42 31Z'];
const GEM = 'M24 0 25.5 2.5 28.5 4 25.5 5.5 24 8 22.5 5.5 19.5 4 22.5 2.5Z';

const GOLD: ArtGradient = {
  id: 'gold',
  type: 'linear',
  coords: [0, 0, 1, 1],
  stops: [
    { offset: 0, color: '#FFE9A8' },
    { offset: 0.5, color: '#F3A823' },
    { offset: 1, color: '#AE6F08' },
  ],
};

export function sparkEmblem(division: SparkDivision | number): Emblem {
  const d = typeof division === 'number' ? SPARK_DIVISIONS[division]! : division;
  const [light, deep] = d.tier.colors;
  const tier: ArtGradient = { id: 'tier', type: 'linear', coords: [0, 0, 0, 1], stops: [{ offset: 0, color: light }, { offset: 1, color: deep }] };
  const shapes: EmblemShape[] = [];
  if (d.step === 2) shapes.push(...WINGS.map((w) => ({ d: w, fill: 'grad:gold' })));
  shapes.push({ d: HEX, fill: 'grad:tier' });
  if (d.step >= 1) shapes.push({ d: HEX, stroke: 'grad:gold', strokeWidth: d.step === 2 ? 3.4 : 2.6 });
  shapes.push({ d: INNER, stroke: '#FFFFFF', strokeWidth: 1.2, strokeOpacity: 0.4 });
  shapes.push({ d: FLAME, fill: '#FFFFFF' });
  if (d.step === 2) shapes.push({ d: GEM, fill: 'grad:gold', stroke: '#FFF8E5', strokeWidth: 0.6 });
  return { gradients: d.step >= 1 ? [tier, GOLD] : [tier], shapes };
}
