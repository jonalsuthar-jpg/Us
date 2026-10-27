'use client';

import { BRUSH_MAX, BRUSH_MIN, LIVE_CANVAS, notifyPartner } from '@us/shared';
import { useCouple, useDrawings, useDrawSession } from '@us/shared/react';
import { ArrowLeft, Download, Send, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { BackgroundPicker } from './background-picker';
import { Board } from './board';
import { useBgPhotoUrl, useSaveDrawing } from './hooks';
import { SaveDialog } from './save-dialog';
import { SizePicker, Toolbar, TOOL_KEYS, useBrush } from './toolbar';

/** Tool, colour and size, plus the keyboard shortcuts for them. */
export function useDrawTools(onUndo: () => void) {
  const brush = useBrush();
  const { setTool, setSize } = brush;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onUndo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (TOOL_KEYS[k]) setTool(TOOL_KEYS[k]);
      else if (k === '[') setSize((s) => Math.max(BRUSH_MIN, s - 10));
      else if (k === ']') setSize((s) => Math.min(BRUSH_MAX, s + 10));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onUndo, setTool, setSize]);
  return brush;
}

/**
 * Draw together on the web: tools to the left, the board in the middle,
 * who's here and what to do with it on the right. In a call it sits in a
 * panel over the call (`variant="call"`), audio carrying on underneath.
 */
export function LiveCanvas({ variant = 'page', onClose }: { variant?: 'page' | 'call'; onClose?: () => void }) {
  const { me, partner, partnerSlot, mySlot, partnerOnline, connection, sb } = useCouple();
  const { session, state, cursor, partnerHere } = useDrawSession(LIVE_CANVAS);
  const tools = useDrawTools(() => session.undo());
  const photoUrl = useBgPhotoUrl(state.bg);
  const save = useSaveDrawing();
  const { drawings } = useDrawings(variant === 'page');
  const [saveOpen, setSaveOpen] = useState<null | 'save' | 'memory'>(null);
  const [bgOpen, setBgOpen] = useState(false);
  const [invited, setInvited] = useState(false);
  const [saved, setSaved] = useState(false);
  const name = partner.display_name;

  const counts = useMemo(() => {
    const mine = state.strokes.filter((s) => s.by === me.id && s.tool !== 'eraser').length;
    return { mine, theirs: state.strokes.filter((s) => s.by !== me.id && s.tool !== 'eraser').length };
  }, [state.strokes, me.id]);

  async function doSave(o: { title: string; toMemory: boolean }) {
    session.finish();
    await save({ kind: 'canvas', strokes: session.snapshot.strokes, bg: session.snapshot.bg, photoUrl, title: o.title || null, toMemory: o.toMemory });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const presence = partnerHere ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-sage-50 px-3 py-1.5 text-small text-sage-700">
      <span className="h-2 w-2 rounded-full bg-sage-400" />
      {name} is drawing with you
    </span>
  ) : partnerOnline ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-paper-sunken px-3 py-1.5 text-small text-ink-soft">
      <span className="h-2 w-2 rounded-full bg-sage-400" />
      {name} is in Us. They’ll see you’re drawing.
    </span>
  ) : (
    <button
      type="button"
      disabled={invited}
      onClick={() => {
        setInvited(true);
        void notifyPartner(sb, { category: 'draw_invite' });
      }}
      className="inline-flex items-center gap-2 rounded-full bg-paper-sunken px-3 py-1.5 text-small font-semibold text-ink-soft hover:bg-rose-50 hover:text-rose-700 disabled:opacity-70"
    >
      <Send className="h-3.5 w-3.5" aria-hidden />
      {invited ? `Sent. ${name} will get a notification` : `${name} is away · Invite them`}
    </button>
  );

  const sizeRow = (
    <div className="mt-3 space-y-2">
      <SizePicker size={tools.size} onSize={tools.setSize} />
      <p className="text-right text-micro text-ink-muted">{connection === 'live' ? `Synced · ${state.strokes.length} strokes` : 'Offline · drawing here only'}</p>
    </div>
  );

  const board = (
    <Board
      session={session}
      state={state}
      tool={tools.tool}
      color={tools.color}
      size={tools.size}
      cursor={cursor}
      partnerName={name}
      partnerSlot={partnerSlot}
      photoUrl={photoUrl}
      label={`Shared drawing with ${name}, ${state.strokes.length} strokes`}
    />
  );

  const toolbarProps = {
    tool: tools.tool,
    onTool: tools.setTool,
    color: tools.color,
    onColor: tools.setColor,
    onUndo: () => session.undo(),
    canUndo: session.canUndo,
    onClear: () => session.clear(),
  };

  const dialogs = (
    <>
      <SaveDialog open={saveOpen !== null} onOpenChange={(o) => !o && setSaveOpen(null)} toMemory={saveOpen === 'memory'} onSave={doSave} />
      <BackgroundPicker open={bgOpen} onOpenChange={setBgOpen} current={state.bg} onPick={(bg) => session.setBackground(bg)} />
    </>
  );

  if (variant === 'call') {
    return (
      <section aria-label="Drawing on the call" className="flex h-full flex-col gap-3 bg-paper-sunken p-4 text-ink sm:p-5">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 font-display text-lead">Drawing on the call</h2>
          <span className="hidden text-micro text-ink-muted sm:inline">Audio keeps going</span>
          <Button size="sm" variant="secondary" onClick={() => setSaveOpen('save')}>
            <Download className="h-4 w-4" aria-hidden />
            Save
          </Button>
          <button type="button" aria-label="Close drawing" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-paper-raised text-ink-soft hover:text-ink">
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>
        <div className="mx-auto w-full max-w-[min(100%,calc((100dvh-260px)*0.75))]">{board}</div>
        <Toolbar {...toolbarProps} orientation="horizontal" className="mx-auto w-full max-w-[520px]" />
        {saved ? <p className="text-center text-small text-sage-700">Saved to Our drawings</p> : null}
        {dialogs}
      </section>
    );
  }

  return (
    <div className="min-h-dvh bg-paper-sunken">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-paper-edge bg-paper px-5 py-3.5 sm:px-6">
        <Link href="/connect" className="inline-flex items-center gap-1.5 text-small font-semibold text-ink-soft hover:text-ink">
          <ArrowLeft className="h-[18px] w-[18px]" aria-hidden />
          Connect
        </Link>
        <h1 className="min-w-0 flex-1 font-display text-heading text-ink">Draw together</h1>
        <div className="order-last w-full sm:order-none sm:w-auto">{presence}</div>
        <Button onClick={() => setSaveOpen('save')}>
          <Download className="h-[17px] w-[17px]" aria-hidden />
          {saved ? 'Saved' : 'Save drawing'}
        </Button>
      </header>

      <main className="mx-auto flex max-w-[1180px] flex-wrap items-start justify-center gap-6 p-4 sm:p-6">
        <Toolbar {...toolbarProps} className="hidden md:flex" />
        <div className="min-w-0 flex-[0_1_540px]">
          {board}
          {sizeRow}
          <Toolbar {...toolbarProps} orientation="horizontal" className="mt-3 md:hidden" />
        </div>
        <aside className="flex w-full flex-col gap-3 md:max-w-[300px] md:flex-[1_1_260px]">
          <section className="flex flex-col gap-2.5 rounded-[20px] bg-paper-raised p-4">
            <h2 className="text-body font-bold text-ink">On this canvas</h2>
            <Artist name="You" initial={me.display_name} slot={mySlot} count={counts.mine} />
            <Artist name={name} initial={name} slot={partnerSlot} count={counts.theirs} />
          </section>
          <section className="flex flex-col rounded-[20px] bg-paper-raised p-2">
            <AsideButton onClick={() => setSaveOpen('memory')}>Add to Memories</AsideButton>
            <AsideButton onClick={() => setBgOpen(true)}>Background: colouring page or photo</AsideButton>
            <Link href="/connect/draw/guess" className="rounded-xl p-3 text-body font-semibold text-ink hover:bg-paper-sunken">
              Start Draw &amp; Guess
            </Link>
            <Link href="/connect/draw/gallery" className="rounded-xl p-3 text-body font-semibold text-rose-600 hover:bg-paper-sunken">
              Our drawings ({drawings.length})
            </Link>
          </section>
          <p className="text-micro leading-[19px] text-ink-muted">
            Keys: P pen · N pencil · M marker · C calligraphy · F fill · E eraser · [ ] size · Ctrl+Z undo. Works with a pen tablet: pressure changes the line width.
          </p>
        </aside>
      </main>
      {dialogs}
    </div>
  );
}

function Artist({ name, initial, slot, count }: { name: string; initial: string; slot: 'a' | 'b'; count: number }) {
  return (
    <span className="flex items-center gap-2.5 text-body text-ink">
      <span className={cn('flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold text-white', slot === 'a' ? 'bg-rose-400' : 'bg-teal-500')}>
        {initial.slice(0, 1).toUpperCase()}
      </span>
      {name} · {count} {count === 1 ? 'stroke' : 'strokes'}
    </span>
  );
}

function AsideButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl p-3 text-left text-body font-semibold text-ink hover:bg-paper-sunken">
      {children}
    </button>
  );
}
