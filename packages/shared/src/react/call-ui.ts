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

/**
 * The minimised call's bubble, put away (it stays away until the call ends
 * or something brings it back, like Our House's Talk button).
 */
let bubbleHidden = false;
const bubbleListeners = new Set<() => void>();

export function setCallBubbleHidden(hidden: boolean) {
  if (bubbleHidden === hidden) return;
  bubbleHidden = hidden;
  for (const fn of [...bubbleListeners]) fn();
}

export function useCallBubbleHidden(): boolean {
  return useSyncExternalStore(
    (fn) => {
      bubbleListeners.add(fn);
      return () => void bubbleListeners.delete(fn);
    },
    () => bubbleHidden,
    () => false,
  );
}

/** Where the bubble was left: which side, and how far down (0 top … 1 bottom). */
export interface BubbleSpot {
  side: 'left' | 'right';
  y: number;
}
export const BUBBLE_KEY = 'us.call.bubble';
export function readBubbleSpot(raw: string | null): BubbleSpot {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<BubbleSpot>) : null;
    if (v && (v.side === 'left' || v.side === 'right') && typeof v.y === 'number' && v.y >= 0 && v.y <= 1) return { side: v.side, y: v.y };
  } catch {
    // A spot we can't read: the default.
  }
  return { side: 'right', y: 0.55 };
}
