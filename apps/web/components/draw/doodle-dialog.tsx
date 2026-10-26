'use client';

import { DRAW_COLORS, DrawSession, notifyPartner, type DrawTool } from '@us/shared';
import { useCouple, useFeature } from '@us/shared/react';
import { Eraser, Pen, Send, Undo2 } from 'lucide-react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { Board } from './board';
import { renderPng } from './render';
import { useSaveDrawing } from './hooks';

const COLORS = [0, 1, 2, 5, 7];

/** A canvas only I see until I send it. */
export function useLocalSession() {
  const { me } = useCouple();
  const session = useMemo(() => new DrawSession('local', me.id, () => {}), [me.id]);
  const state = useSyncExternalStore(
    (fn) => session.subscribe(fn),
    () => session.snapshot,
    () => session.snapshot,
  );
  return { session, state };
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** 'doodle' leaves it on my partner's Home; 'chat' sends it as a photo in chat. */
  mode?: 'doodle' | 'chat';
  onChatPhoto?: (file: File) => void;
}

/** "Leave {name} a doodle": a small board, a line to go with it, and send. */
export function DoodleDialog({ open, onOpenChange, mode = 'doodle', onChatPhoto }: Props) {
  const { partner, sb } = useCouple();
  const { session, state } = useLocalSession();
  const save = useSaveDrawing();
  const [tool, setTool] = useState<DrawTool>('pen');
  const [color, setColor] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = partner.display_name;

  async function send() {
    session.finish();
    const strokes = session.snapshot.strokes;
    if (!strokes.length) return setError('Draw something first.');
    setBusy(true);
    setError(null);
    try {
      if (mode === 'chat') {
        const png = await renderPng(strokes, null);
        onChatPhoto?.(new File([png], 'doodle.png', { type: 'image/png' }));
      } else {
        const d = await save({ kind: 'doodle', strokes, forUser: partner.id, note: note.trim() || null });
        void notifyPartner(sb, { category: 'doodle', drawingId: d.id });
      }
      session.reset();
      setNote('');
      onOpenChange(false);
    } catch {
      setError('That didn’t send. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const iconBtn = 'flex h-[46px] w-[46px] items-center justify-center rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400';

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'chat' ? `Doodle for ${name}` : `Leave ${name} a doodle`}
      description={mode === 'chat' ? 'It goes in your chat as a picture.' : 'It waits on their Home as a sticky note until they open it.'}
      className="sm:w-[min(92vw,420px)]"
    >
      <div className="space-y-4">
        <div className="flex items-stretch gap-3">
          <div className="min-w-0 flex-1">
            <Board session={session} state={state} tool={tool} color={color} size="m" label="Your doodle" framed={false} className="rounded-[18px] border border-paper-edge" />
          </div>
          <div role="toolbar" aria-label="Tools" className="flex flex-col items-center gap-2">
            <button type="button" aria-label="Pen" aria-pressed={tool === 'pen'} onClick={() => setTool('pen')} className={cn(iconBtn, tool === 'pen' ? 'bg-plum-800 text-paper' : 'bg-paper-sunken text-ink-soft')}>
              <Pen className="h-[19px] w-[19px]" aria-hidden />
            </button>
            <button type="button" aria-label="Eraser" aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')} className={cn(iconBtn, tool === 'eraser' ? 'bg-plum-800 text-paper' : 'bg-paper-sunken text-ink-soft')}>
              <Eraser className="h-[19px] w-[19px]" aria-hidden />
            </button>
            <button type="button" aria-label="Undo" disabled={!session.canUndo} onClick={() => session.undo()} className={cn(iconBtn, 'bg-paper-sunken text-ink-soft disabled:opacity-40')}>
              <Undo2 className="h-[19px] w-[19px]" aria-hidden />
            </button>
            <div role="radiogroup" aria-label="Colour" className="mt-1.5 flex flex-col items-center gap-2">
              {COLORS.map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={color === i}
                  aria-label={DRAW_COLORS[i]!.name}
                  onClick={() => {
                    setColor(i);
                    setTool('pen');
                  }}
                  className="h-7 w-7 rounded-full"
                  style={{
                    background: DRAW_COLORS[i]!.hex,
                    boxShadow: color === i ? `0 0 0 3px rgb(var(--us-paper-raised)), 0 0 0 5px ${DRAW_COLORS[i]!.hex}` : undefined,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        {mode === 'doodle' ? (
          <label className="block space-y-1.5">
            <span className="text-micro font-semibold text-ink-soft">A line to go with it (optional)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="chai date tonight?"
              className="h-12 w-full rounded-control border border-paper-edge bg-paper-sunken px-3.5 text-body text-ink placeholder:text-ink-muted focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </label>
        ) : null}
        {error ? <p role="alert" className="text-small text-rose-700">{error}</p> : null}
        <Button block size="lg" loading={busy} onClick={() => void send()}>
          <Send className="h-[18px] w-[18px]" aria-hidden />
          {mode === 'chat' ? 'Send in chat' : `Leave it for ${name}`}
        </Button>
      </div>
    </Dialog>
  );
}

/** Whether doodles are on for us (the composer and Home use it). */
export function useDoodlesOn() {
  return useFeature('draw');
}
