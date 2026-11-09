import { readCache, writeCache } from '../react/data-cache';

/**
 * The birthday look: the whole app is decorated on the day itself (balloons,
 * bunting, a welcome for the birthday person, confetti in the chat). Only the
 * couple with a birthday room ever sees it, since the room is what turns it on.
 */

const WISH = /\b(happy\s*(b(irth)?\s*day|bday)|hbd)\b|🎂|🎉|🥳|🎈|🎁/iu;

/** A chat message worth a confetti burst on the day. */
export function isBirthdayWish(text: string | null | undefined): boolean {
  return !!text && WISH.test(text);
}

/** How long until the next midnight on this device's clock (the birthday starts at local midnight). */
export function msToNextLocalMidnight(now = Date.now()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now;
}

// ------------------------------------------------------------ device flags ---
// Small on/off choices kept on this device only: the maker's preview, and
// whether the welcome has been shown. Web keeps them in localStorage; the
// phone in the data cache (AsyncStorage), which sign-out clears.

const listeners = new Set<() => void>();

function local(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function getDeviceFlag(key: string): boolean {
  const ls = local();
  if (ls) {
    try {
      return ls.getItem(`us:${key}`) === '1';
    } catch {
      return false;
    }
  }
  return readCache<boolean>(`flag:${key}`) === true;
}

export function setDeviceFlag(key: string, on: boolean) {
  const ls = local();
  if (ls) {
    try {
      if (on) ls.setItem(`us:${key}`, '1');
      else ls.removeItem(`us:${key}`);
    } catch {
      // Private mode or a full store: it lasts as long as the page does.
    }
  } else {
    writeCache(`flag:${key}`, on);
  }
  listeners.forEach((l) => l());
}

export function onDeviceFlags(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export const birthdayPreviewKey = (roomId: string) => `birthday-preview:${roomId}`;
export const birthdaySplashKey = (roomId: string) => `birthday-splash:${roomId}`;
