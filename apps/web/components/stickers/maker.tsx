'use client';

import {
  DrawSession,
  saveSticker,
  STICKER_SIZE,
  STICKER_TEXT_STYLES,
  stickerTextBox,
  STICKERS_TOPIC,
  strokeWidth,
  uuid,
  type Sticker,
  type StickerText,
  type StickerTextStyle,
} from '@us/shared';
import { useCouple } from '@us/shared/react';
import { ImagePlus, Pencil, Type } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { drawInk } from '@/components/draw/render';
import { Toolbar, useBrush } from '@/components/draw/toolbar';
import { Button, Spinner } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { composeSticker, liftSubject, loadImage, squarePhoto, warmCutout } from './cutout';

/** Sticker space: ink and text are laid out on a 3000 × 3000 square. */
const B = 3000;
const OUTLINE = 14;
const FONT = '700 1px Inter, system-ui, sans-serif';
const SIZES = [0.09, 0.13, 0.18];

/** A sticker's text on a canvas, the same look the phone draws in SVG. */
function paintText(ctx: CanvasRenderingContext2D, t: StickerText, size: number) {
  const st = STICKER_TEXT_STYLES.find((s) => s.id === t.style) ?? STICKER_TEXT_STYLES[0];
  const fs = t.size * size;
  const box = stickerTextBox(t);
  const cx = t.x * size;
  const cy = t.y * size;
  ctx.save();
  if (st.bg) {
    ctx.fillStyle = st.bg;
    ctx.beginPath();
    ctx.roundRect(cx - (box.w * size) / 2, cy - (box.h * size) / 2, box.w * size, box.h * size, (box.h * size) / 2.4);
    ctx.fill();
  }
  ctx.font = FONT.replace('1px', `${fs}px`);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const baseline = cy + fs * 0.36;
  if (st.stroke) {
    ctx.strokeStyle = st.stroke;
    ctx.lineWidth = fs * 0.24;
    ctx.lineJoin = 'round';
    ctx.strokeText(t.text, cx, baseline);
  }
  ctx.fillStyle = st.fill;
  ctx.fillText(t.text, cx, baseline);
  ctx.restore();
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (s: Sticker, send: boolean) => void;
}

/**
 * Make a sticker from a photo: tap the subject to lift it out (with a white
 * outline), add text and draw on it, save as a 512 × 512 transparent PNG.
 */
export function StickerMaker({ open, onOpenChange, onSaved }: Props) {
  const { sb, couple, me, channel } = useCouple();
  const file = useRef<HTMLInputElement>(null);
  const ink = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const session = useMemo(() => new DrawSession('sticker', me.id, () => {}), [me.id]);
  const state = useSyncExternalStore(
    (fn) => session.subscribe(fn),
    () => session.snapshot,
    () => session.snapshot,
  );
  const brush = useBrush({ color: 0, size: 70 });
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [subject, setSubject] = useState<HTMLCanvasElement | null>(null);
  const [whole, setWhole] = useState(false);
  const [outline, setOutline] = useState(true);
  const [busy, setBusy] = useState<null | 'lift' | 'save' | 'send'>(null);
  const [note, setNote] = useState<string | null>(null);
  const [mode, setMode] = useState<'text' | 'draw'>('text');
  const [texts, setTexts] = useState<StickerText[]>([]);
  const [editing, setEditing] = useState<StickerText | null>(null);
  const [stage, setStage] = useState(360);
  const drawing = useRef(false);
  const drag = useRef<{ id: string; x: number; y: number; px: number; py: number; moved: boolean } | null>(null);

  const base = useMemo(() => {
    if (!photo) return null;
    if (subject && !whole) return composeSticker(subject, outline ? OUTLINE : 0);
    return whole ? squarePhoto(photo) : null;
  }, [photo, subject, whole, outline]);
  const baseUrl = useMemo(() => base?.toDataURL('image/png') ?? null, [base]);

  useEffect(() => {
    if (!open) {
      setPhoto(null);
      setSubject(null);
      setWhole(false);
      setTexts([]);
      setNote(null);
      session.reset();
      return;
    }
    warmCutout();
  }, [open, session]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, photo]);

  // Ink on its own canvas, so the eraser cuts ink only.
  useEffect(() => {
    const c = ink.current;
    if (!c) return;
    const px = Math.round(stage * Math.min(window.devicePixelRatio || 1, 2));
    if (c.width !== px) c.width = c.height = px;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, px, px);
    drawInk(ctx, state.strokes, px);
  }, [state, stage, baseUrl]);

  async function onPhoto(f: File) {
    setNote(null);
    setSubject(null);
    setWhole(false);
    session.reset();
    setTexts([]);
    setPhoto(await loadImage(URL.createObjectURL(f)));
  }

  async function lift(e: React.MouseEvent<HTMLImageElement>) {
    if (!photo || busy) return;
    const r = e.currentTarget.getBoundingClientRect();
    setBusy('lift');
    setNote(null);
    try {
      const s = await liftSubject(photo, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      if (s) setSubject(s);
      else setNote('Nothing to lift out there. Tap right on the person or thing, or use the whole photo.');
    } catch {
      setNote('The cut-out couldn’t load. Check your connection, or use the whole photo.');
    } finally {
      setBusy(null);
    }
  }

  const toBoard = (e: React.PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * B, ((e.clientY - r.top) / r.height) * B] as const;
  };

  async function save(send: boolean) {
    if (!base) return;
    setBusy(send ? 'send' : 'save');
    try {
      session.finish();
      const out = document.createElement('canvas');
      out.width = out.height = STICKER_SIZE;
      const ctx = out.getContext('2d')!;
      ctx.drawImage(base, 0, 0, STICKER_SIZE, STICKER_SIZE);
      const inkLayer = document.createElement('canvas');
      inkLayer.width = inkLayer.height = STICKER_SIZE;
      drawInk(inkLayer.getContext('2d')!, session.snapshot.strokes, STICKER_SIZE);
      ctx.drawImage(inkLayer, 0, 0);
      await document.fonts?.ready;
      for (const t of texts) paintText(ctx, t, STICKER_SIZE);
      const png = await new Promise<Blob>((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('No picture'))), 'image/png'));
      const sticker = await saveSticker(sb, { coupleId: couple.id, me: me.id, png });
      channel.sendChanged(STICKERS_TOPIC);
      onSaved(sticker, send);
      onOpenChange(false);
    } catch {
      setNote('That didn’t save. Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New sticker" className="sm:w-[min(94vw,480px)]">
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void onPhoto(f);
        }}
      />
      <div className="max-h-[78vh] space-y-3 overflow-y-auto pr-1">
        {!photo ? (
          <button
            type="button"
            onClick={() => file.current?.click()}
            className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-rose-300 text-rose-700 hover:bg-rose-50"
          >
            <ImagePlus className="h-7 w-7" aria-hidden />
            <span className="text-body font-semibold">Choose a photo</span>
            <span className="max-w-[16rem] text-center text-small text-ink-soft">Then tap the person or thing to lift it out of the background.</span>
          </button>
        ) : !base ? (
          <div className="space-y-2">
            <p className="text-small text-ink-soft">Tap the person or thing to lift out.</p>
            <div className="relative overflow-hidden rounded-[20px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.src} alt="Your photo. Tap the subject" onClick={(e) => void lift(e)} className={cn('block w-full cursor-crosshair', busy && 'opacity-60')} />
              {busy === 'lift' ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60">
                  <Spinner className="h-6 w-6 text-rose-500" />
                  <span className="text-small text-ink-soft">Lifting it out…</span>
                </div>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setWhole(true)}>
                Use the whole photo
              </Button>
              <Button variant="quiet" size="sm" onClick={() => file.current?.click()}>
                Another photo
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div
              ref={stageRef}
              className="relative aspect-square w-full touch-none select-none overflow-hidden rounded-[20px]"
              style={{ backgroundImage: 'conic-gradient(#EDE8EC 25%, #FFFFFF 0 50%, #EDE8EC 0 75%, #FFFFFF 0)', backgroundSize: '24px 24px' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={baseUrl!} alt="" className="pointer-events-none absolute inset-0 h-full w-full" />
              <canvas
                ref={ink}
                aria-label="Draw on the sticker"
                className={cn('absolute inset-0 h-full w-full', mode === 'draw' ? 'cursor-crosshair' : 'pointer-events-none')}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  drawing.current = true;
                  const [x, y] = toBoard(e);
                  session.begin(x, y, brush.tool, brush.color, strokeWidth(brush.tool, brush.size));
                }}
                onPointerMove={(e) => {
                  if (!drawing.current) return;
                  const [x, y] = toBoard(e);
                  session.move(x, y);
                }}
                onPointerUp={() => {
                  drawing.current = false;
                  session.finish();
                }}
              />
              {texts.map((t) => {
                const st = STICKER_TEXT_STYLES.find((s) => s.id === t.style) ?? STICKER_TEXT_STYLES[0];
                const box = stickerTextBox(t);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-label={`Text: ${t.text}. Drag to move, click to edit`}
                    onPointerDown={(e) => {
                      if (mode !== 'text') return;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      drag.current = { id: t.id, x: t.x, y: t.y, px: e.clientX, py: e.clientY, moved: false };
                    }}
                    onPointerMove={(e) => {
                      const d = drag.current;
                      if (!d || d.id !== t.id) return;
                      const dx = (e.clientX - d.px) / stage;
                      const dy = (e.clientY - d.py) / stage;
                      if (Math.abs(dx) + Math.abs(dy) > 0.01) d.moved = true;
                      setTexts((all) => all.map((o) => (o.id === t.id ? { ...o, x: Math.max(0.05, Math.min(0.95, d.x + dx)), y: Math.max(0.05, Math.min(0.95, d.y + dy)) } : o)));
                    }}
                    onPointerUp={() => {
                      const d = drag.current;
                      drag.current = null;
                      if (d && !d.moved) setEditing(t);
                    }}
                    className={cn('absolute flex items-center justify-center whitespace-nowrap font-bold leading-none', mode === 'text' ? 'cursor-move outline-dashed outline-2 outline-rose-400' : 'pointer-events-none')}
                    style={{
                      left: `${(t.x - box.w / 2) * 100}%`,
                      top: `${(t.y - box.h / 2) * 100}%`,
                      width: `${box.w * 100}%`,
                      height: `${box.h * 100}%`,
                      fontSize: t.size * stage,
                      color: st.fill,
                      background: st.bg ?? undefined,
                      borderRadius: st.bg ? (box.h * stage) / 2.4 : 12,
                      WebkitTextStroke: st.stroke ? `${t.size * stage * 0.12}px ${st.stroke}` : undefined,
                      paintOrder: 'stroke fill',
                    }}
                  >
                    {t.text}
                  </button>
                );
              })}
            </div>

            {note ? <p className="text-small text-ink-soft">{note}</p> : null}
            <div className="flex flex-wrap items-center gap-3">
              <div role="radiogroup" aria-label="Sticker" className="flex flex-1 rounded-xl bg-paper-sunken p-1">
                <button type="button" role="radio" aria-checked={!whole} disabled={!subject} onClick={() => setWhole(false)} className={cn('h-9 flex-1 rounded-lg text-small font-semibold disabled:opacity-40', !whole ? 'bg-plum-800 text-paper' : 'text-ink-soft')}>
                  Cut-out
                </button>
                <button type="button" role="radio" aria-checked={whole} onClick={() => setWhole(true)} className={cn('h-9 flex-1 rounded-lg text-small font-semibold', whole ? 'bg-plum-800 text-paper' : 'text-ink-soft')}>
                  Whole photo
                </button>
              </div>
              {!whole ? (
                <label className="flex items-center gap-2 text-small text-ink-soft">
                  <input type="checkbox" checked={outline} onChange={(e) => setOutline(e.target.checked)} className="h-4 w-4 accent-rose-600" />
                  White outline
                </label>
              ) : null}
            </div>
            {!subject && !whole ? null : (
              <button type="button" onClick={() => { setSubject(null); setWhole(false); }} className="text-small font-semibold text-rose-600">
                Pick the subject again
              </button>
            )}

            <div role="tablist" className="flex gap-2">
              <button type="button" role="tab" aria-selected={mode === 'text'} onClick={() => setMode('text')} className={cn('flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-small font-semibold', mode === 'text' ? 'bg-plum-800 text-paper' : 'bg-paper-sunken text-ink-soft')}>
                <Type className="h-4 w-4" aria-hidden /> Text
              </button>
              <button type="button" role="tab" aria-selected={mode === 'draw'} onClick={() => setMode('draw')} className={cn('flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-small font-semibold', mode === 'draw' ? 'bg-plum-800 text-paper' : 'bg-paper-sunken text-ink-soft')}>
                <Pencil className="h-4 w-4" aria-hidden /> Draw
              </button>
            </div>
            {mode === 'draw' ? (
              <Toolbar
                tools={['pen', 'pencil', 'marker', 'calligraphy', 'eraser']}
                tool={brush.tool}
                onTool={brush.setTool}
                color={brush.color}
                onColor={brush.setColor}
                onUndo={() => session.undo()}
                canUndo={session.canUndo}
                orientation="horizontal"
                className="bg-transparent p-0 shadow-none"
              />
            ) : (
              <Button variant="secondary" block onClick={() => setEditing({ id: uuid(), text: '', style: 'outline', x: 0.5, y: texts.length ? 0.2 : 0.82, size: 0.13 })}>
                <Type className="h-4 w-4" aria-hidden /> Add text
              </Button>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" className="flex-1" loading={busy === 'save'} disabled={!!busy} onClick={() => void save(false)}>
                Save
              </Button>
              <Button className="flex-[1.4]" loading={busy === 'send'} disabled={!!busy} onClick={() => void save(true)}>
                Save &amp; send
              </Button>
            </div>
          </>
        )}
      </div>
      {editing ? (
        <TextEditor
          value={editing}
          onCancel={() => setEditing(null)}
          onDone={(t) => {
            setEditing(null);
            setTexts((all) => (t.text.trim() ? (all.some((o) => o.id === t.id) ? all.map((o) => (o.id === t.id ? t : o)) : [...all, t]) : all.filter((o) => o.id !== t.id)));
          }}
        />
      ) : null}
    </Dialog>
  );
}

function TextEditor({ value, onCancel, onDone }: { value: StickerText; onCancel: () => void; onDone: (t: StickerText) => void }) {
  const [t, setT] = useState(value);
  return (
    <div className="mt-3 space-y-3 rounded-[18px] border border-paper-edge bg-paper-raised p-3">
      <input
        autoFocus
        value={t.text}
        maxLength={40}
        onChange={(e) => setT({ ...t, text: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && onDone(t)}
        placeholder="Say something"
        aria-label="Sticker text"
        className="h-11 w-full rounded-control border border-paper-edge bg-paper-sunken px-3 text-body text-ink focus:outline-none focus:ring-2 focus:ring-rose-200"
      />
      <div role="radiogroup" aria-label="Look" className="flex gap-2">
        {STICKER_TEXT_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={t.style === s.id}
            aria-label={s.name}
            onClick={() => setT({ ...t, style: s.id as StickerTextStyle })}
            className={cn('h-10 flex-1 rounded-xl border-2 text-body font-bold', t.style === s.id ? 'border-plum-800' : 'border-transparent')}
            style={{ background: s.bg ?? '#9A93A3', color: s.fill }}
          >
            Aa
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Size" className="flex gap-2">
        {SIZES.map((v, i) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={t.size === v}
            aria-label={['Small', 'Medium', 'Large'][i]}
            onClick={() => setT({ ...t, size: v })}
            className={cn('h-9 flex-1 rounded-xl font-bold', t.size === v ? 'bg-plum-800 text-paper' : 'bg-paper-sunken text-ink-soft')}
            style={{ fontSize: 13 + i * 4 }}
          >
            A
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={() => onDone({ ...t, text: '' })}>
          Remove
        </Button>
        <Button variant="quiet" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" className="flex-[2]" onClick={() => onDone(t)}>
          Done
        </Button>
      </div>
    </div>
  );
}
