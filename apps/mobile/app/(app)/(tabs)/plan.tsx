import { useCouple, useFeatures } from '@us/shared/react';
import { ChevronLeft, Settings } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { BackHandler, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CLEAR_CHAT_FAB } from '@/components/chat/chat-fab';
import { FeatureOff } from '@/components/feature-off';
import { ModuleScreen } from '@/components/module-screen';
import { PlanCalendar } from '@/components/plan/calendar';
import { PlanCosts } from '@/components/plan/costs';
import { PlanDecide } from '@/components/plan/decide';
import { SunsetBanner } from '@/components/plan/art';
import { Initial } from '@/components/plan/bits';
import { PlanHub, PLAN_SECTIONS, type PlanOpen, type PlanSection } from '@/components/plan/hub';
import { PlanLabour } from '@/components/plan/labour';
import { PlanLists } from '@/components/plan/lists';
import { usePalette } from '@/components/ui/palette';
import { IconButton } from '@/components/ui/button';
import { Display, Text } from '@/components/ui/text';

export default function Plan() {
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
      <HubScreen>
        <PlanHub sections={sections} onOpen={setOpen} />
      </HubScreen>
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

/** The hub: dusk over the hills, "Plan" in white, the week card rising over its foot. */
function HubScreen({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const { width } = useWindowDimensions();
  const { me, partner, mySlot, partnerSlot } = useCouple();
  const bannerHeight = insets.top + 200;
  return (
    <ScrollView className="bg-[#F6F2FA] dark:bg-paper" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: CLEAR_CHAT_FAB }}>
      <View style={{ height: bannerHeight }}>
        <View style={{ position: 'absolute', top: 0, left: 0 }}>
          <SunsetBanner width={width} height={bannerHeight} />
        </View>
        <View className="flex-row items-start justify-between px-5" style={{ paddingTop: insets.top + 14 }}>
          <View>
            <Text className="font-sans-medium text-body text-white/90">{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
            <Text className="mt-0.5 font-sans-bold text-[44px] leading-[50px] text-white">Plan</Text>
            <View className="mt-1 h-1 w-14 rounded-full bg-rose-500" />
          </View>
          <View className="flex-row items-center gap-2 pt-5">
            <View accessible accessibilityLabel={`Shared with ${partner.display_name}`} className="flex-row items-center gap-2 rounded-full bg-white/85 py-1.5 pl-1.5 pr-3.5">
              <View className="flex-row">
                <Initial slot={mySlot} name={me.display_name} size={28} />
                <View className="-ml-1.5 rounded-full border-2 border-white">
                  <Initial slot={partnerSlot} name={partner.display_name} size={26} />
                </View>
              </View>
              <Text className="font-sans-semibold text-small text-plum-600">Shared</Text>
            </View>
            <IconButton label="Settings" size="sm" tone="raised" onPress={() => router.push('/settings')}>
              <Settings size={19} color={c.inkSoft} />
            </IconButton>
          </View>
        </View>
      </View>
      <View className="-mt-12 px-4">{children}</View>
    </ScrollView>
  );
}
