import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '../errors';
import { useCouple } from './couple-provider';
import { cacheKey, readCache, writeCache } from './data-cache';

/** Loads on their way, by cache key: two screens showing the same slice share one request. */
const inflight = new Map<string, Promise<unknown>>();
/** When each key last loaded, so a screen mounting right after another doesn't load it again. */
const loadedAt = new Map<string, number>();
const FRESH_MS = 10_000;
/** A write that hasn't answered by now isn't going to: the button comes back with a message. */
export const WRITE_TIMEOUT_MS = 20_000;
export const WRITE_TIMEOUT_MESSAGE = 'Couldn’t send. Check your connection and try again.';

/** The write, or a rejection once it's taken too long. */
export function withTimeout<R>(p: Promise<R>, ms = WRITE_TIMEOUT_MS): Promise<R> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new Error(WRITE_TIMEOUT_MESSAGE)), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(t));
}

function shared<T>(key: string, load: () => Promise<T>, join: boolean): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (join && running) return running;
  const p = load().then((v) => {
    loadedAt.set(key, Date.now());
    return v;
  });
  inflight.set(key, p);
  const clear = () => {
    if (inflight.get(key) === p) inflight.delete(key);
  };
  p.then(clear, clear);
  return p;
}

export interface CoupleData<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /**
   * Run a write, then refetch and ping my partner's open clients so their
   * view refreshes too. Rethrows (with friendly copy) so forms can show it.
   * A write that takes longer than WRITE_TIMEOUT_MS (or opts.timeoutMs, for
   * uploads) gives up with a message instead of spinning for ever.
   */
  mutate: <R>(write: () => Promise<R>, opts?: { timeoutMs?: number }) => Promise<R>;
}

/**
 * Load a slice of the couple's shared data and keep it fresh: refetches
 * whenever my partner writes to the same `topic`, and after a reconnect if
 * the topic changed while we were away (see CoupleChannel.resync).
 *
 * Private data uses this too (with a topic nobody else pings), so it still
 * reloads after my own writes.
 *
 * The last answer is kept (see data-cache), so a screen opened again draws
 * at once and refreshes behind it.
 */
export function useCoupleData<T>(
  topic: string,
  load: () => Promise<T>,
  deps: unknown[] = [],
  /** Last-known data (e.g. saved on the device) to show while the first load runs. */
  initial?: T,
  /** 'memory' for data that doesn't survive JSON (Sets, Maps) or goes stale fast. */
  keep: 'persist' | 'memory' = 'persist',
): CoupleData<T> {
  const { channel, me, couple } = useCouple();
  // Plain values in deps (dates, ids) tell one slice from another, e.g. a calendar month.
  const key = cacheKey(couple.id, `${topic}|${deps.filter((d) => ['string', 'number', 'boolean'].includes(typeof d)).join('|')}`);
  const keyRef = useRef(key);
  keyRef.current = key;
  const [data, setData] = useState<T | undefined>(() => initial ?? readCache<T>(key));
  const [loading, setLoading] = useState(data === undefined);
  const hasData = useRef(false);
  hasData.current = data !== undefined;
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const seq = useRef(0);

  // `fresh`: after my own write, never reuse a load that started before it.
  const load_ = useCallback(async (fresh: boolean) => {
    const mine = ++seq.current;
    try {
      const next = await shared(keyRef.current, () => loadRef.current(), !fresh);
      if (mine !== seq.current) return; // a newer load superseded this one
      setData(next);
      writeCache(keyRef.current, next, keep === 'persist');
      setError(null);
    } catch (e) {
      if (mine === seq.current) setError(friendlyError(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, deps);
  const reload = useCallback(() => load_(false), [load_]);

  useEffect(() => {
    // Another screen just loaded this very slice: what's cached is current.
    const recent = hasData.current && Date.now() - (loadedAt.get(keyRef.current) ?? 0) < FRESH_MS;
    if (recent) setLoading(false);
    else {
      // With data already on screen, refresh quietly rather than as a visible load.
      if (!hasData.current) setLoading(true);
      void load_(false);
    }
    const offChanges = channel.changes.on((e) => {
      if (e.topic === topic && e.from !== me.id) void load_(true);
    });
    const offResync = channel.resync.on((r) => {
      if (r === 'all' || r.topics.has(topic)) void load_(true);
    });
    return () => {
      offChanges();
      offResync();
    };
  }, [channel, me.id, topic, load_]);

  const mutate = useCallback(
    async <R,>(write: () => Promise<R>, opts?: { timeoutMs?: number }): Promise<R> => {
      let result: R;
      try {
        result = await withTimeout(write(), opts?.timeoutMs);
      } catch (e) {
        throw new Error(e instanceof Error && e.message === WRITE_TIMEOUT_MESSAGE ? e.message : friendlyError(e));
      }
      channel.sendChanged(topic);
      // It's in: the fresh view follows, without holding the button.
      void load_(true);
      return result;
    },
    [channel, topic, load_],
  );

  return { data, loading, error, reload, mutate };
}
