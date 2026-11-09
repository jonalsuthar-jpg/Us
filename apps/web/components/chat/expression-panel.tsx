'use client';

import { rememberGif, saveSticker, searchGifs, STICKERS_TOPIC, type Gif, type GifKind, type Sticker } from '@us/shared';
import { cacheKey, readCache, useChatKey, useCouple, writeCache } from '@us/shared/react';
import { Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { OurStickersGrid } from '@/components/stickers/picker';
import { Dialog } from '@/components/ui/dialog';
import { Chip } from '@/components/ui/segmented';

export type ExpressionTab = GifKind | 'ours';
type Recent = { kind: GifKind; gif: Gif };

/**
 * Stickers and GIFs, like WhatsApp's tray: GIPHY stickers and GIFs (what I
 * sent lately first, then trending, or a search), and Ours.
 */
export function ExpressionPanel({
  open,
  initialTab = 'sticker',
  stickers,
  onOpenChange,
  onPick,
  onSendOurs,
  onMake,
}: {
  open: boolean;
  initialTab?: ExpressionTab;
  /** Whether our stickers are on for this couple (the Ours tab). */
  stickers: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (kind: GifKind, gif: Gif) => void;
  onSendOurs: (s: Sticker, url: string | undefined) => void;
  onMake: () => void;
}) {
  const [tab, setTab] = useState<ExpressionTab>(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab === 'ours' && !stickers ? 'sticker' : initialTab);
  }, [open, initialTab, stickers]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Stickers and GIFs" className="sm:w-[min(92vw,560px)]">
      <div className="mb-3 flex gap-2">
        <Chip selected={tab === 'sticker'} onClick={() => setTab('sticker')}>
          Stickers
        </Chip>
        <Chip selected={tab === 'gif'} onClick={() => setTab('gif')}>
          GIFs
        </Chip>
        {stickers ? (
          <Chip selected={tab === 'ours'} onClick={() => setTab('ours')}>
            Ours
          </Chip>
        ) : null}
      </div>
      {tab === 'ours' ? (
        <OurStickersGrid active={open} onMake={onMake} onSend={onSendOurs} />
      ) : (
        <GiphyGrid key={tab} kind={tab} open={open} stickers={stickers} onPick={(g) => onPick(tab, g)} />
      )}
    </Dialog>
  );
}

function GiphyGrid({ kind, open, stickers, onPick }: { kind: GifKind; open: boolean; stickers: boolean; onPick: (g: Gif) => void }) {
  const { sb, couple, me, channel } = useCouple();
  const { sealer } = useChatKey();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const seq = useRef(0);
  const recentKey = cacheKey(couple.id, 'chat:recent-gifs');
  const recent = query ? [] : (readCache<Recent[]>(recentKey) ?? []).filter((r) => r.kind === kind).map((r) => r.gif);
  const data = [...recent, ...items.filter((g) => !recent.some((r) => r.id === g.id))];

  async function load(reset: boolean) {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const next = await searchGifs(sb, kind, query, reset ? 0 : items.length);
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

  function pick(g: Gif) {
    const all = readCache<Recent[]>(recentKey) ?? [];
    const mineOfKind = rememberGif(all.filter((r) => r.kind === kind).map((r) => r.gif), g);
    writeCache(recentKey, [...mineOfKind.map((gif) => ({ kind, gif })), ...all.filter((r) => r.kind !== kind)]);
    onPick(g);
  }

  /** Keep a GIPHY one in Ours: its file is copied into our folder. */
  async function keep(g: Gif) {
    try {
      const bytes = await (await fetch(g.url)).arrayBuffer();
      await saveSticker(sb, { coupleId: couple.id, me: me.id, png: bytes, mime: 'image/gif', width: g.width, height: g.height, cipher: await sealer() });
      channel.sendChanged(STICKERS_TOPIC);
      setNote('Added to Our stickers');
    } catch {
      setNote('That didn’t save. Try again.');
    }
    setTimeout(() => setNote(null), 3000);
  }

  return (
    <>
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
      {note ? (
        <p className="mb-2 text-small text-ink-soft" role="status">
          {note}
        </p>
      ) : null}
      <div
        className="grid max-h-[50vh] grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (!loading && items.length && el.scrollHeight - el.scrollTop - el.clientHeight < 200) void load(false);
        }}
      >
        {data.map((g) => (
          <div key={g.id} className="group relative aspect-square">
            <button
              type="button"
              onClick={() => pick(g)}
              aria-label={`Send ${g.title}`}
              className="h-full w-full overflow-hidden rounded-control bg-paper-sunken bg-cover bg-center transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              style={g.still && kind === 'gif' ? { backgroundImage: `url(${g.still})` } : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={g.previewUrl} alt="" loading="lazy" className={kind === 'sticker' ? 'h-full w-full object-contain' : 'h-full w-full object-cover'} />
            </button>
            {stickers ? (
              <button
                type="button"
                aria-label="Add to our stickers"
                title="Add to Our stickers"
                onClick={() => void keep(g)}
                className="absolute right-1 top-1 hidden h-7 w-7 items-center justify-center rounded-full bg-paper-raised text-ink-soft shadow group-hover:flex focus-visible:flex"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {loading ? <p className="py-2 text-center text-small text-ink-muted">Loading…</p> : null}
      {/* GIPHY's attribution, as their terms ask. */}
      <p className="pt-2 text-center text-micro text-ink-muted">Powered by GIPHY</p>
    </>
  );
}
