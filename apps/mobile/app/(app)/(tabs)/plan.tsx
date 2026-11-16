import { useCouple, useFeatures } from '@us/shared/react';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CLEAR_CHAT_FAB } from '@/components/chat/chat-fab';
import { FeatureOff } from '@/components/feature-off';
import { ModuleScreen } from '@/components/module-screen';
import { PlanCalendar } from '@/components/plan/calendar';
import { PlanCosts } from '@/components/plan/costs';
import { PlanDecide } from '@/components/plan/decide';
import { PlanHub, PLAN_SECTIONS, type PlanOpen, type PlanSection } from '@/components/plan/hub';
import { PlanLabour } from '@/components/plan/labour';
import { PlanLists } from '@/components/plan/lists';
import { usePalette } from '@/components/ui/palette';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Display, Text } from '@/components/ui/text';

export default function Plan() {
  const { partner } = useCouple();
  const has = useFeatures();
  const sections = (Object.keys(PLAN_SECTIONS) as PlanSection[]).filter((s) => has(PLAN_SECTIONS[s].feature));
  const [open, setOpen] = useState<PlanOpen | null>(null);
  const current = open && sections.includes(open.section) ? open : sections.length === 1 ? { section: sections[0]! } : null;
  const canGoBack = !!current && sections.length > 1;

  // Android back closes the section before it leaves the tab.
  useEffect(() => {
    if (!canGoBack) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => (setOpen(null), true));
    return () => sub.remove();
  }, [canGoBack]);

  if (!sections.length)
    return (
      <ModuleScreen id="plan">
        <FeatureOff />
      </ModuleScreen>
    );

  if (!current)
    return (
      <ModuleScreen id="plan" aside={<PrivacyBadge privacy="shared" partnerName={partner.display_name} />}>
        <PlanHub sections={sections} onOpen={setOpen} />
      </ModuleScreen>
    );

  const go = (next: PlanOpen) => setOpen(next);
  const props = { adding: current.adding, onAdded: () => setOpen({ section: current.section }) };
  return (
    <SectionScreen key={current.section} title={PLAN_SECTIONS[current.section].title} onBack={canGoBack ? () => setOpen(null) : undefined}>
      {current.section === 'calendar' && <PlanCalendar {...props} />}
      {current.section === 'lists' && <PlanLists onPick={sections.includes('decide') ? (category) => go({ section: 'decide', category }) : undefined} />}
      {current.section === 'decide' && <PlanDecide initialCategory={current.category} />}
      {current.section === 'labour' && <PlanLabour {...props} />}
      {current.section === 'costs' && <PlanCosts {...props} />}
    </SectionScreen>
  );
}

function SectionScreen({ title, onBack, children }: { title: string; onBack?: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: CLEAR_CHAT_FAB }}
      contentContainerClassName="gap-5 px-5"
    >
      <View>
        {onBack ? (
          <Pressable accessibilityRole="button" onPress={onBack} hitSlop={8} className="-ml-2 h-11 flex-row items-center self-start px-1">
            <ChevronLeft size={22} color={c.inkSoft} />
            <Text className="font-sans-medium text-ink-soft">Plan</Text>
          </Pressable>
        ) : (
          <View className="h-3" />
        )}
        <Display className="text-[30px] leading-[36px]">{title}</Display>
      </View>
      {children}
    </ScrollView>
  );
}
