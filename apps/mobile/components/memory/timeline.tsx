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
import * as ImagePicker from '@/lib/image-picker';
import { readyPicked } from '@/lib/photo';
import { router } from 'expo-router';
import { BookHeart, Heart, ImagePlus, Plane, Plus, Sparkles, Wine, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
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

async function pickPhoto(): Promise<Picked | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, exif: false });
  const asset = res.canceled ? null : res.assets[0];
  // A camera-sized original would be several MB here and in every thumbnail.
  return asset ? readyPicked(asset) : null;
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

  const count = (f: Filter) => (f === 'all' ? all.length : all.filter((m) => m.kind === f).length);
  const photos = all.filter((m) => m.photo_path).length;
  const fill = { all: '#634882', moment: '#E2336A', date: '#D88C0C', trip: '#0C8F82' } as const;

  return (
    <View className="gap-5">
      <View className="rounded-[30px] bg-paper-raised p-4" style={{ shadowColor: '#7A4B3A', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 4 }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <BookHeart size={22} color="#F5547C" />
            <Text className="font-sans-bold text-[20px]">Our story</Text>
          </View>
          <Text className="font-sans-medium text-small text-ink-muted">{`${photos} ${photos === 1 ? 'photo' : 'photos'}`}</Text>
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

      {resurfaced.length > 0 ? (
        <GradientView from={c.scheme === 'dark' ? '#33250A' : '#FFE7AE'} to={c.scheme === 'dark' ? '#19141D' : '#FFF6E0'} radius={26} className="gap-3 p-4">
          <View className="flex-row items-center gap-2">
            <Sparkles size={18} color={c.onGold} />
            <Text className="font-sans-bold text-body text-gold-700">On this day</Text>
          </View>
          {resurfaced.map((m) => (
            <Pressable key={m.id} onPress={() => setViewing(m)} className="flex-row items-center gap-3 rounded-[18px] bg-white/70 p-2 dark:bg-paper-raised" accessibilityRole="button">
              {m.photo_path && urls[m.photo_path] ? (
                <CachedPhoto uri={urls[m.photo_path]!} cacheKey={m.photo_path} style={{ width: 56, height: 56, borderRadius: 14 }} />
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
                    url={m.photo_path ? urls[m.photo_path] : undefined}
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
            url={viewing.photo_path ? urls[viewing.photo_path] : undefined}
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

      <FormSheet open={!!editing} title={editing?.memory ? 'Edit memory' : 'Keep a memory'} onClose={() => setEditing(null)}>
        {editing ? (
          <MemoryForm
            key={editing.memory?.id ?? 'new'}
            initial={editing.memory}
            photoUrl={editing.memory?.photo_path ? urls[editing.memory.photo_path] : undefined}
            onSubmit={async ({ fields, photo, removePhoto }) => {
              await memories.mutate(async () => {
                let photo_path = editing.memory?.photo_path ?? null;
                if (photo) {
                  const bytes = await (await fetch(photo.uri)).arrayBuffer();
                  photo_path = await uploadMemoryPhoto(sb, couple.id, bytes, photo.mimeType);
                }
                if ((photo || removePhoto) && editing.memory?.photo_path) {
                  await removeMemoryPhoto(sb, editing.memory.photo_path).catch(() => {});
                  if (removePhoto && !photo) photo_path = null;
                }
                return editing.memory
                  ? updateMemory(sb, editing.memory.id, { ...fields, photo_path })
                  : createMemory(sb, { ...fields, photo_path, couple_id: couple.id, created_by: me.id });
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
        {memory.photo_path ? (
          url ? <CachedPhoto uri={url} cacheKey={memory.photo_path} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} /> : null
        ) : (
          <GradientView from={art.from} to={art.to} className="h-full w-full items-center justify-center">
            <art.Icon size={44} color={art.ink} />
          </GradientView>
        )}
        <View className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5">
          <Text className={cn('font-sans-bold text-[11px]', art.badge)}>{KIND_LABEL[memory.kind]}</Text>
        </View>
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
  const c = usePalette();
  const [stars, setStars] = useState<number | null>(rating?.rating ?? null);
  const [note, setNote] = useState(rating?.note ?? '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {url ? <Photo uri={url} label={`Photo: ${memory.title}`} /> : null}
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
    photo: Picked | null;
    removePhoto: boolean;
  }) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const c = usePalette();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [day, setDay] = useState(initial?.happened_on ?? toDateKey(new Date()));
  const [kind, setKind] = useState<MemoryKind>(initial?.kind ?? 'moment');
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = photo?.uri ?? (removePhoto ? undefined : photoUrl);

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
      {preview ? (
        <View>
          <Image source={{ uri: preview }} className="aspect-[4/3] w-full rounded-control" resizeMode="cover" />
          <IconButton
            label="Remove photo"
            size="sm"
            tone="night"
            className="absolute right-2 top-2 bg-plum-900/70"
            onPress={() => {
              setPhoto(null);
              setRemovePhoto(true);
            }}
          >
            <X size={16} color="#FCFAFB" />
          </IconButton>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void pickPhoto().then((p) => {
              if (p) {
                setPhoto(p);
                setRemovePhoto(false);
              }
            })
          }
          className="h-32 items-center justify-center gap-2 rounded-control border border-dashed border-paper-edge active:bg-paper-sunken"
        >
          <ImagePlus size={24} color={c.inkSoft} />
          <Text className="text-small text-ink-soft">Add a photo</Text>
        </Pressable>
      )}
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
        onPress={() => run(() => onSubmit({ fields: { title: title.trim(), body: body.trim() || null, happened_on: day, kind }, photo, removePhoto }))}
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
