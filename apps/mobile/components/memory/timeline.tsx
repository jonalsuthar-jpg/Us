import {
  createMemory,
  deleteMemory,
  groupByMonth,
  listMemories,
  MEMORY_KINDS,
  MEMORY_PHOTOS_MAX,
  memoryCover,
  memoryFiles,
  memoryPhotos,
  myRatings,
  offerRecap,
  recapCounts,
  VIDEO_MAX_MS,
  VideoTooLongError,
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
import * as ImagePicker from '@/lib/image-picker';
import { readyPicked } from '@/lib/photo';
import { router } from 'expo-router';
import { BookHeart, ChevronLeft, ChevronRight, Film, Heart, ImagePlus, Plane, Play, Plus, Sparkles, Star, Wine, X } from 'lucide-react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, Pressable, useWindowDimensions, View } from 'react-native';
import { File as DeviceFile } from 'expo-file-system';
import { fitVideo } from '@/modules/us-video';
import { videoStill } from '@/lib/video-poster';
import { Photo as CachedPhoto } from '../ui/photo';
import { EmptyNote, ErrorNote } from '../module-screen';
import { Button, IconButton } from '../ui/button';
import { GradientView } from '../plan/art';
import { cn } from '../ui/cn';
import { Field } from '../ui/field';
import { Photo } from '../ui/photo-viewer';
import { DateStepper, FormSheet } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { PrivacyBadge } from '../ui/privacy';
import { Segmented } from '../ui/segmented';
import { Sheet } from '../ui/sheet';
import { Display, Text } from '../ui/text';

type Filter = 'all' | MemoryKind;
const KIND_LABEL: Record<MemoryKind, string> = { moment: 'Moment', date: 'Date', trip: 'Trip' };
type Picked = { uri: string; mimeType: string };

function formatDay(key: string) {
  return new Date(key + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Up to `limit` photos at once, each made upload-ready (a camera-sized original would be several MB). */
async function pickPhotos(limit: number): Promise<Picked[]> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, exif: false, allowsMultipleSelection: true, selectionLimit: limit });
  if (res.canceled) return [];
  return Promise.all(res.assets.slice(0, limit).map((a) => readyPicked(a)));
}

type PickedVideo = { uri: string; mimeType: string; meta: { width?: number; height?: number; duration_ms: number }; still: Picked | null };

/** One video, up to a minute, in high quality (see VIDEO_PROFILES.memory). */
async function pickVideo(): Promise<PickedVideo | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], videoMaxDuration: VIDEO_MAX_MS / 1000, quality: 1 });
  const a = res.canceled ? null : res.assets[0];
  if (!a) return null;
  const durationMs = Math.round(a.duration ?? 0);
  if (durationMs > VIDEO_MAX_MS + 1000) throw new VideoTooLongError();
  let size = a.fileSize ?? 0;
  if (!size) {
    try {
      size = new DeviceFile(a.uri).size ?? 0;
    } catch {
      // unknown: fitVideo decides
    }
  }
  // Memories keep close to the original: 1080p at about 8 Mbps, or the file itself when it's already that efficient.
  const ready = await fitVideo({ uri: a.uri, width: a.width, height: a.height, durationMs }, size, 'memory');
  // A sharp still for the card, so a memory with only a video isn't blank.
  const still = await videoStill(ready.uri);
  return { still, uri: ready.uri, // Re-encoded videos are always mp4.
    mimeType: ready.uri === a.uri ? (a.mimeType ?? 'video/mp4') : 'video/mp4', meta: { width: ready.width, height: ready.height, duration_ms: ready.durationMs } };
}

export function MemoryTimeline() {
  const ctx = useCouple();
  const { sb, couple, partner, me } = ctx;
  const c = usePalette();
  const memories = useCoupleData('memory:timeline', () => listMemories(sb, couple.id), [sb, couple.id]);
  const ratings = useCoupleData('memory:my-ratings', () => myRatings(sb), [sb]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<{ memory?: Memory } | null>(null);
  const [viewing, setViewing] = useState<Memory | null>(null);
  const stories = useBirthdayStoryMemories();
  const openStory = (m: Memory) => router.push(`/memory-story/${m.id}`);

  const all = memories.data ?? [];
  const filesOf = (m: Memory) => memoryFiles(m);
  const photoKey = all.map((m) => filesOf(m).join(',')).join('|');
  useEffect(() => {
    const paths = all.flatMap(filesOf).filter((p) => !urls[p]);
    if (!paths.length) return;
    void signedPhotoUrls(sb, paths)
      .then((u) => setUrls((prev) => ({ ...prev, ...u })))
      .catch(() => {});
  }, [sb, photoKey]);

  const resurfaced = useMemo(() => onThisDay(all), [all]);

  // A video memory from before stills existed: make its still the first time it's opened.
  const fixing = useRef(new Set<string>());
  useEffect(() => {
    const m = viewing;
    const link = m?.video_path ? urls[m.video_path] : undefined;
    if (!m || !link || m.video_poster_path || fixing.current.has(m.id)) return;
    fixing.current.add(m.id);
    void (async () => {
      const still = await videoStill(link);
      if (!still) return;
      const path = await uploadMemoryPhoto(sb, couple.id, await (await fetch(still.uri)).arrayBuffer(), still.mimeType);
      await memories.mutate(() => updateMemory(sb, m.id, { video_poster_path: path }));
    })().catch(() => {});
  }, [viewing, urls, sb, couple.id, memories]);
  const shown = filter === 'all' ? all : all.filter((m) => m.kind === filter);

  const count = (f: Filter) => (f === 'all' ? all.length : all.filter((m) => m.kind === f).length);
  const photos = all.reduce((n, m) => n + memoryPhotos(m).length, 0);
  const [recapYear, setRecapYear] = useState<number | null>(null);
  const thisYear = new Date().getFullYear();
  const fill = { all: '#634882', moment: '#E2336A', date: '#D88C0C', trip: '#0C8F82' } as const;

  return (
    <View className="gap-5">
      <View className="rounded-[30px] bg-paper-raised p-4" style={{ shadowColor: '#7A4B3A', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 4 }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <BookHeart size={22} color="#F5547C" />
            <Text className="font-sans-bold text-[20px]">Our story</Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="font-sans-medium text-small text-ink-muted">{`${photos} ${photos === 1 ? 'photo' : 'photos'}`}</Text>
            {all.length ? (
              <Pressable accessibilityRole="button" onPress={() => setRecapYear(thisYear)} className="rounded-full bg-gold-50 px-3 py-1 active:opacity-80">
                <Text className="font-sans-bold text-small text-gold-700">Our year</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <View className="mt-3 flex-row gap-2">
          {TILES.map((t) => {
            const selected = filter === t.value;
            return (
              <Pressable
                key={t.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`${t.label}, ${count(t.value)}`}
                onPress={() => setFilter(t.value)}
                className={cn('flex-1 items-center gap-1 rounded-[18px] py-3', t.wash)}
                style={selected ? { borderWidth: 2, borderColor: fill[t.value] } : { borderWidth: 2, borderColor: 'transparent' }}
              >
                <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: fill[t.value] }}>
                  <t.Icon size={18} color="#fff" />
                </View>
                <Text className="font-sans-bold text-[19px] leading-6">{String(count(t.value))}</Text>
                <Text className="font-sans-semibold text-micro text-ink-soft">{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setEditing({})}
          className="mt-3 h-12 flex-row items-center justify-center gap-2 rounded-full bg-rose-600 active:scale-[0.98]"
          style={{ shadowColor: '#C41D55', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4 }}
        >
          <Plus size={20} color="#fff" strokeWidth={2.6} />
          <Text className="font-sans-bold text-body text-white">Keep a memory</Text>
        </Pressable>
      </View>

      {all.length >= 3 && offerRecap(couple.paired_at) ? (
        <Pressable accessibilityRole="button" onPress={() => setRecapYear(thisYear)} className="flex-row items-center gap-3 rounded-[26px] bg-plum-800 p-4 active:opacity-90">
          <Sparkles size={22} color="#FFD98A" />
          <View className="flex-1">
            <Display className="text-heading text-paper">{`Our ${thisYear}`}</Display>
            <Text className="text-small text-paper/75">Your year together, in memories.</Text>
          </View>
          <ChevronRight size={20} color="#FFD98A" />
        </Pressable>
      ) : null}

      {resurfaced.length > 0 ? (
        <GradientView from={c.scheme === 'dark' ? '#33250A' : '#FFE7AE'} to={c.scheme === 'dark' ? '#19141D' : '#FFF6E0'} radius={26} className="gap-3 p-4">
          <View className="flex-row items-center gap-2">
            <Sparkles size={18} color={c.onGold} />
            <Text className="font-sans-bold text-body text-gold-700">On this day</Text>
          </View>
          {resurfaced.map((m) => (
            <Pressable key={m.id} onPress={() => setViewing(m)} className="flex-row items-center gap-3 rounded-[18px] bg-white/70 p-2 dark:bg-paper-raised" accessibilityRole="button">
              {memoryCover(m) && urls[memoryCover(m)!] ? (
                <CachedPhoto uri={urls[memoryCover(m)!]!} cacheKey={memoryCover(m)} style={{ width: 56, height: 56, borderRadius: 14 }} />
              ) : (
                <View className="h-14 w-14 items-center justify-center rounded-[14px] bg-gold-100">
                  <Sparkles size={22} color={c.onGold} />
                </View>
              )}
              <View className="flex-1">
                <Text className="font-sans-bold text-[16px]" numberOfLines={1}>
                  {m.title}
                </Text>
                <Text className="text-small text-ink-soft">{m.yearsAgo === 1 ? 'A year ago today' : `${m.yearsAgo} years ago today`}</Text>
              </View>
            </Pressable>
          ))}
        </GradientView>
      ) : null}

      {memories.error ? <ErrorNote>{memories.error}</ErrorNote> : null}

      {!memories.loading && shown.length === 0 ? (
        <EmptyNote title={all.length ? 'Nothing here yet' : 'Your first memory'}>
          {`The small moments that turned out to be big ones. ${partner.display_name} sees them too.`}
        </EmptyNote>
      ) : (
        groupByMonth(shown).map((g) => (
          <View key={g.key} className="gap-4 pt-1">
            <View className="flex-row items-center gap-2.5">
              <View className="h-6 w-1 rounded-full bg-rose-500" />
              <Text className="font-sans-bold text-[19px]">{g.label}</Text>
            </View>
            <View className="flex-row flex-wrap justify-between gap-y-4">
              {g.items.map((m, i) => (
                <View key={m.id} className="w-[48.5%]">
                  <MemoryCard
                    memory={m}
                    index={i}
                    url={memoryCover(m) ? urls[memoryCover(m)!] : undefined}
                    rated={!!ratings.data?.[m.id]}
                    story={stories.has(m.id)}
                    onOpen={() => (stories.has(m.id) ? openStory(m) : setViewing(m))}
                  />
                </View>
              ))}
            </View>
          </View>
        ))
      )}

      <FormSheet open={!!viewing} title={viewing?.title ?? ''} onClose={() => setViewing(null)}>
        {viewing ? (
          <MemoryDetail
            key={viewing.id}
            memory={viewing}
            urls={urls}
            rating={ratings.data?.[viewing.id]}
            authorName={personFor(ctx, viewing.created_by).mine ? 'you' : partner.display_name}
            onStory={
              stories.has(viewing.id)
                ? () => {
                    setViewing(null);
                    openStory(viewing);
                  }
                : undefined
            }
            onEdit={() => {
              setEditing({ memory: viewing });
              setViewing(null);
            }}
            onSaveRating={(r) => ratings.mutate(() => saveMyRating(sb, { memory_id: viewing.id, owner_id: me.id, ...r }))}
          />
        ) : null}
      </FormSheet>

      <FormSheet open={recapYear !== null} title={`Our ${recapYear ?? ''}`} onClose={() => setRecapYear(null)}>
        {recapYear !== null ? <YearRecapView year={recapYear} memories={all} urls={urls} onYear={setRecapYear} /> : null}
      </FormSheet>

      <FormSheet open={!!editing} title={editing?.memory ? 'Edit memory' : 'Keep a memory'} onClose={() => setEditing(null)}>
        {editing ? (
          <MemoryForm
            key={editing.memory?.id ?? 'new'}
            initial={editing.memory}
            urls={urls}
            onSubmit={async ({ fields, photos, video, cover }) => {
              const before = editing.memory;
              const upload = async (pk: Picked) => uploadMemoryPhoto(sb, couple.id, await (await fetch(pk.uri)).arrayBuffer(), pk.mimeType);
              await memories.mutate(async () => {
                // New photos go up in their place in the order; the first is the cover.
                const photo_paths: string[] = [];
                for (const p of photos) {
                  if (p.path) photo_paths.push(p.path);
                  else if (p.picked) photo_paths.push(await upload(p.picked));
                }
                let video_path = before?.video_path ?? null;
                let video_meta = before?.video_meta ?? null;
                let video_poster_path = before?.video_poster_path ?? null;
                if (video === null) [video_path, video_meta, video_poster_path] = [null, null, null];
                else if (video) {
                  video_meta = video.meta;
                  video_path = await uploadMemoryVideo(sb, couple.id, await (await fetch(video.uri)).arrayBuffer(), video.mimeType);
                  video_poster_path = video.still ? await upload(video.still) : null;
                }
                // undefined: leave the chosen cover; null: back to automatic.
                const cover_path = cover === undefined ? (before?.cover_path ?? null) : cover === null ? null : await upload(cover);
                const row = { ...fields, photo_paths, photo_path: photo_paths[0] ?? null, video_path, video_meta, video_poster_path, cover_path };
                const saved = before ? await updateMemory(sb, before.id, row) : await createMemory(sb, { ...row, couple_id: couple.id, created_by: me.id });
                // Files taken off (or replaced) go once the memory no longer points at them.
                const keep = new Set(memoryFiles(row as Memory));
                const gone = before ? memoryFiles(before).filter((x) => !keep.has(x)) : [];
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
      </FormSheet>
    </View>
  );
}

const TILES: { value: Filter; label: string; Icon: typeof Heart; wash: string }[] = [
  { value: 'all', label: 'All', Icon: BookHeart, wash: 'bg-plum-50' },
  { value: 'moment', label: 'Moments', Icon: Heart, wash: 'bg-rose-50' },
  { value: 'date', label: 'Dates', Icon: Wine, wash: 'bg-gold-50' },
  { value: 'trip', label: 'Trips', Icon: Plane, wash: 'bg-teal-50' },
];

/** A memory without a photo still gets a picture: its kind, on a soft wash. */
const KIND_ART: Record<MemoryKind, { Icon: typeof Heart; from: string; to: string; ink: string; badge: string }> = {
  moment: { Icon: Heart, from: '#FFD9E3', to: '#FFF0F4', ink: '#FF86A3', badge: 'text-rose-700' },
  date: { Icon: Wine, from: '#FFE7B0', to: '#FFF6E0', ink: '#D88C0C', badge: 'text-gold-700' },
  trip: { Icon: Plane, from: '#C8F2EA', to: '#EEFBF8', ink: '#1BAE9C', badge: 'text-teal-700' },
};

/** A polaroid: the photo (or the kind's picture), the title in the margin. */
function MemoryCard({ memory, index, url, rated, story, onOpen }: { memory: Memory; index: number; url?: string; rated: boolean; story: boolean; onOpen: () => void }) {
  const art = KIND_ART[memory.kind];
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={memory.title}
      className="rounded-[10px] bg-paper-raised p-2 pb-3 active:opacity-90"
      style={{
        transform: [{ rotate: index % 2 ? '1.2deg' : '-1.2deg' }],
        shadowColor: '#7A4B3A',
        shadowOpacity: 0.16,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
      }}
    >
      <View className="aspect-square overflow-hidden rounded-[6px] bg-paper-sunken">
        {memoryCover(memory) ? (
          url ? <CachedPhoto uri={url} cacheKey={memoryCover(memory)} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} /> : null
        ) : memory.video_path ? (
          // A video whose still isn't made yet: a dark frame with a play mark, never blank.
          <View className="h-full w-full items-center justify-center bg-plum-900">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-white/20">
              <Play size={22} color="#fff" fill="#fff" />
            </View>
          </View>
        ) : (
          <GradientView from={art.from} to={art.to} className="h-full w-full items-center justify-center">
            <art.Icon size={44} color={art.ink} />
          </GradientView>
        )}
        <View className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5">
          <Text className={cn('font-sans-bold text-[11px]', art.badge)}>{KIND_LABEL[memory.kind]}</Text>
        </View>
        {memoryPhotos(memory).length > 1 || memory.video_path ? (
          <View className="absolute bottom-2 right-2 flex-row items-center gap-1 rounded-full bg-plum-900/70 px-2 py-0.5">
            {memory.video_path ? <Play size={11} color="#fff" fill="#fff" /> : null}
            {memoryPhotos(memory).length > 1 ? <Text className="font-sans-bold text-[11px] text-white">{`+${memoryPhotos(memory).length - 1}`}</Text> : null}
          </View>
        ) : null}
        {rated ? (
          <View className="absolute right-2 top-2 h-6 w-6 items-center justify-center rounded-full bg-white/90">
            <Heart size={13} color="#F5547C" fill="#F5547C" />
          </View>
        ) : null}
      </View>
      <View className="px-1 pt-2.5">
        <Text numberOfLines={2} className="font-sans-bold text-[15px] leading-5">
          {memory.title}
        </Text>
        <Text className="mt-0.5 text-micro text-ink-muted">{formatDay(memory.happened_on)}</Text>
        {story ? <Text className="mt-1 font-sans-bold text-micro text-rose-600">Open the story 🎂</Text> : null}
      </View>
    </Pressable>
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
  const c = usePalette();
  const [stars, setStars] = useState<number | null>(rating?.rating ?? null);
  const [note, setNote] = useState(rating?.note ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Gallery photos={memoryPhotos(memory).map((p) => urls[p]).filter((u): u is string => !!u)} title={memory.title} />
      {memory.video_path && urls[memory.video_path] ? <MemoryVideo uri={urls[memory.video_path]!} meta={memory.video_meta} title={memory.title} /> : null}
      <Text className="text-small text-ink-muted">
        {formatDay(memory.happened_on)} · {KIND_LABEL[memory.kind]} · kept by {authorName}
      </Text>
      {memory.body ? (
        <Display light className="text-lead">
          {memory.body}
        </Display>
      ) : null}
      {onStory ? <Button onPress={onStory}>Open the story 🎂</Button> : null}
      <Sheet tone="inset" pad="sm" className="gap-3">
        <View className="flex-row items-center justify-between">
          <Text className="font-sans-medium text-small">How it felt to you</Text>
          <PrivacyBadge privacy="private" partnerName="" />
        </View>
        <View className="flex-row gap-1" accessibilityRole="radiogroup" accessibilityLabel="Your rating">
          {[1, 2, 3, 4, 5].map((n) => {
            const on = !!stars && n <= stars;
            return (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityState={{ checked: stars === n }}
                accessibilityLabel={`${n} of 5`}
                hitSlop={4}
                onPress={() => setStars(stars === n ? null : n)}
                className="p-1"
              >
                <Heart size={26} color={on ? c.rose : c.faint} fill={on ? c.rose : 'transparent'} />
              </Pressable>
            );
          })}
        </View>
        <Field label="A private note" value={note} onChangeText={setNote} multiline inputClassName="h-20 py-3" maxLength={2000} placeholder="Only you will ever see this." />
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          onPress={async () => {
            setError(null);
            try {
              await onSaveRating({ rating: stars, note: note.trim() || null });
              setSaved(true);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          {saved ? 'Saved' : 'Save for me'}
        </Button>
      </Sheet>
      <Button variant="quiet" onPress={onEdit}>
        Edit memory
      </Button>
    </>
  );
}

/** A photo in the form: one already kept (its path) or one just picked. */
type FormPhoto = { key: string; path?: string; picked?: Picked; url?: string };

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
    video: PickedVideo | null | undefined;
    /** A cover photo chosen now, null for automatic, undefined to leave it. */
    cover: Picked | null | undefined;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const c = usePalette();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [day, setDay] = useState(initial?.happened_on ?? toDateKey(new Date()));
  const [kind, setKind] = useState<MemoryKind>(initial?.kind ?? 'moment');
  const [photos, setPhotos] = useState<FormPhoto[]>(() => (initial ? memoryPhotos(initial).map((p) => ({ key: p, path: p, url: urls[p] })) : []));
  const [video, setVideo] = useState<PickedVideo | null | undefined>(undefined);
  const hasVideo = !!video || (video === undefined && !!initial?.video_path);
  const [cover, setCover] = useState<Picked | null | undefined>(undefined);
  const coverShown = cover ? cover.uri : cover === undefined && initial?.cover_path ? urls[initial.cover_path] : undefined;
  const ownCover = !!cover || (cover === undefined && !!initial?.cover_path);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const move = (i: number) =>
    setPhotos((ps) => {
      const next = [...ps];
      const [p] = next.splice(i, 1);
      next.unshift(p!);
      return next;
    });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      {photos.length ? (
        <View className="flex-row flex-wrap gap-2" accessibilityLabel="Photos, the first is the cover">
          {photos.map((p, i) => (
            <View key={p.key} className="h-24 w-24 overflow-hidden rounded-control bg-paper-sunken">
              {p.picked?.uri || p.url ? <Image source={{ uri: p.picked?.uri ?? p.url }} className="h-full w-full" resizeMode="cover" /> : null}
              {i === 0 && !ownCover ? (
                <View className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5">
                  <Text className="font-sans-bold text-[10px]">Cover</Text>
                </View>
              ) : null}
              <View className="absolute inset-x-1 bottom-1 flex-row justify-between">
                {i > 0 || ownCover ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Make cover"
                    hitSlop={6}
                    onPress={() => {
                      move(i);
                      setCover(null);
                    }}
                    className="rounded-full bg-plum-900/70 p-1"
                  >
                    <Star size={14} color="#fff" />
                  </Pressable>
                ) : (
                  <View />
                )}
                <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={6} onPress={() => setPhotos((ps) => ps.filter((x) => x.key !== p.key))} className="rounded-full bg-plum-900/70 p-1">
                  <X size={14} color="#fff" />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {photos.length < MEMORY_PHOTOS_MAX ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              void pickPhotos(MEMORY_PHOTOS_MAX - photos.length).then((picked) =>
                setPhotos((ps) => [...ps, ...picked.map((pk) => ({ key: `${pk.uri}-${Math.random()}`, picked: pk }))]),
              )
            }
            className="h-11 flex-row items-center gap-2 rounded-control border border-dashed border-paper-edge px-3 active:bg-paper-sunken"
          >
            <ImagePlus size={20} color={c.inkSoft} />
            <Text className="text-small text-ink-soft">{photos.length ? 'Add more photos' : 'Add photos'}</Text>
          </Pressable>
        ) : null}
        {hasVideo ? (
          <View className="h-11 flex-row items-center gap-2 rounded-control bg-paper-sunken px-3">
            <Film size={20} color={c.ink} />
            <Text className="text-small">A video</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Remove video" hitSlop={8} onPress={() => setVideo(null)}>
              <X size={16} color={c.inkMuted} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() =>
              void (async () => {
                setError(null);
                setBusy(true);
                try {
                  const v = await pickVideo();
                  if (v) setVideo(v);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              })()
            }
            className="h-11 flex-row items-center gap-2 rounded-control border border-dashed border-paper-edge px-3 active:bg-paper-sunken"
          >
            <Film size={20} color={c.inkSoft} />
            <Text className="text-small text-ink-soft">Add a video</Text>
          </Pressable>
        )}
      </View>
      <View className="flex-row items-center gap-3 rounded-control bg-paper-sunken p-2.5">
        <View className="h-14 w-14 overflow-hidden rounded-[10px] bg-paper-raised">
          {coverShown ? <Image source={{ uri: coverShown }} className="h-full w-full" resizeMode="cover" /> : null}
        </View>
        <View className="flex-1">
          <Text className="font-sans-medium text-small">Cover</Text>
          <Text className="text-micro text-ink-muted">{ownCover ? 'Your own photo' : 'Automatic: the first photo, or a still from the video'}</Text>
        </View>
        {ownCover ? (
          <Button variant="quiet" size="sm" onPress={() => setCover(null)}>
            Automatic
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" onPress={() => void pickPhotos(1).then(([pk]) => pk && setCover(pk))}>
          {ownCover ? 'Change' : 'Choose'}
        </Button>
      </View>
      <Field label="Title" value={title} onChangeText={setTitle} maxLength={200} placeholder="The night it rained in Lisbon" />
      <DateStepper label="When" value={day} onChange={setDay} />
      <View className="gap-1.5">
        <Text className="font-sans-medium text-small">Kind</Text>
        <Segmented label="Kind" options={MEMORY_KINDS} value={kind} onChange={setKind} />
      </View>
      <Field label="The story (optional)" value={body} onChangeText={setBody} multiline inputClassName="h-28 py-3" maxLength={5000} />
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Button
        loading={busy}
        disabled={!title.trim()}
        onPress={() => run(() => onSubmit({ fields: { title: title.trim(), body: body.trim() || null, happened_on: day, kind }, photos, video, cover }))}
      >
        {initial ? 'Save' : 'Keep it'}
      </Button>
      {onDelete ? (
        <Button
          variant="quiet"
          disabled={busy}
          onPress={() =>
            Alert.alert('Delete this memory?', 'It will be gone for both of you.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => void run(onDelete) },
            ])
          }
        >
          Delete
        </Button>
      ) : null}
    </>
  );
}

/** The photos, one per page; swipe between them. */
function Gallery({ photos, title }: { photos: string[]; title: string }) {
  const { width } = useWindowDimensions();
  const [at, setAt] = useState(0);
  const w = width - 40;
  if (!photos.length) return null;
  if (photos.length === 1) return <Photo uri={photos[0]!} label={`Photo: ${title}`} />;
  return (
    <View>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(u) => u}
        onMomentumScrollEnd={(e) => setAt(Math.round(e.nativeEvent.contentOffset.x / w))}
        renderItem={({ item, index }) => (
          <View style={{ width: w }}>
            <Photo uri={item} label={`Photo ${index + 1} of ${photos.length}: ${title}`} />
          </View>
        )}
      />
      <Text className="mt-1 text-center text-micro text-ink-muted" accessibilityLiveRegion="polite">{`${at + 1} / ${photos.length}`}</Text>
    </View>
  );
}

function MemoryVideo({ uri, meta, title }: { uri: string; meta: Memory['video_meta']; title: string }) {
  const player = useVideoPlayer(uri);
  const aspect = meta?.width && meta?.height ? meta.width / meta.height : 16 / 9;
  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      accessibilityLabel={`Video: ${title}`}
      style={{ width: '100%', aspectRatio: Math.min(Math.max(aspect, 0.56), 1.8), borderRadius: 12, backgroundColor: '#000' }}
    />
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
    <>
      <Display light italic className="text-lead text-ink-soft">
        {`${r.daysTogether.toLocaleString()} days with ${partner.display_name} by ${year === new Date().getFullYear() ? 'now' : `the end of ${year}`}.`}
      </Display>
      {r.highlights.length ? (
        <View className="flex-row flex-wrap justify-between gap-y-1.5">
          {r.highlights.map((p) => (
            <View key={p} className="aspect-square w-[32.5%] overflow-hidden rounded-[10px] bg-paper-sunken">
              {urls[p] ? <CachedPhoto uri={urls[p]!} cacheKey={p} style={{ width: '100%', height: '100%' }} /> : null}
            </View>
          ))}
        </View>
      ) : null}
      <View className="flex-row flex-wrap justify-between gap-y-2">
        {stats.map((x) => (
          <View key={x.label} className="w-[32%] items-center rounded-[16px] bg-paper-sunken p-3" accessible accessibilityLabel={`${x.n} ${x.label}`}>
            <Display className="text-title">{x.n.toLocaleString()}</Display>
            <Text className="text-micro text-ink-soft">{x.label}</Text>
          </View>
        ))}
      </View>
      {r.busiest ? <Text className="text-ink-soft">{`Your fullest month was ${r.busiest.month}, with ${r.busiest.count} memories.`}</Text> : null}
      {r.first ? <Text className="text-ink-soft">{`It began with “${r.first.title}” on ${formatDay(r.first.happened_on)}.`}</Text> : null}
      {!r.memories ? <EmptyNote title="Nothing kept from this year">Add a memory and it shows up here.</EmptyNote> : null}
      {year > first ? (
        <View className="flex-row justify-between">
          <Button variant="quiet" size="sm" icon={<ChevronLeft size={16} color="#634882" />} onPress={() => onYear(year - 1)}>
            {String(year - 1)}
          </Button>
          {year < new Date().getFullYear() ? (
            <Button variant="quiet" size="sm" onPress={() => onYear(year + 1)}>
              {`${year + 1} ›`}
            </Button>
          ) : null}
        </View>
      ) : null}
    </>
  );
}
