import * as Updates from 'expo-updates';
import { RefreshCw } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './ui/text';

/** Look for a new version when the app comes back to the foreground (at most every 10 minutes). */
function useUpdateChecks() {
  useEffect(() => {
    if (!Updates.isEnabled) return;
    let last = 0;
    const check = async () => {
      if (Date.now() - last < 10 * 60_000) return;
      last = Date.now();
      try {
        const { isAvailable } = await Updates.checkForUpdateAsync();
        if (isAvailable) await Updates.fetchUpdateAsync();
      } catch {
        // Offline or the update server is unreachable: try again next time.
      }
    };
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void check());
    return () => sub.remove();
  }, []);
}

/**
 * Once a new version has downloaded in the background, offer a one-tap
 * restart. Nothing interrupts what you're doing; ignoring it is fine too —
 * the update applies on the next cold start.
 */
export function UpdateBanner() {
  useUpdateChecks();
  const { isUpdatePending } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const insets = useSafeAreaInsets();
  if (!Updates.isEnabled || !isUpdatePending || dismissed) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(320)}
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 72 }}
    >
      <View className="flex-row items-center gap-3 rounded-full bg-plum-800 py-2 pl-4 pr-2" style={{ elevation: 10 }}>
        <RefreshCw size={18} color="#FFD98A" />
        <Text className="flex-1 text-small text-paper">A new version of Us is ready.</Text>
        <Pressable accessibilityRole="button" onPress={() => setDismissed(true)} className="px-2 py-2">
          <Text className="text-small text-plum-200">Later</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void Updates.reloadAsync()}
          className="rounded-full bg-rose-600 px-4 py-2 active:bg-rose-700"
        >
          <Text className="font-sans-semibold text-small text-white">Restart</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
