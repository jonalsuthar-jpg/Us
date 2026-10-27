'use client';

import { useCouple, useDailyDoodle } from '@us/shared/react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Board } from './board';
import { useLocalSession } from './doodle-dialog';
import { useSaveDrawing } from './hooks';
import { SizePicker, Toolbar, useBrush } from './toolbar';

/** Today's doodle: draw yours, then see your partner's beside it. */
export function DailyDoodle() {
  const { me, partner } = useCouple();
  const daily = useDailyDoodle();
  const { session, state } = useLocalSession();
  const save = useSaveDrawing();
  const { tool, setTool, color, setColor, size, setSize } = useBrush();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = partner.display_name;
  const mine = daily.drawings.find((d) => d.created_by === me.id);
  const theirs = daily.drawings.find((d) => d.created_by !== me.id);

  return (
    <div className="mx-auto max-w-[980px] space-y-6 px-5 py-8 sm:px-6">
      <header className="space-y-1.5">
        <Link href="/connect" className="inline-flex items-center gap-1 text-small font-semibold text-rose-600 hover:text-rose-700">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Connect
        </Link>
        <p className="text-micro font-bold uppercase tracking-[0.06em] text-ink-muted">Today’s doodle</p>
        <h1 className="font-display text-[34px] leading-[40px] text-ink">“{daily.prompt}”</h1>
        <p className="font-serif text-lead font-light italic text-ink-soft">
          {daily.mine ? (daily.partner ? 'Here are both of yours.' : `${name} hasn’t drawn theirs yet. It shows here when they do.`) : `Draw yours. ${name}’s stays hidden until you have.`}
        </p>
      </header>

      {daily.mine ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {[
            { d: mine, who: 'You' },
            { d: theirs, who: name },
          ].map(({ d, who }) => (
            <figure key={who} className="m-0 space-y-2">
              <div className="aspect-[3/4] overflow-hidden rounded-[24px] border border-paper-edge bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {d && daily.urls[d.png_path] ? (
                  <img src={daily.urls[d.png_path]} alt={`${who}’s doodle`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center p-6 text-center font-serif text-lead italic text-ink-muted">Not drawn yet</div>
                )}
              </div>
              <figcaption className="text-body font-semibold text-ink">{who}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-center gap-6">
          <Toolbar tool={tool} onTool={setTool} color={color} onColor={setColor} onUndo={() => session.undo()} canUndo={session.canUndo} className="hidden md:flex" />
          <div className="min-w-0 flex-[0_1_480px] space-y-3">
            <Board session={session} state={state} tool={tool} color={color} size={size} label={`Your doodle of ${daily.prompt}`} />
            <SizePicker size={size} onSize={setSize} />
            <Toolbar tool={tool} onTool={setTool} color={color} onColor={setColor} onUndo={() => session.undo()} canUndo={session.canUndo} orientation="horizontal" className="md:hidden" />
            {error ? <p role="alert" className="text-small text-rose-700">{error}</p> : null}
            <Button
              block
              size="lg"
              loading={busy}
              disabled={!state.strokes.length}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  session.finish();
                  await save({ kind: 'daily', strokes: session.snapshot.strokes, day: daily.day, prompt: daily.prompt, title: daily.prompt });
                  session.reset();
                  daily.reload();
                } catch {
                  setError('That didn’t save. Try again in a moment.');
                } finally {
                  setBusy(false);
                }
              }}
            >
              {daily.partner ? `Save mine and see ${name}’s` : 'Save my doodle'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
