import { BOARD_H, BOARD_W, fillsAndInk, inkLayers, PAGE_INK, PAGE_LINE, pageById, strokeLook, type DrawBackground, type InkLayer, type Stroke } from '@us/shared';
import { Fragment } from 'react';

/**
 * The phone's way of drawing (react-native-svg), in web SVG: the same paths,
 * erasers as masks over the ink before them. The draw lab renders this beside
 * the canvas to prove both pictures match.
 */
function Ink({ s }: { s: Stroke }) {
  const look = strokeLook(s);
  if (!look.d) return null;
  return look.fill ? (
    <path d={look.d} fill={look.color} fillOpacity={look.alpha} fillRule={look.evenOdd ? 'evenodd' : 'nonzero'} />
  ) : (
    <path d={look.d} fill="none" stroke={look.erase ? '#000' : look.color} strokeOpacity={look.alpha} strokeWidth={look.width} strokeLinecap="round" strokeLinejoin="round" />
  );
}

function Layer({ layer, depth, id }: { layer: InkLayer; depth: number; id: string }) {
  const maskId = `${id}-cut-${depth}`;
  return (
    <>
      {layer.below ? (
        layer.cut.length ? (
          <>
            <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={BOARD_W} height={BOARD_H}>
              <rect x={0} y={0} width={BOARD_W} height={BOARD_H} fill="#fff" />
              {layer.cut.map((s) => (
                <Ink key={s.id} s={s} />
              ))}
            </mask>
            <g mask={`url(#${maskId})`}>
              <Layer layer={layer.below} depth={depth + 1} id={id} />
            </g>
          </>
        ) : (
          <Layer layer={layer.below} depth={depth + 1} id={id} />
        )
      ) : null}
      {layer.ink.map((s) => (
        <Ink key={s.id} s={s} />
      ))}
    </>
  );
}

export function SvgInk({ strokes, bg, id = 'ink', className }: { strokes: Stroke[]; bg?: DrawBackground | null; id?: string; className?: string }) {
  const page = bg?.kind === 'page' ? pageById(bg.id) : null;
  return (
    <svg viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} className={className} style={{ background: '#fff' }}>
      {fillsAndInk(strokes).fills.map((s) => (
        <Ink key={s.id} s={s} />
      ))}
      <Layer layer={inkLayers(fillsAndInk(strokes).ink)} depth={0} id={id} />
      {page ? (
        <g fill="none" stroke={PAGE_INK} strokeWidth={PAGE_LINE} strokeLinecap="round" strokeLinejoin="round">
          {page.paths.map((d, i) => (
            <Fragment key={i}>
              <path d={d} />
            </Fragment>
          ))}
        </g>
      ) : null}
    </svg>
  );
}
