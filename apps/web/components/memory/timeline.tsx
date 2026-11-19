'use client';

import {
  createMemory,
  deleteMemory,
  groupByMonth,
  listMemories,
  MEMORY_KINDS,
  MEMORY_PHOTOS_MAX,
  memoryPhotos,
  myRatings,
  offerRecap,
  recapCounts,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_MS,
  yearRecap,
  onThisDay,
  personFor,
  removeMemoryPhoto,
  saveMyRating,
  signedPhotoUrls,
  toDateKey,
  updateMemory,
  uploadMemoryPhoto,
  uploadMemoryVideo,
  type Memory,
  type MemoryKind,
  type MemoryRating,
} from '@us/shared';
import { useBirthdayStoryMemories, useCouple, useCoupleData } from '@us/shared/react';
import { ArrowLeft, BookHeart, ChevronLeft, ChevronRight, Film, Heart, ImagePlus, Play, Plane, Plus, Sparkles, Wine, X, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { EmptyNote, ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Photo } from '@/components/ui/lightbox';
import { Field, TextAreaField } from '@/components/ui/field';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { shrinkPhoto } from '@/lib/image';
import { cn } from '@/lib/cn';

type Filter = 'all' | MemoryKind;
type Editing = { memory?: Memory } | null;

const KIND_LABEL: Record<MemoryKind, string> = { moment: 'Moment', date: 'Date', trip: 'Trip' };

function formatDay(key: string) {
  return new Date(key + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function MemoryTimeline() {
  const ctx = useCouple();
  const { sb, couple, partner } = ctx;
  const memories = useCoupleData('memory:timeline', () => listMemories(sb, couple.id), [sb, couple.id]);
  const ratings = useCoupleData('memory:my-ratings', () => myRatings(sb), [sb]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<Editing>(null);
  const [viewing, setViewing] = useState<Memory | null>(null);
  const stories = useBirthdayStoryMemories();
  const router = useRouter();
  const openStory = (m: Memory) => router.push(`/memory/story/${m.id}`);

  const all = memories.data ?? [];
  const filesOf = (m: Memory) => [...memoryPhotos(m), ...(m.video_path ? [m.video_path] : [])];
  const photoKey = all.map((m) => filesOf(m).join(',')).join('|');
  useEffect(() => {
    const paths = all.flatMap(filesOf).filter((p) => !urls[p]);
    if (!paths.length) return;
    void signedPhotoUrls(sb, paths)
      .then((u) => setUrls((prev) => ({ ...prev, ...u })))
      .catch(() => {});
  }, [sb, photoKey]);

  const resurfaced = useMemo(() => onThisDay(all), [all]);
  const shown = filter === 'all' ? all : all.filter((m) => m.kind === filter);
  const groups = groupByMonth(shown);

  const count = (f: Filter) => (f === 'all' ? all.length : all.filter((m) => m.kind === f).length);
  const photos = all.reduce((n, m) => n + memoryPhotos(m).length, 0);
  const [recapYear, setRecapYear] = useState<number | null>(null);
  const thisYear = new Date().getFullYear();

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] bg-paper-raised p-4 shadow-[0_24px_50px_-30px_rgba(122,75,58,0.55)] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 font-display text-[22px] font-extrabold text-ink">
            <BookHeart className="h-6 w-6 text-rose-500" aria-hidden />
            Our story
          </h2>
          <span className="flex items-center gap-3 text-small font-medium text-ink-muted">
            {photos} {photos === 1 ? 'photo' : 'photos'}
            {all.length ? (
              <button type="button" onClick={() => setRecapYear(thisYear)} className="rounded-full bg-gold-50 px-3 py-1 font-bold text-gold-700 hover:bg-gold-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
                Our year
              </button>
            ) : null}
          </span>
        </div>
        <div role="group" aria-label="Show" className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
          {TILES.map((t) => {
            const selected = filter === t.value;
            return (
              <button
                key={t.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setFilter(t.value)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-[18px] px-1 py-3 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                  t.wash,
                  selected && 'ring-2 ring-offset-2 ring-offset-paper-raised',
                  selected && t.ring,
                )}
              >
                <span className={cn('flex h-9 w-9 items-center justify-center rounded-full text-white shadow-[0_6px_12px_-6px_rgba(36,25,51,0.5)]', t.fill)}>
                  <t.Icon className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span className="text-[20px] font-extrabold leading-6 text-ink">{count(t.value)}</span>
                <span className="text-micro font-semibold text-ink-soft">{t.label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setEditing({})}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-rose-500 to-rose-600 text-body font-extrabold text-white shadow-[0_14px_26px_-14px_rgba(196,29,85,0.9)] transition-transform hover:-translate-y-0.5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          <Plus className="h-5 w-5" strokeWidth={2.6} /> Keep a memory
        </button>
      </section>

      {all.length >= 3 && offerRecap(couple.paired_at) ? (
        <button
          type="button"
          onClick={() => setRecapYear(thisYear)}
          className="flex w-full items-center gap-3 rounded-[26px] bg-plum-800 p-4 text-left text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          <Sparkles className="h-6 w-6 text-gold-200" aria-hidden />
          <span className="flex-1">
            <span className="block font-display text-heading">Our {thisYear}</span>
            <span className="block text-small text-paper/75">Your year together, in memories.</span>
          </span>
          <ChevronRight className="h-5 w-5 text-gold-200" aria-hidden />
        </button>
      ) : null}

      {resurfaced.length > 0 && (
        <section aria-labelledby="on-this-day" className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#FFE7AE] to-[#FFF6E0] p-4 shadow-[0_18px_36px_-26px_rgba(174,111,8,0.7)] ring-1 ring-white/70 dark:from-gold-50 dark:to-paper-raised dark:ring-paper-edge sm:p-5">
          <Sparkles className="pointer-events-none absolute -right-2 -top-2 h-20 w-20 text-gold-300/50" aria-hidden />
          <h2 id="on-this-day" className="relative flex items-center gap-2 text-body font-extrabold text-gold-700">
            <Sparkles className="h-5 w-5" aria-hidden /> On this day
          </h2>
          <ul className="relative mt-3 space-y-2.5">
            {resurfaced.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => setViewing(m)} className="flex w-full items-center gap-3.5 rounded-[18px] bg-white/70 p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 dark:bg-paper-raised">
                  {m.photo_path && urls[m.photo_path] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[m.photo_path]} alt="" className="h-14 w-14 shrink-0 rounded-[14px] object-cover" />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-gold-100 text-gold-700">
                      <Sparkles className="h-6 w-6" aria-hidden />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[17px] font-extrabold text-ink">{m.title}</span>
                    <span className="text-small text-ink-soft">{m.yearsAgo === 1 ? 'A year ago today' : `${m.yearsAgo} years ago today`}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {memories.error && <ErrorNote>{memories.error}</ErrorNote>}

      {!memories.loading && shown.length === 0 ? (
        <EmptyNote title={all.length ? 'Nothing here yet' : 'Your first memory'}>
          The small moments that turned out to be big ones. Add a photo, a line, the date — {partner.display_name} sees it too.
        </EmptyNote>
      ) : (
        <div className="space-y-8 pt-2">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label} className="space-y-4">
              <h2 className="flex items-center gap-2.5 font-display text-[20px] font-extrabold text-ink">
                <span aria-hidden className="h-6 w-1 rounded-full bg-rose-500" />
                {g.label}
              </h2>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-4 sm:gap-x-5 sm:gap-y-6 lg:grid-cols-3">
                {g.items.map((m, i) => (
                  <li key={m.id}>
                    <MemoryCard
                      memory={m}
                      index={i}
                      url={memoryPhotos(m)[0] ? urls[memoryPhotos(m)[0]!] : undefined}
                      rated={!!ratings.data?.[m.id]}
                      story={stories.has(m.id)}
                      onOpen={() => (stories.has(m.id) ? openStory(m) : setViewing(m))}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)} title={viewing?.title ?? ''} className="sm:w-[min(92vw,560px)]">
        {viewing ? (
          <MemoryDetail
            memory={viewing}
            urls={urls}
            rating={ratings.data?.[viewing.id]}
            authorName={personFor(ctx, viewing.created_by).mine ? 'you' : partner.display_name}
            onStory={stories.has(viewing.id) ? () => openStory(viewing) : undefined}
            onEdit={() => {
              setEditing({ memory: viewing });
              setViewing(null);
            }}
            onSaveRating={(r) => ratings.mutate(() => saveMyRating(sb, { memory_id: viewing.id, owner_id: ctx.me.id, ...r }))}
          />
        ) : null}
      </Dialog>

      <Dialog open={recapYear !== null} onOpenChange={(o) => !o && setRecapYear(null)} title={`Our ${recapYear ?? ''}`} className="sm:w-[min(92vw,560px)]">
        {recapYear !== null ? <YearRecapView year={recapYear} memories={all} urls={urls} onYear={setRecapYear} /> : null}
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.memory ? 'Edit memory' : 'Keep a memory'} className="sm:w-[min(92vw,520px)]">
        {editing ? (
          <MemoryForm
            key={editing.memory?.id ?? 'new'}
            initial={editing.memory}
            urls={urls}
            onSubmit={async ({ fields, photos, video }) => {
              const before = editing.memory;
              await memories.mutate(async () => {
                // New photos go up in their place in the order; the first is the cover.
                const photo_paths: string[] = [];
                for (const p of photos) {
                  if (p.path) photo_paths.push(p.path);
                  else if (p.file) {
                    const { blob, type } = await shrinkPhoto(p.file);
                    photo_paths.push(await uploadMemoryPhoto(sb, couple.id, blob, type));
                  }
                }
                let video_path = before?.video_path ?? null;
                let video_meta = before?.video_meta ?? null;
                if (video === null) [video_path, video_meta] = [null, null];
                else if (video instanceof File) {
                  video_meta = await videoInfo(video);
                  video_path = await uploadMemoryVideo(sb, couple.id, video, video.type || 'video/mp4');
                }
                const row = { ...fields, photo_paths, photo_path: photo_paths[0] ?? null, video_path, video_meta };
                const saved = before ? await updateMemory(sb, before.id, row) : await createMemory(sb, { ...row, couple_id: couple.id, created_by: ctx.me.id });
                // Files taken off (or replaced) go once the memory no longer points at them.
                const gone = before ? [...memoryPhotos(before).filter((x) => !photo_paths.includes(x)), ...(before.video_path && before.video_path !== video_path ? [before.video_path] : [])] : [];
                for (const g of gone) await removeMemoryPhoto(sb, g).catch(() => {});
                return saved;
              });
              setEditing(null);
            }}
            onDelete={
              editing.memory
                ? async () => {
                    await memories.mutate(() => deleteMemory(sb, editing.memory!));
                    setEditing(null);
                  }
                : undefined
            }
          />
        ) : null}
      </Dialog>
    </div>
  );
}

const TILES: { value: Filter; label: string; Icon: LucideIcon; wash: string; fill: string; ring: string }[] = [
  { value: 'all', label: 'All', Icon: BookHeart, wash: 'bg-plum-50', fill: 'bg-plum-500', ring: 'ring-plum-400' },
  { value: 'moment', label: 'Moments', Icon: Heart, wash: 'bg-rose-50', fill: 'bg-rose-500', ring: 'ring-rose-400' },
  { value: 'date', label: 'Dates', Icon: Wine, wash: 'bg-gold-50', fill: 'bg-gold-500', ring: 'ring-gold-400' },
  { value: 'trip', label: 'Trips', Icon: Plane, wash: 'bg-teal-50', fill: 'bg-teal-500', ring: 'ring-teal-400' },
];

/** A memory without a photo still gets a picture: its kind, on a soft wash. */
const KIND_ART: Record<MemoryKind, { Icon: LucideIcon; wash: string; ink: string; badge: string }> = {
  moment: { Icon: Heart, wash: 'from-[#FFD9E3] to-[#FFF0F4]', ink: 'text-rose-400', badge: 'text-rose-700' },
  date: { Icon: Wine, wash: 'from-[#FFE7B0] to-[#FFF6E0]', ink: 'text-gold-500', badge: 'text-gold-700' },
  trip: { Icon: Plane, wash: 'from-[#C8F2EA] to-[#EEFBF8]', ink: 'text-teal-500', badge: 'text-teal-700' },
};

/** A polaroid: the photo (or the kind's picture), the title in the margin. */
function MemoryCard({ memory, index, url, rated, story, onOpen }: { memory: Memory; index: number; url?: string; rated: boolean; story: boolean; onOpen: () => void }) {
  const art = KIND_ART[memory.kind];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'group block w-full rounded-[10px] bg-paper-raised p-2 pb-3 text-left shadow-[0_16px_30px_-20px_rgba(122,75,58,0.65)] ring-1 ring-paper-edge transition-transform duration-base ease-out hover:rotate-0 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
        index % 2 ? 'rotate-[1.2deg]' : '-rotate-[1.2deg]',
      )}
    >
      <span className="relative block aspect-square overflow-hidden rounded-[6px] bg-paper-sunken">
        {memoryPhotos(memory).length ? (
          // eslint-disable-next-line @next/next/no-img-element
          url ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" /> : null
        ) : (
          <span className={cn('flex h-full w-full items-center justify-center bg-gradient-to-br', art.wash)}>
            <art.Icon className={cn('h-12 w-12', art.ink)} aria-hidden />
          </span>
        )}
        <span className={cn('absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-extrabold', art.badge)}>{KIND_LABEL[memory.kind]}</span>
        {memoryPhotos(memory).length > 1 || memory.video_path ? (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-plum-900/70 px-2 py-0.5 text-[11px] font-bold text-white">
            {memory.video_path ? <Play className="h-3 w-3 fill-current" aria-label="Has a video" /> : null}
            {memoryPhotos(memory).length > 1 ? `+${memoryPhotos(memory).length - 1}` : null}
          </span>
        ) : null}
        {rated ? (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/90">
            <Heart className="h-3.5 w-3.5 fill-rose-400 text-rose-400" aria-label="You left a private note" />
          </span>
        ) : null}
      </span>
      <span className="block px-1 pt-2.5">
        <span className="line-clamp-2 text-[15px] font-extrabold leading-5 text-ink">{memory.title}</span>
        <span className="mt-0.5 block text-micro text-ink-muted">{formatDay(memory.happened_on)}</span>
        {story ? <span className="mt-1 block text-micro font-bold text-rose-600">Open the story 🎂</span> : null}
      </span>
    </button>
  );
}

function MemoryDetail({
  memory,
  urls,
  rating,
  authorName,
  onEdit,
  onStory,
  onSaveRating,
}: {
  memory: Memory;
  urls: Record<string, string>;
  rating?: MemoryRating;
  authorName: string;
  onEdit: () => void;
  /** It keeps a birthday story: open it. */
  onStory?: () => void;
  onSaveRating: (r: { rating: number | null; note: string | null }) => Promise<unknown>;
}) {
  const [stars, setStars] = useState<number | null>(rating?.rating ?? null);
  const [note, setNote] = useState(rating?.note ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="max-h-[75dvh] space-y-5 overflow-y-auto">
      <Gallery photos={memoryPhotos(memory).map((p) => urls[p]).filter((u): u is string => !!u)} title={memory.title} />
      {memory.video_path && urls[memory.video_path] ? (
        <video
          controls
          playsInline
          preload="metadata"
          src={urls[memory.video_path]}
          className="w-full rounded-control bg-black"
          style={memory.video_meta?.width && memory.video_meta?.height ? { aspectRatio: `${memory.video_meta.width} / ${memory.video_meta.height}` } : undefined}
          aria-label={`Video: ${memory.title}`}
        />
      ) : null}
      <p className="text-small text-ink-muted">
        {formatDay(memory.happened_on)} · {KIND_LABEL[memory.kind]} · kept by {authorName}
      </p>
      {memory.body ? <p className="whitespace-pre-wrap font-serif text-lead font-light text-ink">{memory.body}</p> : null}
      {onStory ? (
        <Button block onClick={onStory}>
          Open the story 🎂
        </Button>
      ) : null}

      <Sheet tone="inset" pad="sm" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-small font-medium text-ink">How it felt to you</p>
          <PrivacyBadge privacy="private" partnerName="" />
        </div>
        <div className="flex gap-1" role="radiogroup" aria-label="Your rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={stars === n}
              aria-label={`${n} of 5`}
              onClick={() => setStars(stars === n ? null : n)}
              className="rounded-full p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
            >
              <Heart className={cn('h-6 w-6', stars && n <= stars ? 'fill-rose-400 text-rose-400' : 'text-plum-200')} />
            </button>
          ))}
        </div>
        <TextAreaField label="A private note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="Only you will ever see this." />
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            setError(null);
            try {
              await onSaveRating({ rating: stars, note: note.trim() || null });
              setSaved(true);
              setTimeout(() => setSaved(false), 1600);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {saved ? 'Saved' : 'Save for me'}
        </Button>
      </Sheet>

      <div className="flex justify-end">
        <Button variant="quiet" onClick={onEdit}>
          Edit memory
        </Button>
      </div>
    </div>
  );
}

/** A photo in the form: one already kept (its path) or one just picked. */
type FormPhoto = { key: string; path?: string; file?: File; url?: string };

function MemoryForm({
  initial,
  urls,
  onSubmit,
  onDelete,
}: {
  initial?: Memory;
  urls: Record<string, string>;
  onSubmit: (v: {
    fields: { title: string; body: string | null; happened_on: string; kind: MemoryKind };
    photos: FormPhoto[];
    /** A new video, null to take it off, undefined to leave it. */
    video: File | null | undefined;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [day, setDay] = useState(initial?.happened_on ?? toDateKey(new Date()));
  const [kind, setKind] = useState<MemoryKind>(initial?.kind ?? 'moment');
  const [photos, setPhotos] = useState<FormPhoto[]>(() => (initial ? memoryPhotos(initial).map((p) => ({ key: p, path: p, url: urls[p] })) : []));
  const [video, setVideo] = useState<File | null | undefined>(undefined);
  const hasVideo = video instanceof File || (video === undefined && !!initial?.video_path);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Previews for picked photos, let go when the form closes.
  useEffect(() => () => photos.forEach((p) => p.file && p.url && URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addPhotos = (files: FileList | null) => {
    const picked = [...(files ?? [])].filter((f) => f.type.startsWith('image/'));
    const room = MEMORY_PHOTOS_MAX - photos.length;
    if (picked.length > room) setError(`A memory holds up to ${MEMORY_PHOTOS_MAX} photos.`);
    setPhotos((ps) => [...ps, ...picked.slice(0, Math.max(0, room)).map((f) => ({ key: `${f.name}-${f.size}-${Math.random()}`, file: f, url: URL.createObjectURL(f) }))]);
  };
  const move = (i: number, by: number) =>
    setPhotos((ps) => {
      const next = [...ps];
      const [p] = next.splice(i, 1);
      next.splice(Math.min(Math.max(0, i + by), next.length), 0, p!);
      return next;
    });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ fields: { title: title.trim(), body: body.trim() || null, happened_on: day, kind }, photos, video });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-h-[75dvh] space-y-4 overflow-y-auto pr-1">
      <div className="space-y-2">
        {photos.length ? (
          <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Photos, the first is the cover">
            {photos.map((p, i) => (
              <li key={p.key} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-control bg-paper-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.url ? <img src={p.url} alt="" className="h-full w-full object-cover" /> : null}
                {i === 0 ? <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 text-[10px] font-bold text-ink">Cover</span> : null}
                <span className="absolute inset-x-1 bottom-1 flex justify-between">
                  <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-full bg-plum-900/70 p-1 text-paper disabled:opacity-0">
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" aria-label="Remove photo" onClick={() => setPhotos((ps) => ps.filter((x) => x.key !== p.key))} className="rounded-full bg-plum-900/70 p-1 text-paper">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {photos.length < MEMORY_PHOTOS_MAX ? (
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-control border border-dashed border-paper-edge px-3 text-small text-ink-soft hover:border-ink/25 hover:text-ink focus-within:ring-2 focus-within:ring-gold-400">
              <ImagePlus className="h-5 w-5" aria-hidden />
              {photos.length ? 'Add more photos' : 'Add photos'}
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => (addPhotos(e.target.files), (e.target.value = ''))} />
            </label>
          ) : null}
          {hasVideo ? (
            <span className="inline-flex h-11 items-center gap-2 rounded-control bg-paper-sunken px-3 text-small text-ink">
              <Film className="h-5 w-5" aria-hidden /> {video instanceof File ? video.name.slice(0, 24) : 'A video'}
              <button type="button" aria-label="Remove video" onClick={() => setVideo(null)} className="rounded-full p-1 text-ink-muted hover:bg-paper-raised hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </span>
          ) : (
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-control border border-dashed border-paper-edge px-3 text-small text-ink-soft hover:border-ink/25 hover:text-ink focus-within:ring-2 focus-within:ring-gold-400">
              <Film className="h-5 w-5" aria-hidden />
              Add a video
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  if (f.size > VIDEO_MAX_BYTES) return setError(`Videos can be up to ${Math.round(VIDEO_MAX_BYTES / 1_000_000)} MB. Trim it first.`);
                  const info = await videoInfo(f);
                  if (info?.duration_ms && info.duration_ms > VIDEO_MAX_MS + 1000) return setError('Videos can be up to a minute long. Trim it first.');
                  setError(null);
                  setVideo(f);
                }}
              />
            </label>
          )}
        </div>
      </div>
      <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder="The night it rained in Lisbon" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="When" type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} required />
        <div className="space-y-1.5">
          <p className="text-small font-medium text-ink">Kind</p>
          <Segmented label="Kind" options={MEMORY_KINDS} value={kind} onChange={setKind} className="w-full" size="sm" />
        </div>
      </div>
      <TextAreaField label="The story (optional)" value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={5000} />
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="flex items-center justify-between gap-3 pt-2">
        {onDelete ? (
          <Button
            type="button"
            variant="quiet"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm('Delete this memory for both of you?')) return;
              setBusy(true);
              try {
                await onDelete();
              } catch (err) {
                setError((err as Error).message);
                setBusy(false);
              }
            }}
          >
            Delete
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" loading={busy} disabled={!title.trim()}>
          {initial ? 'Save' : 'Keep it'}
        </Button>
      </div>
    </form>
  );
}

/** A video's size and length, read in the browser (null if it can't be). */
function videoInfo(file: File): Promise<{ width: number; height: number; duration_ms: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      resolve({ width: v.videoWidth, height: v.videoHeight, duration_ms: Math.round(v.duration * 1000) });
      URL.revokeObjectURL(url);
    };
    v.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    v.src = url;
  });
}

/** One photo at a time, with arrows (and the arrow keys) when there are more. */
function Gallery({ photos, title }: { photos: string[]; title: string }) {
  const [at, setAt] = useState(0);
  if (!photos.length) return null;
  const i = Math.min(at, photos.length - 1);
  const go = (by: number) => setAt((i + by + photos.length) % photos.length);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') go(-1);
    if (e.key === 'ArrowRight') go(1);
  };
  return (
    <div className="relative" onKeyDown={photos.length > 1 ? onKey : undefined} role={photos.length > 1 ? 'group' : undefined} aria-roledescription={photos.length > 1 ? 'carousel' : undefined} aria-label={photos.length > 1 ? `Photos: ${title}` : undefined}>
      <Photo src={photos[i]!} label={`Photo ${i + 1} of ${photos.length}: ${title}`} />
      {photos.length > 1 ? (
        <>
          <button type="button" aria-label="Previous photo" onClick={() => go(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-plum-900/60 p-2 text-paper hover:bg-plum-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" aria-label="Next photo" onClick={() => go(1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-plum-900/60 p-2 text-paper hover:bg-plum-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
            <ChevronRight className="h-5 w-5" />
          </button>
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-plum-900/60 px-2 py-0.5 text-micro text-paper" aria-live="polite">
            {i + 1} / {photos.length}
          </span>
        </>
      ) : null}
    </div>
  );
}

/** "Our year": what this year's memories add up to, with a collage and a few counts. */
function YearRecapView({ year, memories, urls, onYear }: { year: number; memories: Memory[]; urls: Record<string, string>; onYear: (y: number) => void }) {
  const { sb, couple, partner } = useCouple();
  const r = useMemo(() => yearRecap(memories, year, couple.paired_at), [memories, year, couple.paired_at]);
  const [counts, setCounts] = useState<{ messages: number; calls: number } | null>(null);
  useEffect(() => {
    setCounts(null);
    void recapCounts(sb, couple.id, year).then(setCounts, () => {});
  }, [sb, couple.id, year]);
  const first = new Date(couple.paired_at).getFullYear();
  const stats = [
    { n: r.memories, label: r.memories === 1 ? 'memory' : 'memories' },
    { n: r.photos, label: r.photos === 1 ? 'photo' : 'photos' },
    { n: r.trips, label: r.trips === 1 ? 'trip' : 'trips' },
    { n: r.dates, label: r.dates === 1 ? 'date' : 'dates' },
    ...(counts ? [{ n: counts.messages, label: 'messages' }, { n: counts.calls, label: counts.calls === 1 ? 'call' : 'calls' }] : []),
  ];
  return (
    <div className="max-h-[75dvh] space-y-5 overflow-y-auto">
      <p className="font-serif text-lead italic text-ink-soft">
        {r.daysTogether.toLocaleString()} days with {partner.display_name} by {year === new Date().getFullYear() ? 'now' : `the end of ${year}`}.
      </p>
      {r.highlights.length ? (
        <div className="grid grid-cols-3 gap-1.5">
          {r.highlights.map((p) =>
            urls[p] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p} src={urls[p]} alt="" loading="lazy" className="aspect-square w-full rounded-[10px] object-cover" />
            ) : (
              <span key={p} className="aspect-square rounded-[10px] bg-paper-sunken" />
            ),
          )}
        </div>
      ) : null}
      <dl className="grid grid-cols-3 gap-2">
        {stats.map((x) => (
          <div key={x.label} className="rounded-[16px] bg-paper-sunken p-3 text-center">
            <dt className="sr-only">{x.label}</dt>
            <dd className="font-display text-title text-ink">{x.n.toLocaleString()}</dd>
            <dd className="text-micro text-ink-soft" aria-hidden>
              {x.label}
            </dd>
          </div>
        ))}
      </dl>
      {r.busiest ? <p className="text-ink-soft">Your fullest month was {r.busiest.month}, with {r.busiest.count} memories.</p> : null}
      {r.first ? <p className="text-ink-soft">It began with “{r.first.title}” on {formatDay(r.first.happened_on)}.</p> : null}
      {!r.memories ? <EmptyNote title="Nothing kept from this year">Add a memory and it shows up here.</EmptyNote> : null}
      {year > first ? (
        <div className="flex justify-between">
          <Button variant="quiet" size="sm" onClick={() => onYear(year - 1)}>
            <ChevronLeft className="h-4 w-4" /> {year - 1}
          </Button>
          {year < new Date().getFullYear() ? (
            <Button variant="quiet" size="sm" onClick={() => onYear(year + 1)}>
              {year + 1} <ChevronRight className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
