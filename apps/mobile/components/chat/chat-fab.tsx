import { TAB_FEATURES } from '@us/shared';
import { useCouple, useFeatures } from '@us/shared/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { MessageCircleHeart } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '../ui/palette';
import { Text } from '../ui/text';

/** Space a scrolling tab screen leaves at its end, so its last card can clear the button. */
export const CLEAR_CHAT_FAB = 104;
/** Where a floating note sits, above the safe area: tab bar (69) + gap (16) + button (56) + gap (12). */
export const ABOVE_CHAT_FAB = 153;

/** Chat, a thumb away on every tab: bottom right, just above the tab bar. */
export function ChatFab() {
  const has = useFeatures();
  const { unread } = useCouple();
  const c = usePalette();
  const insets = useSafeAreaInsets();
  if (!TAB_FEATURES.talk.some(has)) return null;
  const badge = unread > 0 ? (unread > 99 ? '99+' : String(unread)) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `Open chat, ${badge} unread` : 'Open chat'}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        router.push('/talk');
      }}
      className="absolute right-4 h-14 w-14 items-center justify-center rounded-full active:opacity-80"
      style={{ bottom: insets.bottom + 85, backgroundColor: c.roseStrong, elevation: 6, shadowColor: '#241933', shadowOpacity: 0.32, shadowRadius: 8, shadowOffset: { width: 0, height: 6 } }}
    >
      <MessageCircleHeart size={26} color="#fff" strokeWidth={2} />
      {badge ? (
        // White, because the app's usual rose badge would vanish on a rose button.
        <View className="absolute -right-1 -top-1 min-w-[20px] items-center rounded-full border bg-white px-1" style={{ borderColor: c.roseStrong }}>
          <Text className="font-sans-bold text-[11px] leading-[18px]" style={{ color: c.roseStrong }}>
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
