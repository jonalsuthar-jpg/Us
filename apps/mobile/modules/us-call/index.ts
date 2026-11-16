import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

interface UsCallNative {
  startCallService(title: string, video: boolean): void;
  stopCallService(): void;
  cancelIncomingRing(callId: string | null): void;
  setShowWhenLocked(on: boolean): void;
  canRingFullScreen(): boolean;
  openFullScreenSettings(): void;
  clearMessageNotifications(): void;
  audioMode(): number;
  audioChoices(): AudioChoices;
  preferMic(which: 'phone' | 'auto'): boolean;
  bluetoothMedia(on: boolean): string | null;
  resetCallAudio(): void;
  addListener(event: 'onHangupRequested', fn: () => void): EventSubscription;
  addListener(event: 'onCallHandledElsewhere', fn: (e: { callId: string }) => void): EventSubscription;
}

export interface AudioChoices {
  /** Wired or USB earphones with a mic of their own. */
  headsetMic: boolean;
  /** Bluetooth earbuds that can be a call headset (their mic). */
  bluetoothMic: boolean;
  /** Bluetooth earbuds that can play as headphones. */
  bluetoothMedia: boolean;
}

/** Android-only call plumbing (see android/). Absent elsewhere, where every call is a no-op. */
const native = requireOptionalNativeModule<UsCallNative>('UsCall');

function safely<T>(fn: (n: UsCallNative) => T, fallback: T): T {
  if (!native) return fallback;
  try {
    return fn(native);
  } catch (e) {
    console.warn('[us] call native', e);
    return fallback;
  }
}

/** Keep the mic (and camera) working while Us is in the background, with an ongoing notification. */
export const startCallService = (title: string, video: boolean) => safely((n) => n.startCallService(title, video), undefined);
export const stopCallService = () => safely((n) => n.stopCallService(), undefined);
/** The app is showing the call itself: stop the native lock-screen ringing. */
export const cancelIncomingRing = (callId: string | null) => safely((n) => n.cancelIncomingRing(callId), undefined);
/** Show the app over the lock screen while a call is on. */
export const setShowWhenLocked = (on: boolean) => safely((n) => n.setShowWhenLocked(on), undefined);
/** False when Android 14+ has full-screen ringing switched off for Us. */
export const canRingFullScreen = () => safely((n) => n.canRingFullScreen(), true);
export const openFullScreenSettings = () => safely((n) => n.openFullScreenSettings(), undefined);
/** The chat is on screen: clear the gathered "new messages" notification. */
export const clearMessageNotifications = () => safely((n) => n.clearMessageNotifications(), undefined);
/** "Hang up" pressed on the ongoing-call notification (the app may be closed). */
export const onHangupRequested = (fn: () => void) => safely((n) => n.addListener('onHangupRequested', fn), undefined);
/** A ringing call was answered or declined on my other device (Android push). */
export function onCallHandledElsewhere(fn: (callId: string) => void): () => void {
  const sub = safely((n) => n.addListener('onCallHandledElsewhere', (e) => fn(e.callId)), undefined);
  return () => sub?.remove();
}

/** Android's audio mode (3 = MODE_IN_COMMUNICATION); null where unknown. */
export const audioMode = () => safely<number | null>((n) => n.audioMode(), null);
export const audioChoices = () => safely<AudioChoices>((n) => n.audioChoices(), { headsetMic: false, bluetoothMic: false, bluetoothMedia: false });
/** Speak through the phone's own mic even with earphones in, or let Android pick. */
export const preferMic = (which: 'phone' | 'auto') => safely((n) => n.preferMic(which), false);
/** Bluetooth earbuds as headphones (their media mode). Returns where the sound now goes. */
export const bluetoothMedia = (on: boolean) => safely<string | null>((n) => n.bluetoothMedia(on), null);
/** The call is over: back to Android's own choices. */
export const resetCallAudio = () => safely((n) => n.resetCallAudio(), undefined);
