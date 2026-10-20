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
import { useCouple, useCoupleData } from '@us/shared/react';
import { Heart, ImagePlus, Plus, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { EmptyNote, ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Photo } from '@/components/ui/lightbox';
import { Field, TextAreaField } from '@/components/ui/field';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Chip, Segmented } from '@/components/ui/segmented';
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

  return (
    <div className="space-y-10">
      {resurfaced.length > 0 && (
        <section aria-labelledby="on-this-day">
          <Sheet tone="note" accent="gold" pad="md" className="space-y-3">
            <h2 id="on-this-day" className="flex items-center gap-2 text-small font-medium text-gold-700">
              <Sparkles className="h-4 w-4" aria-hidden /> On this day
            </h2>
            <ul className="space-y-3">
              {resurfaced.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => setViewing(m)} className="flex w-full items-center gap-4 rounded-control text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400">
                    {m.photo_path && urls[m.photo_path] ? (
                      <img src={urls[m.photo_path]} alt="" className="h-16 w-16 shrink-0 rounded-control object-cover" />
                    ) : null}
                    <span>
                      <span className="block font-display text-heading text-ink">{m.title}</span>
                      <span className="text-small text-ink-soft">
                        {m.yearsAgo === 1 ? 'A year ago today' : `${m.yearsAgo} years ago today`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Sheet>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>
            Everything
          </Chip>
          {MEMORY_KINDS.map((k) => (
            <Chip key={k.value} selected={filter === k.value} onClick={() => setFilter(k.value)}>
              {k.label}s
            </Chip>
          ))}
        </div>
        <Button onClick={() => setEditing({})}>
          <Plus className="h-4 w-4" /> Keep a memory
        </Button>
      </div>

      {memories.error && <ErrorNote>{memories.error}</ErrorNote>}

      {!memories.loading && shown.length === 0 ? (
        <EmptyNote title={all.length ? 'Nothing here yet' : 'Your first memory'}>
          The small moments that turned out to be big ones. Add a photo, a line, the date — {partner.display_name} sees it too.
        </EmptyNote>
      ) : (
        <div className="space-y-10">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h2 className="mb-4 font-display text-lead italic text-ink-soft">{g.label}</h2>
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((m) => (
                  <li key={m.id}>
                    <MemoryCard memory={m} url={m.photo_path ? urls[m.photo_path] : undefined} rated={!!ratings.data?.[m.id]} onOpen={() => setViewing(m)} />
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

function MemoryCard({ memory, url, rated, onOpen }: { memory: Memory; url?: string; rated: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 rounded-sheet"
    >
      <Sheet pad="none" className="overflow-hidden transition-transform duration-base ease-out group-hover:-translate-y-0.5">
        {memory.photo_path ? (
          <div className="aspect-[4/3] bg-paper-sunken">
            {url ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" /> : null}
          </div>
        ) : null}
        <div className="space-y-1.5 p-5">
          <div className="flex items-center justify-between gap-2 text-micro text-ink-muted">
            <span>{formatDay(memory.happened_on)}</span>
            <span className="flex items-center gap-1.5">
              {rated && <Heart className="h-3 w-3 fill-current text-rose-400" aria-label="You left a private note" />}
              {memory.kind !== 'moment' && <span className="rounded-full bg-gold-50 px-2 py-0.5 font-medium text-gold-700">{KIND_LABEL[memory.kind]}</span>}
            </span>
          </div>
          <h3 className="font-display text-heading text-ink">{memory.title}</h3>
          {memory.body ? <p className="line-clamp-3 text-small text-ink-soft">{memory.body}</p> : null}
        </div>
      </Sheet>
    </button>
  );
}

function MemoryDetail({
  memory,
  url,
  rating,
  authorName,
  onEdit,
  onSaveRating,
}: {
  memory: Memory;
  url?: string;
  rating?: MemoryRating;
  authorName: string;
  onEdit: () => void;
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
      {memory.body ? <p className="whitespace-pre-wrap font-display text-lead font-light text-ink">{memory.body}</p> : null}

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
