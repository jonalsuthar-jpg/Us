import { partnerNudges } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { router } from 'expo-router';
import { HeartHandshake } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { GrowthGoals } from '@/components/growth/goals';
import { GrowthLoveLanguages } from '@/components/growth/love-languages';
import { GrowthMood } from '@/components/growth/mood';
import { GrowthWorries } from '@/components/growth/worries';
import { ModuleScreen } from '@/components/module-screen';
import { Button } from '@/components/ui/button';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { Display, Text } from '@/components/ui/text';
import { usePalette } from '@/components/ui/palette';

type Tab = 'goals' | 'mood' | 'worries' | 'love';

export default function Growth() {
  const { sb, partner } = useCouple();
  const c = usePalette();
  const [tab, setTab] = useState<Tab>('goals');
  // Refreshes when my partner asks for a nudge — timestamps only.
  const nudges = useCoupleData('growth:nudges', () => partnerNudges(sb), [sb]);
  const latest = nudges.data?.[0];

  return (
    <ModuleScreen id="growth">
      {latest ? (
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
      <Segmented
        label="Growth section"
        size="sm"
        options={[
          { value: 'goals', label: 'Goals' },
          { value: 'mood', label: 'Check in' },
          { value: 'worries', label: 'Worries' },
          { value: 'love', label: 'Love' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'goals' && <GrowthGoals />}
      {tab === 'mood' && <GrowthMood />}
      {tab === 'worries' && <GrowthWorries />}
      {tab === 'love' && <GrowthLoveLanguages />}
    </ModuleScreen>
  );
}
