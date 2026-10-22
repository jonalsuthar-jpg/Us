import { partnerNudges, type FeatureKey } from '@us/shared';
import { useCouple, useCoupleData, useFeatures } from '@us/shared/react';
import { router } from 'expo-router';
import { HeartHandshake } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { GrowthGoals } from '@/components/growth/goals';
import { GrowthLoveLanguages } from '@/components/growth/love-languages';
import { GrowthMood } from '@/components/growth/mood';
import { GrowthWorries } from '@/components/growth/worries';
import { FeatureOff } from '@/components/feature-off';
import { ModuleScreen } from '@/components/module-screen';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { Display, Text } from '@/components/ui/text';
import { usePalette } from '@/components/ui/palette';

type Tab = 'goals' | 'mood' | 'worries' | 'love';

const TABS: { value: Tab; label: string; feature: FeatureKey }[] = [
  { value: 'goals', label: 'Goals', feature: 'goals' },
  { value: 'mood', label: 'Check in', feature: 'mood' },
  { value: 'worries', label: 'Worries', feature: 'worries' },
  { value: 'love', label: 'Love', feature: 'love_languages' },
];

export default function Growth() {
  const { sb, partner } = useCouple();
  const c = usePalette();
  const has = useFeatures();
  const tabs = TABS.filter((t) => has(t.feature));
  const [picked, setTab] = useState<Tab>('goals');
  const tab = tabs.some((t) => t.value === picked) ? picked : tabs[0]?.value;
  // Refreshes when my partner asks for a nudge — timestamps only.
  const nudges = useCoupleData('growth:nudges', () => partnerNudges(sb), [sb]);
  const latest = nudges.data?.[0];

  return (
    <ModuleScreen id="growth">
      {latest && has('mood') ? (
        <Sheet tone="note" accent="sage" className="gap-3">
          <View className="flex-row items-center gap-3">
            <HeartHandshake size={22} color={c.onSage} />
            <Display className="flex-1 text-lead">{partner.display_name} could use a little extra care today.</Display>
          </View>
          <Text className="text-small text-ink-soft">That’s all you’ll see — the rest is theirs.</Text>
          <Button variant="secondary" size="sm" className="self-start" onPress={() => router.push('/talk')}>
            Send them a message
          </Button>
        </Sheet>
      ) : null}
      {!tab && <FeatureOff />}
      {tab && tabs.length > 1 && <Segmented label="Growth section" size="sm" options={tabs} value={tab} onChange={setTab} />}
      {tab === 'goals' && <GrowthGoals />}
      {tab === 'mood' && <GrowthMood />}
      {tab === 'worries' && <GrowthWorries />}
      {tab === 'love' && <GrowthLoveLanguages />}
    </ModuleScreen>
  );
}
