import { useCouple, useFeature } from '@us/shared/react';
import { router } from 'expo-router';
import { Settings } from 'lucide-react-native';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CLEAR_CHAT_FAB } from '@/components/chat/chat-fab';
import { FeatureOff } from '@/components/feature-off';
import { GoldenBanner } from '@/components/memory/art';
import { MemoryTimeline } from '@/components/memory/timeline';
import { Initial } from '@/components/plan/bits';
import { IconButton } from '@/components/ui/button';
import { usePalette } from '@/components/ui/palette';
import { Text } from '@/components/ui/text';

/** Golden hour, fairy lights and polaroids; the story card rises over its foot. */
export default function Memory() {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const { width } = useWindowDimensions();
  const { me, partner, mySlot, partnerSlot } = useCouple();
  const on = useFeature('memories');
  const bannerHeight = insets.top + 200;

  return (
    <ScrollView className="bg-[#FFF6F1] dark:bg-paper" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: CLEAR_CHAT_FAB }}>
      <View style={{ height: bannerHeight }}>
        <View style={{ position: 'absolute', top: 0, left: 0 }}>
          <GoldenBanner width={width} height={bannerHeight} />
        </View>
        <View className="flex-row items-start justify-between px-5" style={{ paddingTop: insets.top + 14 }}>
          <View>
            <Text className="font-sans-medium text-body text-white">Our little story</Text>
            <Text className="mt-0.5 font-sans-bold text-[44px] leading-[50px] text-white">Memory</Text>
            <View className="mt-1 h-1 w-14 rounded-full bg-gold-400" />
          </View>
          <IconButton label="Settings" size="sm" tone="raised" onPress={() => router.push('/settings')}>
            <Settings size={19} color={c.inkSoft} />
          </IconButton>
        </View>
        <View className="absolute left-5 flex-row items-center gap-2 self-start rounded-full bg-white/85 py-1.5 pl-1.5 pr-3.5" style={{ top: insets.top + 132 }}>
          <View className="flex-row">
            <Initial slot={mySlot} name={me.display_name} size={26} />
            <View className="-ml-1.5 rounded-full border-2 border-white">
              <Initial slot={partnerSlot} name={partner.display_name} size={24} />
            </View>
          </View>
          <Text className="font-sans-semibold text-small text-plum-600">Shared</Text>
        </View>
      </View>
      <View className="-mt-6 px-4">{on ? <MemoryTimeline /> : <FeatureOff />}</View>
    </ScrollView>
  );
}
