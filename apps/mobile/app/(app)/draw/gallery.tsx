import { timeAgo, type Drawing } from '@us/shared';
import { useCouple, useDrawings, useFeature } from '@us/shared/react';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { drawingTitle } from '@/components/draw/titles';
import { FeatureOff } from '@/components/feature-off';
import { EmptyNote } from '@/components/module-screen';
import { cn } from '@/components/ui/cn';
import { usePalette } from '@/components/ui/palette';
import { Display, Text } from '@/components/ui/text';

type Filter = 'all' | 'canvas' | 'doodle' | 'guess' | 'daily';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'canvas', label: 'Together' },
  { id: 'doodle', label: 'Doodles' },
  { id: 'guess', label: 'Draw & Guess' },
  { id: 'daily', label: 'Daily' },
];

/** Our drawings, newest first, by week and month. Tap one to watch it being drawn. */
export default function Gallery() {
  const on = useFeature('draw');
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const { width } = useWindowDimensions();
  const { me, partner } = useCouple();
  const { drawings, urls, loading, reload } = useDrawings(on);
  const [filter, setFilter] = useState<Filter>('all');
  const tile = Math.floor((width - 32 - 20) / 3);

  const visible = useMemo(() => drawings.filter((d) => d.kind !== 'guess' || d.answered_at || d.created_by === me.id), [drawings, me.id]);
  const shown = filter === 'all' ? visible : visible.filter((d) => d.kind === filter);
  const groups = useMemo(() => {
    const out: { label: string; items: Drawing[] }[] = [];
    const weekAgo = Date.now() - 7 * 86_400_000;
    for (const d of shown) {
      const t = Date.parse(d.created_at);
      const label = t > weekAgo ? 'This week' : new Date(t).toLocaleDateString(undefined, { month: 'long', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
      const g = out.at(-1);
      if (g?.label === label) g.items.push(d);
      else out.push({ label, items: [d] });
    }
    return out;
  }, [shown]);

  if (!on) return <FeatureOff />;

  return (
    <View className="flex-1 bg-paper" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-2.5 px-4 pb-2">
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} className="h-11 w-11 items-center justify-center rounded-[14px] bg-paper-sunken">
          <ChevronLeft size={20} color={c.inkSoft} />
        </Pressable>
        <Display className="flex-1 text-title">Our drawings</Display>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="max-h-[54px] grow-0" contentContainerClassName="gap-2 px-4 py-2">
        {FILTERS.map((f) => {
          const sel = filter === f.id;
          return (
            <Pressable key={f.id} accessibilityRole="tab" accessibilityState={{ selected: sel }} onPress={() => setFilter(f.id)} className={cn('h-9 justify-center rounded-full px-3.5', sel ? 'bg-plum-800' : 'bg-paper-sunken')}>
              <Text className={cn('font-sans-semibold text-small', sel ? 'text-paper' : 'text-ink-soft')}>{f.id === 'all' ? `All ${visible.length}` : f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <ScrollView
        contentContainerClassName="gap-2.5 px-4 pt-2"
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={reload} />}
      >
        {loading ? <ActivityIndicator color={c.rose} className="py-10" /> : null}
        {!loading && !shown.length ? (
          <EmptyNote title={filter === 'all' ? 'Nothing saved yet' : 'None of these yet'}>Save a drawing from Draw together and it lands here.</EmptyNote>
        ) : null}
        {groups.map((g) => (
          <View key={g.label} className="gap-2.5 pb-2">
            <Text className="font-sans-bold text-micro uppercase tracking-[0.5px] text-ink-muted">{g.label}</Text>
            <View className="flex-row flex-wrap gap-2.5">
              {g.items.map((d) => (
                <Pressable
                  key={d.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${drawingTitle(d, partner.id, partner.display_name)}, ${timeAgo(d.created_at)}`}
                  onPress={() => router.push({ pathname: '/draw/[id]', params: { id: d.id } })}
                  className="gap-1.5"
                  style={{ width: tile }}
                >
                  <View className={cn('overflow-hidden rounded-[14px] border border-paper-edge', d.kind === 'doodle' ? 'bg-gold-100' : 'bg-white')} style={{ width: tile, height: (tile * 4) / 3 }}>
                    {urls[d.png_path] ? <Image source={{ uri: urls[d.png_path] }} style={{ width: tile, height: (tile * 4) / 3 }} /> : null}
                  </View>
                  <Text className="font-sans-semibold text-micro" numberOfLines={1}>
                    {drawingTitle(d, partner.id, partner.display_name)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
