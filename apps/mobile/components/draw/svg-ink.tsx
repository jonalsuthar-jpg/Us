import { BOARD_H, BOARD_W, fillsAndInk, inkLayers, PAGE_INK, PAGE_LINE, pageById, strokeLook, type DrawBackground, type InkLayer, type Stroke } from '@us/shared';
import { memo } from 'react';
import { Defs, G, Image as SvgImage, Mask, Path, Rect } from 'react-native-svg';

/**
 * Strokes in react-native-svg, by the shared rules (strokeLook): the same
 * path strings the web draws with Path2D. Erasers are masks over the ink drawn
 * before them, so they cut ink only, never the photo or the colouring page.
 * Lives inside an <Svg viewBox="0 0 3000 4000">.
 */
export const InkPath = memo(function InkPath({ s }: { s: Stroke }) {
  const look = strokeLook(s);
  if (!look.d) return null;
  return look.fill ? (
    <Path d={look.d} fill={look.color} fillOpacity={look.alpha} fillRule={look.evenOdd ? 'evenodd' : 'nonzero'} />
  ) : (
    <Path
      d={look.d}
      fill="none"
      stroke={look.erase ? '#000' : look.color}
      strokeOpacity={look.alpha}
      strokeWidth={look.width}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
});

function Layer({ layer, depth, id }: { layer: InkLayer; depth: number; id: string }) {
  const maskId = `${id}-cut-${depth}`;
  return (
    <G>
      {layer.below ? (
        layer.cut.length ? (
          <>
            <Defs>
              <Mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={BOARD_W} height={BOARD_H}>
                <Rect x={0} y={0} width={BOARD_W} height={BOARD_H} fill="#fff" />
                {layer.cut.map((s) => (
                  <InkPath key={s.id} s={s} />
                ))}
              </Mask>
            </Defs>
            <G mask={`url(#${maskId})`}>
              <Layer layer={layer.below} depth={depth + 1} id={id} />
            </G>
          </>
        ) : (
          <Layer layer={layer.below} depth={depth + 1} id={id} />
        )
      ) : null}
      {layer.ink.map((s) => (
        <InkPath key={s.id} s={s} />
      ))}
    </G>
  );
}

/**
 * All finished ink: bucket fills first (they sit under the lines), then the
 * lines, layered for the eraser. Re-renders only when the strokes change.
 */
export const InkLayers = memo(function InkLayers({ strokes, id }: { strokes: Stroke[]; id: string }) {
  const { fills, ink } = fillsAndInk(strokes);
  return (
    <G>
      {fills.map((s) => (
        <InkPath key={s.id} s={s} />
      ))}
      <Layer layer={inkLayers(ink)} depth={0} id={id} />
    </G>
  );
});

export function PageLines({ bg }: { bg?: DrawBackground | null }) {
  const page = bg?.kind === 'page' ? pageById(bg.id) : null;
  if (!page) return null;
  return (
    <G fill="none" stroke={PAGE_INK} strokeWidth={PAGE_LINE} strokeLinecap="round" strokeLinejoin="round">
      {page.paths.map((d, i) => (
        <Path key={i} d={d} />
      ))}
    </G>
  );
}

export function PhotoBackground({ uri }: { uri?: string | null }) {
  if (!uri) return null;
  return <SvgImage href={{ uri }} x={0} y={0} width={BOARD_W} height={BOARD_H} preserveAspectRatio="xMidYMid slice" />;
}
