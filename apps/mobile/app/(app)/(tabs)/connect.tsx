import { moduleById } from '@us/shared';
import { useCouple, useFeature } from '@us/shared/react';
import { View } from 'react-native';
import { DailyQuestion, useDaily } from '@/components/connect/daily-question';
import { FeatureOff } from '@/components/feature-off';
import { ModuleScreen, SectionTitle } from '@/components/module-screen';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Sheet } from '@/components/ui/sheet';
import { Display, Text } from '@/components/ui/text';

// TODO(phase-3): Fight Translator, Future Letters, Inside Jokes. Tables and RLS are ready.
export default function Connect() {
  const { partner } = useCouple();
  const daily = useDaily();
  const soon = moduleById('connect').features.filter((f) => f.soon);
  const on = useFeature('daily_question');

  return (
    <ModuleScreen id="connect" refreshing={daily.loading && !!daily.data} onRefresh={() => void daily.reload()}>
      {on ? <DailyQuestion daily={daily} /> : <FeatureOff />}
      <View className="gap-3">
        <SectionTitle>Coming to Connect</SectionTitle>
        {soon.map((f) => (
          <Sheet key={f.title} tone="inset" pad="sm">
            <Display className="text-lead">{f.title}</Display>
            <Text className="mt-1 text-small text-ink-soft">{f.blurb}</Text>
            <PrivacyBadge privacy={f.privacy} partnerName={partner.display_name} className="mt-3" />
          </Sheet>
        ))}
      </View>
    </ModuleScreen>
  );
}
