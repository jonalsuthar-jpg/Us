import {
  BOARD_H,
  BOARD_W,
  centerPath,
  EXPORT_H,
  EXPORT_W,
  strokeWidth,
  toBoard,
  tokens,
  type DrawColor,
  type DrawSession,
  type DrawSize,
  type DrawState,
  type DrawTool,
  type PartnerCursor,
  type PartnerSlot,
  type Stroke,
} from '@us/shared';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path, Rect } from 'react-native-svg';
import { cn } from '../ui/cn';
import { Text } from '../ui/text';
import { InkLayers, InkPath, PageLines, PhotoBackground } from './svg-ink';

export interface BoardHandle {
  /** The picture as a PNG, EXPORT_W × EXPORT_H, whatever the screen. */
  toPng(): Promise<Uint8Array>;
  /** The same, as a data: URL (to show before it's uploaded). */
  toDataUrl(): Promise<string>;
}

interface BoardProps {
  session: DrawSession;
  state: DrawState;
  tool: DrawTool;
  color: DrawColor;
  size: DrawSize | number;
  cursor?: PartnerCursor | null;
  partnerName?: string;
  partnerSlot?: PartnerSlot;
  photoUrl?: string | null;
  disabled?: boolean;
  label: string;
  /** Width in points; the height follows (3:4). Defaults to the width it's given. */
  width?: number;
  className?: string;
  /** Lift it off the page with a soft shadow. */
  raised?: boolean;
}

let ids = 0;

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The canvas on a phone: react-native-svg, one finger draws (gesture-handler
 * Pan), points go to the session in board units. Finished strokes render once
 * (memoised); only the stroke in progress redraws as the finger moves.
 */
export const Board = forwardRef<BoardHandle, BoardProps>(function Board(
  { session, state, tool, color, size, cursor, partnerName, partnerSlot = 'b', photoUrl, disabled, label, width: fixed, className, raised = true },
  ref,
) {
  const [measured, setMeasured] = useState(0);
  const width = fixed ?? measured;
  const height = Math.round((width * BOARD_H) / BOARD_W);
  const svg = useRef<Svg>(null);
  const id = useMemo(() => `board${ids++}`, []);

  useImperativeHandle(ref, () => ({
    toDataUrl: () =>
      new Promise<string>((resolve, reject) => {
        const node = svg.current as unknown as { toDataURL?: (cb: (b64: string) => void, o?: { width: number; height: number }) => void } | null;
        if (!node?.toDataURL) return reject(new Error('Board not ready'));
        node.toDataURL((b64) => resolve(`data:image/png;base64,${b64}`), { width: EXPORT_W, height: EXPORT_H });
      }),
    toPng: async function (this: BoardHandle) {
      const url = await this.toDataUrl();
      return base64ToBytes(url.slice(url.indexOf(',') + 1));
    },
  }));

  // Finished strokes change rarely; key them so the big layer tree only re-renders then.
  const key = state.strokes.filter((s) => !s.live).map((s) => `${s.id}:${s.p.length}`).join('|');
  const finished = useMemo<Stroke[]>(() => state.strokes.filter((s) => !s.live), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = state.strokes.filter((s) => s.live);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .runOnJS(true)
        .enabled(!disabled && width > 0)
        .onBegin((e) => {
          const [x, y] = toBoard(e.x, e.y, width, height);
          session.begin(x, y, tool, color, strokeWidth(tool, size));
        })
        .onUpdate((e) => {
          const [x, y] = toBoard(e.x, e.y, width, height);
          session.move(x, y);
        })
        .onFinalize(() => session.finish()),
    [session, tool, color, size, width, height, disabled],
  );

  const dot = partnerSlot === 'a' ? tokens.partner.a.base : tokens.partner.b.base;

  return (
    <View
      onLayout={fixed ? undefined : (e) => setMeasured(Math.floor(e.nativeEvent.layout.width))}
      className={cn('w-full', className)}
      style={fixed ? { width: fixed } : undefined}
    >
      <GestureDetector gesture={pan}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={label}
          collapsable={false}
          className={cn('overflow-hidden rounded-[20px] bg-white')}
          style={[
            { width: width || '100%', height: height || undefined, aspectRatio: width ? undefined : BOARD_W / BOARD_H },
            raised ? { elevation: 6, shadowColor: '#170F21', shadowOpacity: 0.1, shadowRadius: 15, shadowOffset: { width: 0, height: 10 } } : null,
          ]}
        >
          {width > 0 ? (
            <Svg ref={svg} width={width} height={height} viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}>
              <Rect x={0} y={0} width={BOARD_W} height={BOARD_H} fill="#FFFFFF" />
              <PhotoBackground uri={state.bg?.kind === 'photo' ? photoUrl : null} />
              <InkLayers strokes={finished} id={id} />
              {live.map((s) =>
                // An eraser in progress shows as paper until it lands; then it cuts the ink for real.
                s.tool === 'eraser' ? (
                  <Path key={s.id} d={centerPath(s.p)} fill="none" stroke="#FFFFFF" strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <InkPath key={s.id} s={s} />
                ),
              )}
              <PageLines bg={state.bg} />
            </Svg>
          ) : null}
          {cursor && partnerName && width ? (
            <View
              pointerEvents="none"
              className="absolute h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-white"
              style={{ left: (cursor.x / BOARD_W) * width - 11, top: (cursor.y / BOARD_H) * height - 11, backgroundColor: dot, elevation: 3 }}
            >
              <Text className="text-[11px] font-sans-bold leading-[13px] text-white">{partnerName.slice(0, 1).toUpperCase()}</Text>
            </View>
          ) : null}
        </View>
      </GestureDetector>
    </View>
  );
});
