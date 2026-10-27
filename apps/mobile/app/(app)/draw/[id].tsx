import {
  deleteDrawing,
  DRAW_TOPIC,
  drawingPng,
  drawingToMemory,
  getDrawing,
  LIVE_CANVAS,
  loadStrokes,
  setCouplePhoto,
  timeAgo,
  type Drawing,
  type DrawingFile,
} from '@us/shared';
import { useCouple, useDrawHub, useDrawings, useFeature } from '@us/shared/react';
import { router, useLocalSearchParams } from 'expo-router';
import { Heart, ImagePlus, PenLine, Share2, Trash2, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBgPhotoUrl } from '@/components/draw/hooks';
import { Replay } from '@/components/draw/replay';
import { drawingTitle } from '@/components/draw/titles';
import { FeatureOff } from '@/components/feature-off';
import { Text } from '@/components/ui/text';

/** One drawing, redrawn stroke by stroke, with what to do with it. */
export default function DrawingScreen() {
  const on = useFeature('draw');
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { sb, me, partner, mySlot, couple, channel } = useCouple();
  const hub = useDrawHub();
  const { urls } = useDrawings(on);
  const [d, setD] = useState<Drawing | null>(null);
  const [file, setFile] = useState<DrawingFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const photoUrl = useBgPhotoUrl(file?.bg);

  useEffect(() => {
    let live = true;
    void (async () => {
      const row = await getDrawing(sb, id);
      if (!live) return;
      if (!row) return setError('This drawing isn’t here any more.');
      setD(row);
      setFile(await loadStrokes(sb, row.strokes_path));
    })().catch((e: Error) => live && setError(e.message || 'This drawing couldn’t be opened.'));
    return () => {
      live = false;
    };
  }, [sb, id]);

  const counts = useMemo(() => {
    if (!file) return null;
    const ink = file.strokes.filter((s) => s.tool !== 'eraser');
    return { mine: ink.filter((s) => s.by === me.id).length, theirs: ink.filter((s) => s.by !== me.id).length };
  }, [file, me.id]);

  if (!on) return <FeatureOff />;

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

  const title = d ? drawingTitle(d, partner.id, partner.display_name) : '';
  const who = d ? (d.artists.length > 1 ? 'drawn together' : d.created_by === me.id ? 'drawn by you' : `drawn by ${partner.display_name}`) : '';
  const boardW = Math.min(width - 32, 520);

  return (
    <View className="flex-1 bg-plum-800" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-2.5 px-4 pb-3">
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} className="h-11 w-11 items-center justify-center rounded-[14px] bg-white/10">
          <X size={18} color="#FCFAFB" />
        </Pressable>
        <View className="flex-1">
          <Text className="font-sans-bold text-lead text-paper" numberOfLines={1}>
            {title}
          </Text>
          {d ? <Text className="text-micro text-plum-200">{`${timeAgo(d.created_at)} · ${who} · ${d.stroke_count} ${d.stroke_count === 1 ? 'stroke' : 'strokes'}`}</Text> : null}
        </View>
      </View>
      <ScrollView contentContainerClassName="gap-3 px-4" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {error ? <Text className="py-10 text-center text-body text-plum-100">{error}</Text> : null}
        {file ? <Replay file={file} width={boardW} photoUrl={photoUrl} /> : !error ? <ActivityIndicator color="#FCFAFB" className="py-24" /> : null}
        {counts ? (
          <View className="flex-row gap-3.5">
            <View className="flex-row items-center gap-1.5">
              <View className={mySlot === 'a' ? 'h-2 w-2 rounded-full bg-rose-400' : 'h-2 w-2 rounded-full bg-teal-300'} />
              <Text className="text-micro text-plum-300">{`${me.display_name} ${counts.mine} ${counts.mine === 1 ? 'stroke' : 'strokes'}`}</Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className={mySlot === 'a' ? 'h-2 w-2 rounded-full bg-teal-300' : 'h-2 w-2 rounded-full bg-rose-400'} />
              <Text className="text-micro text-plum-300">{`${partner.display_name} ${counts.theirs} ${counts.theirs === 1 ? 'stroke' : 'strokes'}`}</Text>
            </View>
          </View>
        ) : null}
        {d ? (
          <View className="flex-row flex-wrap gap-2">
            <Action
              label="Share PNG"
              icon={<Share2 size={19} color="#FCFAFB" />}
              busy={false}
              onPress={() => {
                const url = urls[d.png_path];
                if (url) void Share.share({ message: url, url, title });
              }}
            />
            <Action
              label="Add to Memories"
              icon={<ImagePlus size={19} color="#FCC24F" />}
              busy={busy === 'memory'}
              onPress={() => void act('memory', () => drawingToMemory(sb, d, me.id), 'Added to Memories')}
            />
            <Action
              label="Photo of us"
              icon={<Heart size={19} color="#FF86A3" />}
              busy={busy === 'photo'}
              onPress={() =>
                void act(
                  'photo',
                  async () => {
                    await setCouplePhoto(sb, couple, await drawingPng(sb, d), 'image/png');
                    channel.sendChanged('home');
                  },
                  'It’s your photo of us now',
                )
              }
            />
            <Action
              label="Keep drawing"
              icon={<PenLine size={19} color="#91E3D5" />}
              busy={false}
              onPress={() => {
                if (!file) return;
                hub.session(LIVE_CANVAS).load(file.strokes, file.bg ?? null);
                router.replace('/draw');
              }}
            />
            {d.created_by === me.id ? (
              <Action
                label="Delete"
                icon={<Trash2 size={19} color="#D4C2E6" />}
                busy={busy === 'delete'}
                onPress={() =>
                  Alert.alert('Delete this drawing?', 'It goes for both of you.', [
                    { text: 'Keep it', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () =>
                        void act(
                          'delete',
                          async () => {
                            await deleteDrawing(sb, d);
                            channel.sendChanged(DRAW_TOPIC);
                            router.back();
                          },
                          'Deleted',
                        ),
                    },
                  ])
                }
              />
            ) : null}
          </View>
        ) : null}
        {note ? <Text className="text-small text-plum-100">{note}</Text> : null}
      </ScrollView>
    </View>
  );
}

function Action({ label, icon, busy, onPress }: { label: string; icon: React.ReactNode; busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      className="h-16 min-w-[31%] flex-1 items-center justify-center gap-1 rounded-[14px] bg-plum-700 px-2 active:opacity-80"
    >
      {busy ? <ActivityIndicator color="#FCFAFB" /> : icon}
      <Text className="text-center font-sans-semibold text-micro text-paper" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
    </Pressable>
  );
}
