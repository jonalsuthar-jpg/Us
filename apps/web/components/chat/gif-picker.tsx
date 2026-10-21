'use client';

import { searchGifs, type Gif, type GifKind } from '@us/shared';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Chip } from '@/components/ui/segmented';
import { env } from '@/lib/env';

/** GIFs and stickers from GIPHY: trending until you search. */
export function GifPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (kind: GifKind, gif: Gif) => void }) {
  const [kind, setKind] = useState<GifKind>('gif');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  async function load(reset: boolean) {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const next = await searchGifs(env.giphyKey, kind, query, reset ? 0 : items.length);
      if (mine !== seq.current) return;
      setItems((prev) => (reset ? next : [...prev, ...next.filter((g) => !prev.some((p) => p.id === g.id))]));
    } catch (e) {
      if (mine === seq.current) setError((e as Error).message);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(true), query ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={kind === 'gif' ? 'Send a GIF' : 'Send a sticker'} className="sm:w-[min(92vw,560px)]">
      <div className="mb-3 flex gap-2">
        <Chip selected={kind === 'gif'} onClick={() => setKind('gif')}>
          GIFs
        </Chip>
        <Chip selected={kind === 'sticker'} onClick={() => setKind('sticker')}>
          Stickers
        </Chip>
      </div>
      <label className="mb-3 flex h-11 items-center gap-2 rounded-control bg-paper-sunken px-3">
        <Search className="h-4 w-4 text-ink-muted" aria-hidden />
        <span className="sr-only">{kind === 'gif' ? 'Search GIFs' : 'Search stickers'}</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={kind === 'gif' ? 'Search GIFs' : 'Search stickers'}
          className="flex-1 bg-transparent text-body text-ink placeholder:text-ink-muted focus:outline-none"
        />
      </label>
      {error ? <p className="mb-2 text-small text-rose-700">{error}</p> : null}
      <div
        className="grid max-h-[50vh] grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (!loading && items.length && el.scrollHeight - el.scrollTop - el.clientHeight < 200) void load(false);
        }}
      >
        {items.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onPick(kind, g)}
            aria-label={`Send ${g.title}`}
            className="aspect-square overflow-hidden rounded-control bg-paper-sunken transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <img src={g.previewUrl} alt="" loading="lazy" className={kind === 'sticker' ? 'h-full w-full object-contain' : 'h-full w-full object-cover'} />
          </button>
        ))}
      </div>
      {loading ? <p className="py-2 text-center text-small text-ink-muted">Loading…</p> : null}
      {/* GIPHY's attribution, as their terms ask. */}
      <p className="pt-2 text-center text-micro text-ink-muted">Powered by GIPHY</p>
    </Dialog>
  );
}
