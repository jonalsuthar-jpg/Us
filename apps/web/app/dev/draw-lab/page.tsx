'use client';

/**
 * Dev-only draw lab: two canvases ("laptop" and "phone") joined by an
 * in-memory channel, running the same DrawHub the app uses, plus the phone's
 * SVG renderer drawing the phone's copy. Draw on either board and the others
 * follow. window.__lab exposes the hubs for automated checks.
 */
import { DrawHub, type DrawEvent, type DrawTool } from '@us/shared';
import { notFound } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Board } from '@/components/draw/board';
import { SvgInk } from '@/components/draw/svg-ink';
import { Toolbar } from '@/components/draw/toolbar';

function link() {
  const ends: ((e: DrawEvent) => void)[][] = [[], []];
  const make = (i: number) => ({
    send: (e: DrawEvent) => setTimeout(() => ends[1 - i]!.forEach((fn) => fn(JSON.parse(JSON.stringify(e)))), 15),
    on: (fn: (e: DrawEvent) => void) => {
      ends[i]!.push(fn);
      return () => {};
    },
  });
  return [new DrawHub('laptop-user', make(0)), new DrawHub('phone-user', make(1))] as const;
}

function useSession(hub: DrawHub) {
  const session = useMemo(() => hub.session('live'), [hub]);
  const state = useSyncExternalStore(
    (fn) => session.subscribe(fn),
    () => session.snapshot,
    () => session.snapshot,
  );
  const [cursor, setCursor] = useState(session.partnerCursor);
  useEffect(() => session.onCursor(setCursor), [session]);
  return { session, state, cursor };
}

export default function DrawLab() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Lab />;
}

function Lab() {
  const [laptop, phone] = useMemo(link, []);
  const a = useSession(laptop);
  const b = useSession(phone);
  const [tool, setTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState(1);

  useEffect(() => {
    (window as unknown as { __lab: unknown }).__lab = { laptop: a.session, phone: b.session };
  }, [a.session, b.session]);

  return (
    <div className="min-h-dvh bg-paper-sunken p-6 text-ink">
      <h1 className="mb-1 font-display text-heading">Draw lab</h1>
      <p className="mb-5 text-small text-ink-soft">Laptop board (canvas, 540 px) · phone board (canvas, 358 px) · phone renderer (SVG with masks)</p>
      <div className="flex flex-wrap items-start gap-6">
        <Toolbar tool={tool} onTool={setTool} color={color} onColor={setColor} onUndo={() => a.session.undo()} canUndo={a.session.canUndo} onClear={() => a.session.clear()} />
        <div data-testid="laptop" className="w-[540px]">
          <Board session={a.session} state={a.state} tool={tool} color={color} size={50} cursor={a.cursor} partnerName="Phone" partnerSlot="b" label="Laptop board" />
          <p className="mt-2 text-micro text-ink-muted" data-testid="laptop-count">{a.state.strokes.length}</p>
        </div>
        <div data-testid="phone" className="w-[358px]">
          <Board session={b.session} state={b.state} tool={tool} color={(color + 4) % 8} size="m" cursor={b.cursor} partnerName="Laptop" partnerSlot="a" label="Phone board" />
          <p className="mt-2 text-micro text-ink-muted" data-testid="phone-count">{b.state.strokes.length}</p>
        </div>
        <div data-testid="svg" className="w-[358px]">
          <SvgInk strokes={b.state.strokes} bg={b.state.bg} id="lab" className="aspect-[3/4] w-full rounded-[24px]" />
        </div>
      </div>
    </div>
  );
}
