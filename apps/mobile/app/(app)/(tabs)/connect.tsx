import { useFeature } from '@us/shared/react';
import { router } from 'expo-router';
import { HeartHandshake, Settings } from 'lucide-react-native';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CLEAR_CHAT_FAB } from '@/components/chat/chat-fab';
import { AnswersCard, DailyQuestion, useDaily } from '@/components/connect/daily-question';
import { DailyDoodleCard, DrawingsStrip, DrawTiles } from '@/components/draw/connect-draw';
import { FeatureOff } from '@/components/feature-off';
import { IconButton } from '@/components/ui/button';
import { usePalette } from '@/components/ui/palette';
import { Display } from '@/components/ui/text';

// TODO(phase-3): Fight Translator, Future Letters, Inside Jokes. Tables and RLS are ready.
export default function Connect() {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const daily = useDaily();
  const on = useFeature('daily_question');
  const draw = useFeature('draw');

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: CLEAR_CHAT_FAB }}
      contentContainerClassName="gap-5 px-5"
      refreshControl={<RefreshControl refreshing={daily.loading && !!daily.data} onRefresh={() => void daily.reload()} />}
    >
      {/* Same header as Plan and Memory: the section's icon, its name, a line under it. */}
      <View>
        <View className="flex-row items-center gap-3">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-teal-100">
            <HeartHandshake size={21} color={c.onTeal} strokeWidth={2.1} />
          </View>
          <Display className="flex-1 text-[34px] leading-[40px]" numberOfLines={1}>
            Connect
          </Display>
          <IconButton label="Settings" size="sm" tone="raised" onPress={() => router.push('/settings')}>
            <Settings size={19} color={c.inkSoft} />
          </IconButton>
        </View>
        <Display light italic className="mt-2.5 text-lead text-ink-soft">
          Do something together.
        </Display>
      </View>

      {draw ? (
        <>
          <DrawTiles />
          <DrawingsStrip />
          <DailyDoodleCard />
        </>
      ) : null}

      {on ? (
        <View className="gap-3">
          <DailyQuestion daily={daily} />
          <AnswersCard daily={daily} />
        </View>
      ) : draw ? null : (
        <FeatureOff />
      )}
    </ScrollView>
  );
}
