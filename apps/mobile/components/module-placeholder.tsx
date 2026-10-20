import { moduleById, type ModuleId } from '@us/shared';
import { useCouple } from '@us/shared/react';
import { router } from 'expo-router';
import { Settings } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from './ui/button';
import { cn } from './ui/cn';
import { usePalette } from './ui/palette';
import { PrivacyBadge } from './ui/privacy';
import { Sheet } from './ui/sheet';
import { Display, Text } from './ui/text';

const ACCENT: Record<ModuleId, { wash: string; ink: string; sheet: 'rose' | 'teal' | 'plum' | 'gold' | 'sage' }> = {
  talk: { wash: 'bg-rose-100', ink: 'text-rose-700', sheet: 'rose' },
  connect: { wash: 'bg-teal-100', ink: 'text-teal-700', sheet: 'teal' },
  plan: { wash: 'bg-plum-100', ink: 'text-plum-600', sheet: 'plum' },
  memory: { wash: 'bg-gold-100', ink: 'text-gold-700', sheet: 'gold' },
  growth: { wash: 'bg-sage-100', ink: 'text-sage-700', sheet: 'sage' },
};

/** Same placeholder as web: the module's roadmap with every feature's privacy boundary. */
export function ModulePlaceholder({ id }: { id: ModuleId }) {
  const mod = moduleById(id);
  const { partner } = useCouple();
  const insets = useSafeAreaInsets();
  const a = ACCENT[id];
  const c = usePalette();
  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 32 }} contentContainerClassName="px-5">
      <View className={cn('absolute -left-10 -top-6 h-40 w-40 rounded-full opacity-70', a.wash)} />
      <View className="flex-row items-center justify-between">
        <Text className={cn('font-sans-medium text-small', a.ink)}>Coming in phase {mod.phase}</Text>
        <IconButton label="Settings" size="sm" tone="raised" onPress={() => router.push('/settings')}>
          <Settings size={19} color={c.inkSoft} />
        </IconButton>
      </View>
      <Display className="mt-2 text-[40px] leading-[44px]">{mod.title}</Display>
      <Display light italic className="mt-3 text-lead text-ink-soft">
        {mod.tagline}
      </Display>
      <View className="mt-8 gap-4">
        {mod.features.map((f, i) => (
          <Sheet key={f.title} tone={i === 0 ? 'note' : 'inset'} accent={i === 0 ? a.sheet : 'none'}>
            <Display className="text-heading">{f.title}</Display>
            <Text className="mt-2 text-small text-ink-soft">{f.blurb}</Text>
            <PrivacyBadge privacy={f.privacy} partnerName={partner.display_name} className="mt-4" />
          </Sheet>
        ))}
      </View>
    </ScrollView>
  );
}
