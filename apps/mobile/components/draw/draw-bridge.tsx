import { useCouple, useDrawGame, useDrawHub, useFeature } from '@us/shared/react';
import { router, usePathname } from 'expo-router';
import { MessageCircleQuestion } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ABOVE_CHAT_FAB } from '../chat/chat-fab';
import { Text } from '../ui/text';

/**
 * Keeps the drawing hub listening from the moment the app opens (so the live
 * canvas and game invites are there when either of us looks), and shows a
 * "wants to play Draw & Guess" note over any screen.
 */
export function DrawBridge() {
  const on = useFeature('draw');
  return on ? <Bridge /> : null;
}

/** Web links in notifications (/connect/draw…) to the app's screens (/draw…). */
export const drawRoute = (url: string) => url.replace(/^\/connect\/draw/, '/draw');

function Bridge() {
  useDrawHub();
  const game = useDrawGame();
  const { me, partner } = useCouple();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const s = game.state;
  const invited = s?.phase === 'invited' && s.players[0] !== me.id && !s.joined.includes(me.id);
  if (!invited || path.startsWith('/draw/guess')) return null;
  return (
    <View
      accessibilityRole="alert"
      className="absolute inset-x-3 flex-row items-center gap-3 rounded-[20px] bg-plum-800 p-3 pl-3.5"
      style={{ bottom: insets.bottom + ABOVE_CHAT_FAB, elevation: 12, shadowColor: '#170F21', shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: 12 } }}
    >
      <View className="h-10 w-10 items-center justify-center rounded-[14px] bg-gold-400">
        <MessageCircleQuestion size={20} color="#352203" />
      </View>
      <Text className="flex-1 text-body text-paper">{`${partner.display_name} wants to play Draw & Guess`}</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/draw/guess')} className="h-10 justify-center rounded-xl bg-gold-400 px-4">
        <Text className="font-sans-semibold text-body text-gold-900">Play</Text>
      </Pressable>
    </View>
  );
}
