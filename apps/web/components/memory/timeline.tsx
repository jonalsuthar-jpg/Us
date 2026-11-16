'use client';

import {
  createMemory,
  deleteMemory,
  groupByMonth,
  listMemories,
  MEMORY_KINDS,
  myRatings,
  onThisDay,
  personFor,
  removeMemoryPhoto,
  saveMyRating,
  signedPhotoUrls,
  toDateKey,
  updateMemory,
  uploadMemoryPhoto,
  type Memory,
  type MemoryKind,
  type MemoryRating,
} from '@us/shared';
import { useBirthdayStoryMemories, useCouple, useCoupleData } from '@us/shared/react';
import { BookHeart, Heart, ImagePlus, Plane, Plus, Sparkles, Wine, X, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
  const photoKey = all.map((m) => m.photo_path ?? '').join('|');
  useEffect(() => {
    const paths = all.map((m) => m.photo_path).filter((p): p is string => !!p && !urls[p]);
    if (!paths.length) return;
    void signedPhotoUrls(sb, paths)
      .then((u) => setUrls((prev) => ({ ...prev, ...u })))
      .catch(() => {});
  }, [sb, photoKey]);

  const resurfaced = useMemo(() => onThisDay(all), [all]);
  const shown = filter === 'all' ? all : all.filter((m) => m.kind === filter);
  const groups = groupByMonth(shown);

  const count = (f: Filter) => (f === 'all' ? all.length : all.filter((m) => m.kind === f).length);
  const photos = all.filter((m) => m.photo_path).length;

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] bg-paper-raised p-4 shadow-[0_24px_50px_-30px_rgba(122,75,58,0.55)] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2.5 font-display text-[22px] font-extrabold text-ink">
            <BookHeart className="h-6 w-6 text-rose-500" aria-hidden />
            Our story
          </h2>
          <span className="text-small font-medium text-ink-muted">
            {photos} {photos === 1 ? 'photo' : 'photos'}
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
                      url={m.photo_path ? urls[m.photo_path] : undefined}
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
            url={viewing.photo_path ? urls[viewing.photo_path] : undefined}
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

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing?.memory ? 'Edit memory' : 'Keep a memory'} className="sm:w-[min(92vw,520px)]">
        {editing ? (
          <MemoryForm
            key={editing.memory?.id ?? 'new'}
            initial={editing.memory}
            photoUrl={editing.memory?.photo_path ? urls[editing.memory.photo_path] : undefined}
            onSubmit={async ({ fields, photo, removePhoto }) => {
              await memories.mutate(async () => {
                let photo_path = editing.memory?.photo_path ?? null;
                if (photo) {
                  const { blob, type } = await shrinkPhoto(photo);
                  photo_path = await uploadMemoryPhoto(sb, couple.id, blob, type);
                }
                if ((photo || removePhoto) && editing.memory?.photo_path) {
                  await removeMemoryPhoto(sb, editing.memory.photo_path).catch(() => {});
                  if (removePhoto && !photo) photo_path = null;
                }
                return editing.memory
                  ? updateMemory(sb, editing.memory.id, { ...fields, photo_path })
                  : createMemory(sb, { ...fields, photo_path, couple_id: couple.id, created_by: ctx.me.id });
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
        {memory.photo_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          url ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" /> : null
        ) : (
          <span className={cn('flex h-full w-full items-center justify-center bg-gradient-to-br', art.wash)}>
            <art.Icon className={cn('h-12 w-12', art.ink)} aria-hidden />
          </span>
        )}
        <span className={cn('absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-extrabold', art.badge)}>{KIND_LABEL[memory.kind]}</span>
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
  url,
  rating,
  authorName,
  onEdit,
  onStory,
  onSaveRating,
}: {
  memory: Memory;
  url?: string;
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
      {url ? <Photo src={url} label={`Photo: ${memory.title}`} /> : null}
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

function MemoryForm({
  initial,
  photoUrl,
  onSubmit,
  onDelete,
}: {
  initial?: Memory;
  photoUrl?: string;
  onSubmit: (v: {
    fields: { title: string; body: string | null; happened_on: string; kind: MemoryKind };
    photo: File | null;
    removePhoto: boolean;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [day, setDay] = useState(initial?.happened_on ?? toDateKey(new Date()));
  const [kind, setKind] = useState<MemoryKind>(initial?.kind ?? 'moment');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | undefined>(photoUrl);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!photo) return;
    const u = URL.createObjectURL(photo);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ fields: { title: title.trim(), body: body.trim() || null, happened_on: day, kind }, photo, removePhoto });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-h-[75dvh] space-y-4 overflow-y-auto pr-1">
      <div className="relative">
        {preview && !removePhoto ? (
          <div className="relative">
            <img src={preview} alt="" className="max-h-56 w-full rounded-control object-cover" />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => {
                setPhoto(null);
                setPreview(undefined);
                setRemovePhoto(true);
              }}
              className="absolute right-2 top-2 rounded-full bg-plum-900/70 p-1.5 text-paper backdrop-blur hover:bg-plum-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label className="flex h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-control border border-dashed border-paper-edge text-small text-ink-soft hover:border-ink/25 hover:text-ink focus-within:ring-2 focus-within:ring-gold-400">
            <ImagePlus className="h-6 w-6" aria-hidden />
            Add a photo
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPhoto(f);
                  setRemovePhoto(false);
                }
              }}
            />
          </label>
        )}
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
