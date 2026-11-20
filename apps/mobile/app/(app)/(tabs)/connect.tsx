import { useFeature } from '@us/shared/react';
import { router } from 'expo-router';
import { Settings } from 'lucide-react-native';
import { RefreshControl, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CLEAR_CHAT_FAB } from '@/components/chat/chat-fab';
import { ConnectCorner } from '@/components/connect/corner';
import { useDaily } from '@/components/connect/daily-question';
import { FeatureOff } from '@/components/feature-off';
import { IconButton } from '@/components/ui/button';
import { usePalette } from '@/components/ui/palette';

// TODO(phase-3): Fight Translator, Future Letters, Inside Jokes. Tables and RLS are ready.
export default function Connect() {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const daily = useDaily();
  const on = useFeature('daily_question');
  const draw = useFeature('draw');
  const quizzes = useFeature('quizzes');
  const house = useFeature('house');

  return (
    <ScrollView
      className="bg-paper"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: CLEAR_CHAT_FAB }}
      contentContainerClassName="px-4"
      refreshControl={<RefreshControl refreshing={daily.loading && !!daily.data} onRefresh={() => void daily.reload()} />}
    >
      {on || draw || quizzes || house ? (
        <ConnectCorner
          daily={daily}
          settings={
            <IconButton label="Settings" size="sm" tone="raised" onPress={() => router.push('/settings')}>
              <Settings size={19} color={c.inkSoft} />
            </IconButton>
          }
        />
      ) : (
        <FeatureOff />
      )}
    </ScrollView>
  );
}
