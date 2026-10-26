'use client';

import { strokeWidth, toBoard, tokens, BOARD_H, BOARD_W, type DrawSession, type DrawSize, type DrawState, type DrawTool, type PartnerCursor, type PartnerSlot } from '@us/shared';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { compose, loadImage } from './render';

interface BoardProps {
  session: DrawSession;
  state: DrawState;
  tool: DrawTool;
  color: number;
  /** A preset or a width in board units. */
  size: DrawSize | number;
  /** My partner's pen, shown as a dot with their initial. */
  cursor?: PartnerCursor | null;
  partnerName?: string;
  partnerSlot?: PartnerSlot;
  /** Signed URL for a photo background, if the canvas has one. */
  photoUrl?: string | null;
  disabled?: boolean;
  label: string;
  className?: string;
  /** Round the corners and lift the board off the page. */
  framed?: boolean;
}

/**
 * The canvas: always 3:4, as wide as its box allows. Pointer events (mouse,
 * touch, pen with pressure) become strokes in board units; the picture is
 * drawn at device resolution whenever the session changes.
 */
export function Board({
  session,
  state,
  tool,
  color,
  size,
  cursor,
  partnerName,
  partnerSlot = 'b',
  photoUrl,
  disabled,
  label,
  className,
  framed = true,
}: BoardProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ink = useRef<HTMLCanvasElement | null>(null);
  const [px, setPx] = useState({ w: 0, h: 0, dpr: 1 });
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const drawing = useRef(false);

  // Device pixels follow the box.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      setPx({ w: Math.round(w * dpr), h: Math.round(((w * BOARD_H) / BOARD_W) * dpr), dpr });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    setPhoto(null);
    if (photoUrl) void loadImage(photoUrl).then((img) => live && setPhoto(img)).catch(() => {});
    return () => {
      live = false;
    };
  }, [photoUrl]);

  // Redraw on the next frame after anything changes.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !px.w) return;
    if (c.width !== px.w || c.height !== px.h) {
      c.width = px.w;
      c.height = px.h;
    }
    const raf = requestAnimationFrame(() => {
      ink.current ??= document.createElement('canvas');
      compose(c.getContext('2d')!, ink.current, state.strokes, state.bg, photo);
    });
    return () => cancelAnimationFrame(raf);
  }, [state, px, photo]);

  function point(e: React.PointerEvent | PointerEvent): [number, number] {
    const r = canvas.current!.getBoundingClientRect();
    return toBoard(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
  }
  const pressureOf = (e: React.PointerEvent | PointerEvent) => (e.pointerType === 'pen' ? e.pressure : undefined);

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const [x, y] = point(e);
    session.begin(x, y, tool, color, strokeWidth(tool, size), pressureOf(e));
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    if (!drawing.current) {
      if (e.pointerType === 'mouse') {
        const [x, y] = point(e);
        session.cursor(x, y);
      }
      return;
    }
    const events = 'getCoalescedEvents' in e.nativeEvent ? e.nativeEvent.getCoalescedEvents() : [];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const [x, y] = point(ev);
      session.move(x, y, pressureOf(ev));
    }
  }

  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    session.finish();
  }

  const dot = partnerSlot === 'a' ? tokens.partner.a.base : tokens.partner.b.base;

  return (
    <div
      ref={wrap}
      className={cn(
        'relative aspect-[3/4] w-full overflow-hidden bg-white',
        framed && 'rounded-[24px] shadow-[0_16px_40px_rgba(23,15,33,0.10)]',
        className,
      )}
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={label}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={() => !drawing.current && session.cursor(-1, -1)}
        className={cn('absolute inset-0 h-full w-full touch-none select-none', disabled ? 'cursor-default' : 'cursor-crosshair')}
      />
      {cursor && partnerName ? (
        <span
          aria-hidden
          className="pointer-events-none absolute flex h-[26px] w-[26px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-[12px] font-bold text-white shadow-[0_2px_6px_rgba(0,0,0,0.2)] transition-[left,top] duration-100 ease-linear"
          style={{ left: `${(cursor.x / BOARD_W) * 100}%`, top: `${(cursor.y / BOARD_H) * 100}%`, background: dot }}
        >
          {partnerName.slice(0, 1).toUpperCase()}
        </span>
      ) : null}
    </div>
  );
}
