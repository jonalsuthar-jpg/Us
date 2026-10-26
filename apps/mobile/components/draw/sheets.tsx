import { BOARD_H, BOARD_W, COLOURING_PAGES, DRAW_BUCKET, listMemories, PAGE_INK, signedPhotoUrls, uuid, type DrawBackground, type Memory } from '@us/shared';
import { useCouple } from '@us/shared/react';
import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, Pressable, Switch, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Button } from '../ui/button';
import { cn } from '../ui/cn';
import { Field } from '../ui/field';
import { FormSheet } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { Text } from '../ui/text';

/** "Save this drawing": a name, and whether to keep it in Memories too. */
export function SaveSheet({
  open,
  onClose,
  toMemory = false,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  toMemory?: boolean;
  onSave: (o: { title: string; toMemory: boolean }) => Promise<void>;
}) {
  const c = usePalette();
  const [title, setTitle] = useState('');
  const [memory, setMemory] = useState(toMemory);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setMemory(toMemory);
  }, [open, toMemory]);
  return (
    <FormSheet open={open} onClose={onClose} title="Save this drawing" centered>
      <Text className="text-small text-ink-soft">It goes in Our drawings, where you can both watch it being drawn again.</Text>
      <Field label="Name it (optional)" value={title} onChangeText={setTitle} maxLength={120} placeholder="Under the sun" />
      <View className="flex-row items-center justify-between rounded-control bg-paper-sunken px-4 py-3">
        <Text className="text-body">Also keep it in Memories</Text>
        <Switch value={memory} onValueChange={setMemory} trackColor={{ true: c.rose }} accessibilityLabel="Also keep it in Memories" />
      </View>
      {error ? <Text className="text-small text-rose-700">{error}</Text> : null}
      <Button
        size="lg"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            await onSave({ title: title.trim(), toMemory: memory });
            setTitle('');
            onClose();
          } catch {
            setError('That didn’t save. Check your connection and try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        Save drawing
      </Button>
    </FormSheet>
  );
}

export function PageThumb({ id, width }: { id: string; width: number }) {
  const page = COLOURING_PAGES.find((p) => p.id === id);
  if (!page) return null;
  return (
    <Svg width={width} height={(width * 4) / 3} viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}>
      {page.paths.map((d, i) => (
        <Path key={i} d={d} fill="none" stroke={PAGE_INK} strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

/** Colouring pages, a photo from Memories, or one from the phone. */
export function BackgroundSheet({ open, onClose, current, onPick }: { open: boolean; onClose: () => void; current: DrawBackground | null; onPick: (bg: DrawBackground | null) => void }) {
  const { sb, couple } = useCouple();
  const c = usePalette();
  const [photos, setPhotos] = useState<{ memory: Memory; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tile = 76;

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
    onClose();
  };
  const ring = (on: boolean) => (on ? { borderWidth: 3, borderColor: c.rose } : { borderWidth: 1, borderColor: c.edge });

  return (
    <FormSheet open={open} onClose={onClose} title="Background">
      <Text className="text-small text-ink-soft">Colour in a page together, or draw on a photo.</Text>
      <Text className="font-sans-semibold text-micro uppercase tracking-[0.6px] text-ink-muted">Colouring pages</Text>
      <View className="flex-row flex-wrap gap-2.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Plain"
          onPress={() => pick(null)}
          className="items-center justify-center gap-1 overflow-hidden rounded-[14px] bg-white"
          style={[{ width: tile, height: (tile * 4) / 3 }, ring(!current)]}
        >
          <X size={20} color={c.inkSoft} />
          <Text className="font-sans-semibold text-micro text-ink-soft">Plain</Text>
        </Pressable>
        {COLOURING_PAGES.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityLabel={p.name}
            onPress={() => pick({ kind: 'page', id: p.id })}
            className="overflow-hidden rounded-[14px] bg-white"
            style={ring(current?.kind === 'page' && current.id === p.id)}
          >
            <PageThumb id={p.id} width={tile} />
          </Pressable>
        ))}
      </View>
      <Text className="font-sans-semibold text-micro uppercase tracking-[0.6px] text-ink-muted">A photo</Text>
      <View className="flex-row flex-wrap gap-2.5">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="A photo from this phone"
          disabled={busy}
          onPress={async () => {
            const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
            const asset = res.canceled ? null : res.assets[0];
            if (!asset) return;
            setBusy(true);
            setError(null);
            try {
              const bytes = await (await fetch(asset.uri)).arrayBuffer();
              const type = asset.mimeType ?? 'image/jpeg';
              const path = `${couple.id}/bg-${uuid()}.${type === 'image/png' ? 'png' : 'jpg'}`;
              const { error: e } = await sb.storage.from(DRAW_BUCKET).upload(path, bytes, { contentType: type });
              if (e) throw e;
              pick({ kind: 'photo', bucket: 'drawings', path });
            } catch {
              setError('That photo didn’t upload. Try a smaller one.');
            } finally {
              setBusy(false);
            }
          }}
          className={cn('items-center justify-center gap-1.5 rounded-[14px] border-2 border-dashed border-rose-300', busy && 'opacity-50')}
          style={{ width: tile, height: (tile * 4) / 3 }}
        >
          <ImagePlus size={20} color={c.onRose} />
          <Text className="text-center font-sans-semibold text-[11px] text-rose-700">{busy ? 'Uploading…' : 'From phone'}</Text>
        </Pressable>
        {photos.map(({ memory, url }) => (
          <Pressable
            key={memory.id}
            accessibilityRole="button"
            accessibilityLabel={`Draw on “${memory.title}”`}
            onPress={() => pick({ kind: 'photo', bucket: 'memories', path: memory.photo_path! })}
            className="overflow-hidden rounded-[14px]"
            style={ring(current?.kind === 'photo' && current.path === memory.photo_path)}
          >
            <Image source={{ uri: url }} style={{ width: tile, height: (tile * 4) / 3 }} />
          </Pressable>
        ))}
      </View>
      {error ? <Text className="text-small text-rose-700">{error}</Text> : null}
    </FormSheet>
  );
}
