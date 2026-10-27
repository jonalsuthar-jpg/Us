'use client';

import { BRUSH_MAX, BRUSH_MIN, colorOf, DRAW_SIZES, DRAW_TOOLS, type DrawColor, type DrawTool } from '@us/shared';
import { Eraser, Highlighter, PaintBucket, Pen, Pencil, PenTool, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { ColourDialog, Swatch, useRecentColours, Wheel } from './colours';

export const TOOLS: Record<DrawTool, { label: string; key: string; Icon: typeof Pen }> = {
  pen: { label: 'Pen', key: 'P', Icon: Pen },
  pencil: { label: 'Pencil', key: 'N', Icon: Pencil },
  marker: { label: 'Marker', key: 'M', Icon: Highlighter },
  calligraphy: { label: 'Calligraphy', key: 'C', Icon: PenTool },
  fill: { label: 'Fill', key: 'F', Icon: PaintBucket },
  eraser: { label: 'Eraser', key: 'E', Icon: Eraser },
};

/** Keyboard letter → tool. */
export const TOOL_KEYS: Record<string, DrawTool> = Object.fromEntries(DRAW_TOOLS.map((t) => [TOOLS[t].key.toLowerCase(), t]));

interface ToolbarProps {
  tool: DrawTool;
  onTool: (t: DrawTool) => void;
  color: DrawColor;
  onColor: (c: DrawColor) => void;
  onUndo: () => void;
  canUndo: boolean;
  onClear?: () => void;
  /** Rail beside the board on wide screens, rows under it on narrow ones. */
  orientation?: 'vertical' | 'horizontal';
  /** Which tools to offer (all of them by default). */
  tools?: DrawTool[];
  className?: string;
}

const toolBtn = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400';

/**
 * Brushes (pen, pencil, marker, calligraphy, fill, eraser), the current
 * colour with recent ones and a wheel for the full palette, undo and clear.
 */
export function Toolbar({ tool, onTool, color, onColor, onUndo, canUndo, onClear, orientation = 'vertical', tools = DRAW_TOOLS, className }: ToolbarProps) {
  const [confirm, setConfirm] = useState(false);
  const [palette, setPalette] = useState(false);
  const [recent, pushRecent] = useRecentColours();
  const vertical = orientation === 'vertical';
  const hex = colorOf(color);
  const choose = (c: DrawColor) => {
    onColor(c);
    pushRecent(c);
    if (tool === 'eraser') onTool('pen');
  };
  const divider = <span aria-hidden className={cn('shrink-0 bg-paper-edge', vertical ? 'mx-1.5 my-0.5 h-px w-9' : 'mx-0.5 h-9 w-px')} />;

  const toolButtons = tools.map((id) => {
    const { label, key, Icon } = TOOLS[id];
    return (
      <button
        key={id}
        type="button"
        aria-label={`${label} (${key})`}
        title={`${label} (${key})`}
        aria-pressed={tool === id}
        onClick={() => onTool(id)}
        className={cn(toolBtn, tool === id ? 'bg-plum-800 text-paper' : 'text-ink-soft hover:bg-paper-sunken')}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </button>
    );
  });

  const colours = (
    <div role="radiogroup" aria-label="Colour" className={cn('flex gap-2', vertical ? 'flex-col items-center' : 'flex-wrap items-center')}>
      <button
        type="button"
        aria-label={`Colour ${hex}. Open all colours`}
        title="All colours"
        onClick={() => setPalette(true)}
        className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-plum-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
      >
        <Swatch c={color} size={34} />
      </button>
      {recent.map((r, i) => (
        <button
          key={`${String(r)}-${i}`}
          type="button"
          role="radio"
          aria-checked={colorOf(r) === hex}
          aria-label={colorOf(r)}
          title={colorOf(r)}
          onClick={() => choose(r)}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          <Swatch c={r} size={28} />
        </button>
      ))}
      <button type="button" aria-label="More colours" title="More colours" onClick={() => setPalette(true)} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
        <Wheel size={32} />
      </button>
    </div>
  );

  const actions = (
    <>
      <button type="button" aria-label="Undo my last stroke (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo} className={cn(toolBtn, 'text-ink-soft hover:bg-paper-sunken disabled:opacity-40')}>
        <Undo2 className="h-5 w-5" aria-hidden />
      </button>
      {onClear ? (
        <button type="button" aria-label="Clear the canvas" title="Clear" onClick={() => setConfirm(true)} className={cn(toolBtn, 'text-rose-600 hover:bg-rose-50')}>
          <Trash2 className="h-5 w-5" aria-hidden />
        </button>
      ) : null}
    </>
  );

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation={orientation}
      className={cn('flex gap-2 rounded-[20px] bg-paper-raised p-2.5 shadow-[0_6px_20px_rgba(23,15,33,0.06)]', vertical ? 'flex-col items-center' : 'flex-col', className)}
    >
      {vertical ? (
        <>
          {toolButtons}
          {divider}
          {colours}
          {divider}
          {actions}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {toolButtons}
            <span className="ml-auto flex gap-1.5">{actions}</span>
          </div>
          {colours}
        </>
      )}
      <ColourDialog open={palette} onOpenChange={setPalette} value={color} onPick={choose} />
      {onClear ? (
        <Dialog open={confirm} onOpenChange={setConfirm} title="Clear the canvas?" description="This wipes it for both of you. Save first if you want to keep it.">
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
            <Button
              onClick={() => {
                setConfirm(false);
                onClear();
              }}
            >
              Clear
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

/** The brush I'm drawing with: tool, colour and width. */
export function useBrush(start: { tool?: DrawTool; color?: DrawColor; size?: number } = {}) {
  const [tool, setTool] = useState<DrawTool>(start.tool ?? 'pen');
  const [color, setColor] = useState<DrawColor>(start.color ?? 1);
  const [size, setSize] = useState(start.size ?? 50);
  return { tool, setTool, color, setColor, size, setSize };
}

/** Five sizes and a slider, in board units. */
export function SizePicker({ size, onSize, className }: { size: number; onSize: (w: number) => void; className?: string }) {
  return (
    <div aria-label="Brush size" className={cn('flex items-center gap-2.5 rounded-[14px] bg-paper-raised px-3 py-2', className)}>
      {DRAW_SIZES.map((s, i) => {
        const on = Math.abs(size - s.w) < 2;
        const d = [4, 7, 11, 15, 19][i]!;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={s.name}
            title={s.name}
            onClick={() => onSize(s.w)}
            className={cn('flex h-7 w-7 items-center justify-center rounded-full', on && 'ring-2 ring-rose-400')}
          >
            <span className="rounded-full" style={{ width: d, height: d, background: on ? '#241933' : '#B39ACC' }} />
          </button>
        );
      })}
      <input
        type="range"
        aria-label="Brush size"
        min={BRUSH_MIN}
        max={BRUSH_MAX}
        step={2}
        value={size}
        onChange={(e) => onSize(Number(e.target.value))}
        className="min-w-0 flex-1 accent-rose-500"
      />
      <span className="w-8 text-right text-micro text-ink-muted">{size}</span>
    </div>
  );
}
