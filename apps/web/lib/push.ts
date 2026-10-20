'use client';

import type { PushData } from '@us/shared';
import OneSignal from 'react-onesignal';
import { env } from './env';

let initialised: Promise<boolean> | null = null;

/** Initialise OneSignal web push once and link this browser to the user id. */
export function initPush(userId: string): Promise<boolean> {
  if (!env.oneSignalAppId) return Promise.resolve(false);
  initialised ??= OneSignal.init({
    appId: env.oneSignalAppId,
    serviceWorkerPath: '/OneSignalSDKWorker.js',
    notificationClickHandlerAction: 'focus',
    // Lets you test on http://localhost
    allowLocalhostAsSecureOrigin: true,
  } as Parameters<typeof OneSignal.init>[0])
    .then(() => true)
    .catch((e) => {
      console.warn('[us] OneSignal init failed', e);
      return false;
    });
  return initialised.then(async (ok) => {
    if (ok) await OneSignal.login(userId).catch(() => {});
    return ok;
  });
}

export async function requestPushPermission(): Promise<boolean> {
  if (!env.oneSignalAppId) return false;
  return OneSignal.Notifications.requestPermission();
}

export function pushPermission(): boolean {
  return Boolean(env.oneSignalAppId) && OneSignal.Notifications?.permission === true;
}

export async function logoutPush() {
  if (initialised && (await initialised)) await OneSignal.logout().catch(() => {});
}

/**
 * While the app is open we're already showing messages live, so foreground
 * pushes are suppressed and replaced with our own chime.
 */
export function onPush(handlers: { foreground: (d: PushData) => void; click: (d: PushData) => void }) {
  if (!env.oneSignalAppId) return () => {};
  const fg = (e: { preventDefault(): void; notification: { additionalData?: object } }) => {
    e.preventDefault();
    handlers.foreground(e.notification.additionalData as PushData);
  };
  const click = (e: { notification: { additionalData?: object } }) =>
    handlers.click(e.notification.additionalData as PushData);
  OneSignal.Notifications.addEventListener('foregroundWillDisplay', fg);
  OneSignal.Notifications.addEventListener('click', click);
  return () => {
    OneSignal.Notifications.removeEventListener('foregroundWillDisplay', fg);
    OneSignal.Notifications.removeEventListener('click', click);
  };
}
