'use client';

import {
  deleteDrawing,
  DRAW_TOPIC,
  drawingPng,
  drawingToMemory,
  LIVE_CANVAS,
  loadStrokes,
  setCouplePhoto,
  timeAgo,
  type Drawing,
  type DrawingFile,
} from '@us/shared';
import { useCouple, useDrawHub, useDrawings } from '@us/shared/react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { EmptyNote } from '@/components/app/module-header';
import { Spinner } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useBgPhotoUrl } from './hooks';
import { Replay } from './replay';

type Filter = 'all' | 'canvas' | 'doodle' | 'guess' | 'daily';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'canvas', label: 'Together' },
  { id: 'doodle', label: 'Doodles' },
  { id: 'guess', label: 'Draw & Guess' },
  { id: 'daily', label: 'Daily' },
];

/** What to call a drawing in the grid. */
export function drawingTitle(d: Drawing, partnerId: string, partnerName: string): string {
  if (d.title) return d.title;
  if (d.kind === 'doodle') return d.created_by === partnerId ? `Doodle from ${partnerName}` : `Doodle for ${partnerName}`;
  if (d.kind === 'daily') return `Daily · “${d.prompt ?? 'doodle'}”`;
  if (d.kind === 'guess') return 'Draw & Guess';
  return 'Drawn together';
}

function whoDrew(d: Drawing, meId: string, partnerName: string) {
  const both = d.artists.length > 1;
  if (both) return 'drawn together';
  return d.created_by === meId ? 'drawn by you' : `drawn by ${partnerName}`;
}

export function Gallery() {
  const { sb, me, partner, couple, channel } = useCouple();
  const hub = useDrawHub();
  const router = useRouter();
  const params = useSearchParams();
  const { drawings, urls, loading, reload } = useDrawings();
  const [filter, setFilter] = useState<Filter>('all');
  const [file, setFile] = useState<DrawingFile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Draw & Guess turns stay hidden until they've been answered.
  const visible = useMemo(() => drawings.filter((d) => d.kind !== 'guess' || d.answered_at || d.created_by === me.id), [drawings, me.id]);
  const shown = filter === 'all' ? visible : visible.filter((d) => d.kind === filter);
  const selectedId = params.get('d') ?? shown[0]?.id ?? null;
  const selected = visible.find((d) => d.id === selectedId) ?? null;
  const photoUrl = useBgPhotoUrl(file?.bg);
  const since = visible.length ? new Date(visible[visible.length - 1]!.created_at).toLocaleDateString(undefined, { month: 'long' }) : null;

  useEffect(() => {
    let live = true;
    setFile(null);
    setNote(null);
    if (selected) void loadStrokes(sb, selected.strokes_path).then((f) => live && setFile(f)).catch(() => live && setNote('This drawing couldn’t be opened.'));
    return () => {
      live = false;
    };
  }, [sb, selected?.id, selected?.strokes_path]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(what: string, fn: () => Promise<unknown>, done: string) {
    setBusy(what);
    setNote(null);
    try {
      await fn();
      setNote(done);
    } catch {
      setNote('That didn’t work. Try again in a moment.');
    } finally {
      setBusy(null);
    }
  }

  const pick = (id: string) => router.replace(`/connect/draw/gallery?d=${id}`, { scroll: false });

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-5 py-8 sm:px-6">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
          <Link href="/connect/draw" className="inline-flex items-center gap-1 text-small font-semibold text-rose-600 hover:text-rose-700">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Draw together
          </Link>
          <h1 className="font-display text-[34px] leading-[40px] text-ink">Our drawings</h1>
          <p className="font-serif text-lead font-light italic text-ink-soft">
            {visible.length
              ? `${visible.length} ${visible.length === 1 ? 'drawing' : 'drawings'} since ${since}. Tap one to watch it being drawn.`
              : 'Everything you save from Draw together lands here.'}
          </p>
        </div>
        <div role="tablist" aria-label="Filter" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn('h-9 rounded-full px-3.5 text-small font-semibold', filter === f.id ? 'bg-plum-800 text-paper' : 'bg-paper-sunken text-ink-soft hover:text-ink')}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-5 w-5 text-rose-400" />
        </div>
      ) : !shown.length ? (
        <EmptyNote title={filter === 'all' ? 'Nothing saved yet' : 'None of these yet'}>
          <Link href="/connect/draw" className="font-semibold text-rose-600">
            Start a drawing together
          </Link>
        </EmptyNote>
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <div className="grid min-w-0 flex-[999_1_560px] grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
            {shown.map((d) => (
              <figure key={d.id} className="m-0 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => pick(d.id)}
                  aria-label={`${drawingTitle(d, partner.id, partner.display_name)}, ${timeAgo(d.created_at)}`}
                  aria-pressed={d.id === selected?.id}
                  className={cn(
                    'block aspect-[3/4] overflow-hidden rounded-[16px] border border-paper-edge',
                    d.kind === 'doodle' ? 'bg-[#FFEDC0]' : 'bg-white',
                    d.id === selected?.id && 'border-transparent ring-[3px] ring-rose-400',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {urls[d.png_path] ? <img src={urls[d.png_path]} alt="" className={cn('h-full w-full object-cover', d.kind === 'doodle' && 'mix-blend-multiply')} /> : null}
                </button>
                <figcaption className="truncate text-small font-semibold text-ink">
                  {drawingTitle(d, partner.id, partner.display_name)} <span className="font-normal text-ink-muted" suppressHydrationWarning>· {timeAgo(d.created_at)}</span>
                </figcaption>
              </figure>
            ))}
          </div>

          {selected ? (
            <aside aria-label="Selected drawing" className="flex flex-[1_1_300px] flex-col gap-3.5 rounded-[24px] bg-plum-800 p-[18px] text-paper lg:sticky lg:top-6">
              <div className="flex flex-col gap-0.5">
                <h2 className="font-display text-[19px]">{drawingTitle(selected, partner.id, partner.display_name)}</h2>
                <span className="text-micro text-plum-200" suppressHydrationWarning>
                  {timeAgo(selected.created_at)} · {whoDrew(selected, me.id, partner.display_name)} · {selected.stroke_count} strokes
                </span>
              </div>
              {file ? (
                <Replay file={file} photoUrl={photoUrl} />
              ) : (
                <div className="flex aspect-[3/4] items-center justify-center rounded-[16px] bg-white/5">
                  <Spinner className="h-5 w-5 text-plum-200" />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <a
                  href={urls[selected.png_path]}
                  download={`${drawingTitle(selected, partner.id, partner.display_name)}.png`}
                  className="flex h-10 items-center rounded-[10px] bg-plum-700 px-3 text-small font-semibold hover:bg-plum-600"
                >
                  Download PNG
                </a>
                <GalleryButton busy={busy === 'memory'} onClick={() => void act('memory', () => drawingToMemory(sb, selected, me.id), 'Added to Memories')}>
                  Add to Memories
                </GalleryButton>
                <GalleryButton
                  busy={busy === 'photo'}
                  onClick={() =>
                    void act(
                      'photo',
                      async () => {
                        await setCouplePhoto(sb, couple, await drawingPng(sb, selected), 'image/png');
                        channel.sendChanged('home');
                      },
                      'It’s your photo of us now',
                    )
                  }
                >
                  Photo of us
                </GalleryButton>
                <GalleryButton
                  busy={false}
                  onClick={() => {
                    if (!file) return;
                    hub.session(LIVE_CANVAS).load(file.strokes, file.bg ?? null);
                    router.push('/connect/draw');
                  }}
                >
                  Keep drawing
                </GalleryButton>
                {selected.created_by === me.id ? (
                  <GalleryButton
                    busy={busy === 'delete'}
                    onClick={() =>
                      void act(
                        'delete',
                        async () => {
                          await deleteDrawing(sb, selected);
                          channel.sendChanged(DRAW_TOPIC);
                          router.replace('/connect/draw/gallery');
                          reload();
                        },
                        'Deleted',
                      )
                    }
                  >
                    Delete
                  </GalleryButton>
                ) : null}
              </div>
              {note ? <p role="status" className="text-small text-plum-100">{note}</p> : null}
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}

function GalleryButton({ children, busy, onClick }: { children: React.ReactNode; busy: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={busy} onClick={onClick} className="flex h-10 items-center gap-2 rounded-[10px] bg-plum-700 px-3 text-small font-semibold hover:bg-plum-600 disabled:opacity-60">
      {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
      {children}
    </button>
  );
}
