import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getMyAccess, watchMyAccess, type MyAccess } from '../api/access';
import type { FeatureKey } from '../features';
import type { UsClient } from '../supabase';
import { isForeground, onForegroundChange } from './use-foreground-tick';

/** Same as the couple channel: a short trip to another app keeps the watch. */
const SLEEP_AFTER_MS = 30_000;

const Ctx = createContext<MyAccess | null>(null);

interface Props {
  sb: UsClient;
  userId: string;
  /** What the gate already read, so nothing flickers on the way in. */
  initial: MyAccess;
  /** An admin suspended me (or took my approval back) while the app was open. */
  onBlocked?: (access: MyAccess) => void;
  /**
   * Phones: stop watching a while after the app goes to the background, so
   * this channel doesn't keep the realtime socket (and the radio) awake once
   * the couple channel has slept, and read my access again on return.
   */
  sleepInBackground?: boolean;
  children: ReactNode;
}

/**
 * Holds what I'm allowed to use, and keeps it current: an admin's change to my
 * features, or a feature switched off for everyone, shows up without a reload.
 * The database enforces all of this; the provider only keeps the UI honest.
 */
export function AccessProvider({ sb, userId, initial, onBlocked, sleepInBackground, children }: Props) {
  const [access, setAccess] = useState(initial);
  const blocked = useRef(onBlocked);
  blocked.current = onBlocked;

  useEffect(() => setAccess(initial), [initial]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reload = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        getMyAccess(sb).then(
          (next) => {
            setAccess(next);
            if (next.status !== 'approved') blocked.current?.(next);
          },
          () => {},
        );
      }, 300);
    };
    let stop: (() => void) | null = watchMyAccess(sb, userId, reload);
    if (!sleepInBackground) {
      return () => {
        clearTimeout(timer);
        stop?.();
      };
    }
    let sleepTimer: ReturnType<typeof setTimeout> | undefined;
    const onChange = (active: boolean) => {
      clearTimeout(sleepTimer);
      if (active) {
        if (stop) return;
        stop = watchMyAccess(sb, userId, reload);
        reload(); // whatever changed while we weren't watching
      } else if (stop) {
        sleepTimer = setTimeout(() => {
          stop?.();
          stop = null;
        }, SLEEP_AFTER_MS);
      }
    };
    if (!isForeground()) onChange(false);
    const off = onForegroundChange(onChange);
    return () => {
      off();
      clearTimeout(timer);
      clearTimeout(sleepTimer);
      stop?.();
    };
  }, [sb, userId, sleepInBackground]);

  return <Ctx.Provider value={access}>{children}</Ctx.Provider>;
}

export function useAccess(): MyAccess | null {
  return useContext(Ctx);
}

/**
 * Can we use this feature right now? Outside an AccessProvider everything is
 * shown, and the database still has the last word.
 */
export function useFeature(key: FeatureKey): boolean {
  const access = useContext(Ctx);
  return access ? access.features.includes(key) : true;
}

/** A checker for several features at once: `const has = useFeatures(); has('chat')`. */
export function useFeatures(): (key: FeatureKey) => boolean {
  const access = useContext(Ctx);
  return (key) => (access ? access.features.includes(key) : true);
}

/** The message to show while a feature is paused for everyone, or null. */
export function usePausedMessage(key: FeatureKey): string | null {
  const access = useContext(Ctx);
  const msg = access?.paused[key];
  return msg === undefined ? null : msg || 'This is taking a short break. Back soon.';
}
