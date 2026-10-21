import { requireOptionalNativeModule } from 'expo-modules-core';

interface UsCallNative {
  startCallService(title: string, video: boolean): void;
  stopCallService(): void;
  cancelIncomingRing(callId: string | null): void;
  setShowWhenLocked(on: boolean): void;
  canRingFullScreen(): boolean;
  openFullScreenSettings(): void;
  clearMessageNotifications(): void;
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
