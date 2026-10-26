'use client';

import { BOARD_H, BOARD_W, COLOURING_PAGES, listMemories, PAGE_INK, signedPhotoUrls, type DrawBackground, type Memory } from '@us/shared';
import { useCouple } from '@us/shared/react';
import { ImagePlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { uploadBackground } from './hooks';

/** A colouring page as a little picture. */
export function PageThumb({ id, className }: { id: string; className?: string }) {
  const page = COLOURING_PAGES.find((p) => p.id === id);
  if (!page) return null;
  return (
    <svg viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} className={cn('h-full w-full bg-white', className)} aria-hidden fill="none" stroke={PAGE_INK} strokeWidth={34} strokeLinecap="round" strokeLinejoin="round">
      {page.paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: DrawBackground | null;
  onPick: (bg: DrawBackground | null) => void;
}

/** Colouring pages, a photo from Memories, or one from this device. */
export function BackgroundPicker({ open, onOpenChange, current, onPick }: Props) {
  const { sb, couple } = useCouple();
  const [photos, setPhotos] = useState<{ memory: Memory; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void (async () => {
      const memories = (await listMemories(sb, couple.id)).filter((m) => m.photo_path).slice(0, 12);
      const urls = await signedPhotoUrls(sb, memories.map((m) => m.photo_path!));
      if (live) setPhotos(memories.filter((m) => urls[m.photo_path!]).map((m) => ({ memory: m, url: urls[m.photo_path!]! })));
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [open, sb, couple.id]);

  const pick = (bg: DrawBackground | null) => {
    onPick(bg);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Background" description="Colour in a page together, or draw on a photo." className="sm:w-[min(92vw,560px)]">
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        <section className="space-y-2.5">
          <h3 className="text-micro font-semibold uppercase tracking-[0.06em] text-ink-muted">Colouring pages</h3>
          <div className="grid grid-cols-4 gap-2.5">
            <button
              type="button"
              onClick={() => pick(null)}
              className={cn(
                'flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-[14px] border border-paper-edge bg-white text-micro font-semibold text-ink-soft',
                !current && 'ring-2 ring-rose-400 ring-offset-2 ring-offset-paper-raised',
              )}
            >
              <X className="h-5 w-5" aria-hidden />
              Plain
            </button>
            {COLOURING_PAGES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pick({ kind: 'page', id: p.id })}
                aria-label={p.name}
                className={cn(
                  'overflow-hidden rounded-[14px] border border-paper-edge',
                  current?.kind === 'page' && current.id === p.id && 'ring-2 ring-rose-400 ring-offset-2 ring-offset-paper-raised',
                )}
              >
                <PageThumb id={p.id} />
              </button>
            ))}
          </div>
        </section>
        <section className="space-y-2.5">
          <h3 className="text-micro font-semibold uppercase tracking-[0.06em] text-ink-muted">A photo</h3>
          <div className="grid grid-cols-4 gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => file.current?.click()}
              className="flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed border-rose-300 text-micro font-semibold text-rose-700 disabled:opacity-50"
            >
              <ImagePlus className="h-5 w-5" aria-hidden />
              {busy ? 'Uploading…' : 'From this device'}
            </button>
            {photos.map(({ memory, url }) => (
              <button
                key={memory.id}
                type="button"
                onClick={() => pick({ kind: 'photo', bucket: 'memories', path: memory.photo_path! })}
                aria-label={`Draw on “${memory.title}”`}
                className={cn(
                  'overflow-hidden rounded-[14px]',
                  current?.kind === 'photo' && current.path === memory.photo_path && 'ring-2 ring-rose-400 ring-offset-2 ring-offset-paper-raised',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="aspect-[3/4] h-full w-full object-cover" />
              </button>
            ))}
          </div>
          <input
            ref={file}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setBusy(true);
              setError(null);
              try {
                pick(await uploadBackground(sb, couple.id, f));
              } catch {
                setError('That photo didn’t upload. Try a smaller one.');
              } finally {
                setBusy(false);
              }
            }}
          />
          {error ? <p role="alert" className="text-small text-rose-700">{error}</p> : null}
        </section>
      </div>
    </Dialog>
  );
}
