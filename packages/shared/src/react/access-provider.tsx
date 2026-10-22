import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getMyAccess, watchMyAccess, type MyAccess } from '../api/access';
import type { FeatureKey } from '../features';
import type { UsClient } from '../supabase';

const Ctx = createContext<MyAccess | null>(null);

interface Props {
  sb: UsClient;
  userId: string;
  /** What the gate already read, so nothing flickers on the way in. */
  initial: MyAccess;
  /** An admin suspended me (or took my approval back) while the app was open. */
  onBlocked?: (access: MyAccess) => void;
  children: ReactNode;
}

/**
 * Holds what I'm allowed to use, and keeps it current: an admin's change to my
 * features, or a feature switched off for everyone, shows up without a reload.
 * The database enforces all of this; the provider only keeps the UI honest.
 */
export function AccessProvider({ sb, userId, initial, onBlocked, children }: Props) {
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
    const stop = watchMyAccess(sb, userId, reload);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [sb, userId]);

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
