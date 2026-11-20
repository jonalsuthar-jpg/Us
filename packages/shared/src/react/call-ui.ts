import { useSyncExternalStore } from 'react';

/**
 * A call started from somewhere that wants to stay on screen (Our House's
 * Talk button): the call screen starts minimised, as its small bar.
 */
const listeners = new Set<() => void>();

export function minimiseCallScreen() {
  for (const fn of [...listeners]) fn();
}

export function onMinimiseCallScreen(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/**
 * Our House sets how loud my partner's voice is, by how far apart we stand.
 * It goes through the call's own speaker (so echo cancelling still works);
 * 1 is as the call has it.
 */
let voiceVolume = 1;
const voiceListeners = new Set<() => void>();

export function setCallVoiceVolume(v: number) {
  const next = Math.min(1, Math.max(0, v));
  if (voiceVolume === next) return;
  voiceVolume = next;
  for (const fn of [...voiceListeners]) fn();
}

export function useCallVoiceVolume(): number {
  return useSyncExternalStore(
    (fn) => {
      voiceListeners.add(fn);
      return () => void voiceListeners.delete(fn);
    },
    () => voiceVolume,
    () => 1,
  );
}
