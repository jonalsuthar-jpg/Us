import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { authenticate, lockAvailable, setLockSettings, useLockSettings, type LockDelay } from '@/lib/app-lock';
import { Button } from './ui/button';
import { Segmented } from './ui/segmented';
import { Display, Text } from './ui/text';

const DELAYS: { value: `${LockDelay}`; label: string }[] = [
  { value: '0', label: 'Right away' },
  { value: '60', label: 'After 1 min' },
  { value: '300', label: 'After 5 min' },
];

/** Settings: lock Us with the phone's fingerprint, face or PIN. */
export function AppLockSettings() {
  const { on, delay } = useLockSettings();
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    void lockAvailable().then(setAvailable);
  }, []);

  return (
    <View className="gap-3">
      <Display className="text-heading">App lock</Display>
      <Text className="text-small text-ink-soft">
        Ask for your fingerprint, face or phone PIN to open Us. Calls can still be answered while it’s locked.
      </Text>
      {available === false ? (
        <Text className="text-small text-ink-muted">Set a screen lock on your phone first (Settings › Security), then come back here.</Text>
      ) : (
        <Button
          variant={on ? 'secondary' : 'primary'}
          className="self-start"
          disabled={available === null}
          onPress={async () => {
            // Proving it's you, both to turn it on and to turn it off.
            if (await authenticate(on ? 'Turn off app lock' : 'Turn on app lock')) setLockSettings({ on: !on });
          }}
        >
          {on ? 'Turn off app lock' : 'Turn on app lock'}
        </Button>
      )}
      {on ? (
        <>
          <Segmented label="Lock after" options={DELAYS} value={`${delay}`} onChange={(v) => setLockSettings({ delay: Number(v) as LockDelay })} />
          <Text className="text-small text-ink-muted">How long Us can be in the background before it asks again. Saved on this phone.</Text>
        </>
      ) : null}
    </View>
  );
}
