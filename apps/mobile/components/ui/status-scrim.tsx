import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from './palette';

/**
 * Paper behind the status bar, so scrolled content passes under it cleanly
 * instead of running into the clock. Place it last in a full-screen view.
 */
export function StatusScrim() {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: c.paper }}
    />
  );
}
