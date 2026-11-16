import { LockKeyhole } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { authenticate, isAwayOnPurpose, lockSettings, useLockSettings } from '@/lib/app-lock';
import { hideInRecents } from '@/modules/us-call';
import { Button } from './ui/button';
import { Display, Text } from './ui/text';

/**
 * Covers the app until the phone's fingerprint, face or PIN says it's you:
 * when Us opens, and when it comes back after the chosen time away. Mounted
 * under the call screen, so a call can still be answered while locked.
 */
export function AppLock() {
  const { on } = useLockSettings();
  const [locked, setLocked] = useState(() => lockSettings().on);
  // Away from Us: covered at once, so nothing shows in the app switcher.
  const [away, setAway] = useState(false);
  const leftAt = useRef<number | null>(null);

  useEffect(() => hideInRecents(on), [on]);

  const unlock = useCallback(async () => {
    if (await authenticate()) setLocked(false);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const settings = lockSettings();
      if (!settings.on) return;
      if (s !== 'active') {
        if (isAwayOnPurpose()) return;
        leftAt.current ??= Date.now();
        setAway(true);
        return;
      }
      setAway(false);
      const since = leftAt.current;
      leftAt.current = null;
      if (since !== null && Date.now() - since >= settings.delay * 1000) setLocked(true);
    });
    return () => sub.remove();
  }, []);

  // Turning the lock off unlocks; turning it on doesn't lock you out there and then.
  useEffect(() => {
    if (!on) setLocked(false);
  }, [on]);

  // Ask as soon as it locks with Us on screen.
  useEffect(() => {
    if (locked && AppState.currentState === 'active') void unlock();
  }, [locked, unlock]);

  if (!on || (!locked && !away)) return null;
  return (
    <View className="absolute inset-0 items-center justify-center gap-5 bg-plum-900 px-10" accessibilityViewIsModal>
      <View className="h-20 w-20 items-center justify-center rounded-full bg-white/10">
        <LockKeyhole size={34} color="#FCFAFB" />
      </View>
      <Display className="text-center text-[28px] leading-[34px] text-paper">Us is locked</Display>
      {locked ? (
        <>
          <Text className="text-center text-body text-plum-200">Unlock with your fingerprint, face or phone PIN.</Text>
          <Button variant="night" onPress={() => void unlock()}>
            Unlock
          </Button>
        </>
      ) : null}
    </View>
  );
}
