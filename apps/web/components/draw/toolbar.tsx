'use client';

import { DRAW_COLORS, type DrawTool } from '@us/shared';
import { Eraser, Highlighter, Pen, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';

export const TOOLS: { id: DrawTool; label: string; key: string; Icon: typeof Pen }[] = [
  { id: 'pen', label: 'Pen', key: 'P', Icon: Pen },
  { id: 'marker', label: 'Marker', key: 'M', Icon: Highlighter },
  { id: 'eraser', label: 'Eraser', key: 'E', Icon: Eraser },
];

interface ToolbarProps {
  tool: DrawTool;
  onTool: (t: DrawTool) => void;
  color: number;
  onColor: (c: number) => void;
  onUndo: () => void;
  canUndo: boolean;
  onClear?: () => void;
  /** Rail beside the board on wide screens, a row under it on narrow ones. */
  orientation?: 'vertical' | 'horizontal';
  /** Fewer colours, for small boards. */
  colors?: number[];
  className?: string;
}

const toolBtn = 'flex h-12 w-12 items-center justify-center rounded-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400';

export function Toolbar({ tool, onTool, color, onColor, onUndo, canUndo, onClear, orientation = 'vertical', colors, className }: ToolbarProps) {
  const [confirm, setConfirm] = useState(false);
  const vertical = orientation === 'vertical';
  const palette = colors ?? DRAW_COLORS.map((_, i) => i);
  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation={orientation}
      className={cn(
        'flex gap-2 rounded-[20px] bg-paper-raised p-2.5 shadow-[0_6px_20px_rgba(23,15,33,0.06)]',
        vertical ? 'flex-col items-center' : 'flex-wrap items-center',
        className,
      )}
    >
      {TOOLS.map(({ id, label, key, Icon }) => (
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
      ))}
      <span aria-hidden className={cn('bg-paper-edge', vertical ? 'mx-1.5 my-0.5 h-px w-9' : 'mx-0.5 h-9 w-px')} />
      <div role="radiogroup" aria-label="Colour" className={cn('flex gap-2', vertical ? 'flex-col items-center' : 'flex-wrap items-center')}>
        {palette.map((i) => {
          const c = DRAW_COLORS[i]!;
          const on = color === i;
          return (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c.name}
              title={c.name}
              onClick={() => {
                onColor(i);
                if (tool === 'eraser') onTool('pen');
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              <span
                className="h-7 w-7 rounded-full"
                style={{ background: c.hex, boxShadow: on ? `0 0 0 3px rgb(var(--us-paper-raised)), 0 0 0 5px ${c.hex}` : undefined }}
              />
            </button>
          );
        })}
      </div>
      <span aria-hidden className={cn('bg-paper-edge', vertical ? 'mx-1.5 my-0.5 h-px w-9' : 'mx-0.5 h-9 w-px')} />
      <button type="button" aria-label="Undo my last stroke (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo} className={cn(toolBtn, 'text-ink-soft hover:bg-paper-sunken disabled:opacity-40')}>
        <Undo2 className="h-5 w-5" aria-hidden />
      </button>
      {onClear ? (
        <>
          <button type="button" aria-label="Clear the canvas" title="Clear" onClick={() => setConfirm(true)} className={cn(toolBtn, 'text-rose-600 hover:bg-rose-50')}>
            <Trash2 className="h-5 w-5" aria-hidden />
          </button>
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
        </>
      ) : null}
    </div>
  );
}
