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
import * as ImagePicker from 'expo-image-picker';
import { Heart, ImagePlus, Plus, Sparkles, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import { EmptyNote, ErrorNote } from '../module-screen';
import { Button, IconButton } from '../ui/button';
import { Field } from '../ui/field';
import { Photo } from '../ui/photo-viewer';
import { DateStepper, FormSheet } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { PrivacyBadge } from '../ui/privacy';
import { Chip, Segmented } from '../ui/segmented';
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
  // Picker output is JPEG unless the source format survives (HEIC/PNG on iOS).
  return asset ? { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' } : null;
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

  return (
    <View className="gap-6">
      {resurfaced.length > 0 ? (
        <Sheet tone="note" accent="gold" className="gap-3">
          <View className="flex-row items-center gap-2">
            <Sparkles size={16} color={c.onGold} />
            <Text className="font-sans-medium text-small text-gold-700">On this day</Text>
          </View>
          {resurfaced.map((m) => (
            <Pressable key={m.id} onPress={() => setViewing(m)} className="flex-row items-center gap-3" accessibilityRole="button">
              {m.photo_path && urls[m.photo_path] ? <Image source={{ uri: urls[m.photo_path] }} className="h-14 w-14 rounded-control" /> : null}
              <View className="flex-1">
                <Display className="text-heading">{m.title}</Display>
                <Text className="text-small text-ink-soft">{m.yearsAgo === 1 ? 'A year ago today' : `${m.yearsAgo} years ago today`}</Text>
              </View>
            </Pressable>
          ))}
        </Sheet>
      ) : null}

      <Button icon={<Plus size={16} color="#fff" />} onPress={() => setEditing({})}>
        Keep a memory
      </Button>

      <View className="flex-row flex-wrap gap-2">
        <Chip selected={filter === 'all'} onPress={() => setFilter('all')}>
          Everything
        </Chip>
        {MEMORY_KINDS.map((k) => (
          <Chip key={k.value} selected={filter === k.value} onPress={() => setFilter(k.value)}>
            {`${k.label}s`}
          </Chip>
        ))}
      </View>

      {memories.error ? <ErrorNote>{memories.error}</ErrorNote> : null}

      {!memories.loading && shown.length === 0 ? (
        <EmptyNote title={all.length ? 'Nothing here yet' : 'Your first memory'}>
          {`The small moments that turned out to be big ones. ${partner.display_name} sees them too.`}
        </EmptyNote>
      ) : (
        groupByMonth(shown).map((g) => (
          <View key={g.key} className="gap-4">
            <Display italic className="text-lead text-ink-soft">
              {g.label}
            </Display>
            {g.items.map((m) => (
              <Pressable key={m.id} onPress={() => setViewing(m)} accessibilityRole="button" accessibilityLabel={m.title}>
                <Sheet pad="none" className="overflow-hidden">
                  {m.photo_path ? (
                    <View className="aspect-[4/3] bg-paper-sunken">
                      {urls[m.photo_path] ? <Image source={{ uri: urls[m.photo_path] }} className="h-full w-full" resizeMode="cover" /> : null}
                    </View>
                  ) : null}
                  <View className="gap-1.5 p-5">
                    <View className="flex-row items-center justify-between">
                      <Text className="text-micro text-ink-muted">{formatDay(m.happened_on)}</Text>
                      <View className="flex-row items-center gap-1.5">
                        {ratings.data?.[m.id] ? <Heart size={12} color={c.rose} fill={c.rose} /> : null}
                        {m.kind !== 'moment' ? (
                          <Text className="rounded-full bg-gold-50 px-2 py-0.5 font-sans-medium text-micro text-gold-700">{KIND_LABEL[m.kind]}</Text>
                        ) : null}
                      </View>
                    </View>
                    <Display className="text-heading">{m.title}</Display>
                    {m.body ? (
                      <Text numberOfLines={3} className="text-small text-ink-soft">
                        {m.body}
                      </Text>
                    ) : null}
                  </View>
                </Sheet>
              </Pressable>
            ))}
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
