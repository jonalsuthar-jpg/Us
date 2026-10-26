import { moduleById, TOGETHER_SOON } from '@us/shared';
import { useFeature } from '@us/shared/react';
import { router } from 'expo-router';
import { BookOpen, Gamepad2, PenLine, Settings } from 'lucide-react-native';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnswersCard, DailyQuestion, useDaily } from '@/components/connect/daily-question';
import { TogetherCards } from '@/components/connect/together-cards';
import { FeatureOff } from '@/components/feature-off';
import { IconButton } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { usePalette } from '@/components/ui/palette';
import { Display, Text } from '@/components/ui/text';

const ACTIVITY = {
  draw: { Icon: PenLine, wash: 'bg-rose-50', fill: 'bg-rose-400', icon: '#fff', pill: 'text-rose-700' },
  games: { Icon: Gamepad2, wash: 'bg-gold-50', fill: 'bg-gold-400', icon: '#352203', pill: 'text-gold-700' },
  read: { Icon: BookOpen, wash: 'bg-sage-50', fill: 'bg-sage-500', icon: '#fff', pill: 'text-sage-700' },
};

// TODO(phase-3): Fight Translator, Future Letters, Inside Jokes. Tables and RLS are ready.
export default function Connect() {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const daily = useDaily();
  const soon = moduleById('connect').features.filter((f) => f.soon);
  const on = useFeature('daily_question');
  const calls = useFeature('calls');

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }}
      contentContainerClassName="gap-5 px-5"
      refreshControl={<RefreshControl refreshing={daily.loading && !!daily.data} onRefresh={() => void daily.reload()} />}
    >
      {/* Same shape as Home's header: a small line, then the big one. */}
      <View className="flex-row items-end gap-3">
        <View className="flex-1">
          <Text className="font-sans-semibold text-micro uppercase tracking-[1.2px] text-teal-700">Connect</Text>
          <Display className="mt-0.5 text-[27px] leading-[32px]">Do something together</Display>
        </View>
        <IconButton label="Settings" size="sm" tone="raised" onPress={() => router.push('/settings')}>
          <Settings size={19} color={c.inkSoft} />
        </IconButton>
      </View>

      {calls ? <TogetherCards /> : null}

      {on ? (
        <View className="gap-3">
          <DailyQuestion daily={daily} />
          <AnswersCard daily={daily} />
        </View>
      ) : calls ? null : (
        <FeatureOff />
      )}

      <View className="gap-3 pt-1">
        <Display className="text-heading">More to do together</Display>
        {TOGETHER_SOON.map((a) => {
          const look = ACTIVITY[a.id];
          return (
            <View key={a.id} className={cn('flex-row items-center gap-3.5 rounded-[20px] p-3.5', look.wash)}>
              <View className={cn('h-12 w-12 items-center justify-center rounded-2xl', look.fill)}>
                <look.Icon size={21} color={look.icon} />
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="font-sans-semibold text-body">{a.title}</Text>
                <Text className="text-micro text-ink-soft">{a.short}</Text>
              </View>
              <View className="rounded-full bg-paper-raised px-3 py-1">
                <Text className={cn('font-sans-semibold text-micro', look.pill)}>Soon</Text>
              </View>
            </View>
          );
        })}
      </View>

      <View className="gap-3 pt-1">
        <Display className="text-heading">Coming to Connect</Display>
        {soon.map((f) => (
          <View key={f.title} className="gap-1 rounded-[20px] bg-paper-sunken px-4 py-3.5">
            <Text className="font-sans-semibold text-body">{f.title}</Text>
            <Text className="text-small text-ink-soft">{f.blurb}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
