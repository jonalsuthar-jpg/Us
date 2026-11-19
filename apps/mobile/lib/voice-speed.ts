import AsyncStorage from '@react-native-async-storage/async-storage';
import { nextSpeed, type VoiceSpeed } from '@us/shared';
import { useSyncExternalStore } from 'react';

/** How fast voice notes play, the same for every note and remembered on this phone. */
const KEY = 'us:voice-speed';
let speed: VoiceSpeed = 1;
const listeners = new Set<() => void>();

void AsyncStorage.getItem(KEY)
  .then((v) => {
    const n = Number(v);
    if (n === 1.5 || n === 2) {
      speed = n;
      listeners.forEach((fn) => fn());
    }
  })
  .catch(() => {});

export function useVoiceSpeed(): [VoiceSpeed, () => void] {
  const value = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => speed,
  );
  const step = () => {
    speed = nextSpeed(speed);
    listeners.forEach((fn) => fn());
    void AsyncStorage.setItem(KEY, String(speed)).catch(() => {});
  };
  return [value, step];
}
