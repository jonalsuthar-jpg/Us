import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

/**
 * App lock with the phone's own screen lock: fingerprint, face, or the
 * phone's PIN / pattern / password as the fallback. Us keeps no PIN of its
 * own. The setting lives on this device only.
 */

/** Seconds away before Us asks again: right away, a minute, five minutes. */
export type LockDelay = 0 | 60 | 300;
export interface LockSettings {
  on: boolean;
  delay: LockDelay;
}

const KEY = 'us.app-lock';
const DEFAULT: LockSettings = { on: false, delay: 60 };

function read(): LockSettings {
  try {
    const raw = SecureStore.getItem(KEY);
    return raw ? { ...DEFAULT, ...(JSON.parse(raw) as Partial<LockSettings>) } : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

let settings = read();
const listeners = new Set<() => void>();

export function lockSettings(): LockSettings {
  return settings;
}

export function setLockSettings(next: Partial<LockSettings>) {
  settings = { ...settings, ...next };
  void SecureStore.setItemAsync(KEY, JSON.stringify(settings)).catch(() => {});
  listeners.forEach((fn) => fn());
}

export function useLockSettings(): LockSettings {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    lockSettings,
    lockSettings,
  );
}

/** Whether this phone can lock Us: it needs a screen lock of its own. */
export async function lockAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

let authenticating = false;
/** Us itself sent the app out (the unlock prompt, a photo picker): not a reason to lock. */
let awayOnPurpose = 0;

export function isAwayOnPurpose(): boolean {
  return authenticating || awayOnPurpose > 0;
}

/** Run something that briefly leaves Us (a picker, the share sheet) without locking it on return. */
export async function withoutLock<T>(fn: () => Promise<T>): Promise<T> {
  awayOnPurpose++;
  try {
    return await fn();
  } finally {
    // AppState reports coming back a moment after the picker resolves.
    setTimeout(() => awayOnPurpose--, 1500);
  }
}

/** Ask the phone: fingerprint, face, or its PIN. */
export async function authenticate(prompt = 'Unlock Us'): Promise<boolean> {
  if (authenticating) return false;
  authenticating = true;
  try {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, disableDeviceFallback: false, cancelLabel: 'Cancel' });
    return res.success;
  } catch {
    return false;
  } finally {
    setTimeout(() => (authenticating = false), 1500);
  }
}
