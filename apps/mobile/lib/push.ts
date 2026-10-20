import type { PushData } from '@us/shared';
import { OneSignal } from 'react-native-onesignal';
import { env } from './env';

let initialised = false;

/** Initialise OneSignal and link this device to the Supabase user id (external_id). */
export function initPush(userId: string) {
  if (!env.oneSignalAppId) return;
  if (!initialised) {
    OneSignal.initialize(env.oneSignalAppId);
    initialised = true;
  }
  OneSignal.login(userId);
}

export function requestPushPermission(): Promise<boolean> {
  if (!env.oneSignalAppId) return Promise.resolve(false);
  return OneSignal.Notifications.requestPermission(true);
}

export function logoutPush() {
  if (initialised) OneSignal.logout();
}

/**
 * Foreground pushes are suppressed — the app is already showing things live
 * and plays its own chime/ring. Taps deep-link via `data.url`.
 */
export function onPush(handlers: { click: (d: PushData) => void }) {
  if (!env.oneSignalAppId) return () => {};
  const fg = (e: { preventDefault(): void }) => e.preventDefault();
  const click = (e: { notification: { additionalData?: object } }) =>
    handlers.click(e.notification.additionalData as PushData);
  OneSignal.Notifications.addEventListener('foregroundWillDisplay', fg as never);
  OneSignal.Notifications.addEventListener('click', click as never);
  return () => {
    OneSignal.Notifications.removeEventListener('foregroundWillDisplay', fg as never);
    OneSignal.Notifications.removeEventListener('click', click as never);
  };
}
