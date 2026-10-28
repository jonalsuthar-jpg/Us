import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '../errors';
import { useCouple } from './couple-provider';
import { cacheKey, readCache, writeCache } from './data-cache';

export interface CoupleData<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /**
   * Run a write, then refetch and ping my partner's open clients so their
   * view refreshes too. Rethrows (with friendly copy) so forms can show it.
   */
  mutate: <R>(write: () => Promise<R>) => Promise<R>;
}

/**
 * Load a slice of the couple's shared data and keep it fresh: refetches on
 * reconnect and whenever my partner writes to the same `topic`.
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

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const next = await loadRef.current();
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

  useEffect(() => {
    // With data already on screen, refresh quietly rather than as a visible load.
    if (!hasData.current) setLoading(true);
    void reload();
    const offChanges = channel.changes.on((e) => {
      if (e.topic === topic && e.from !== me.id) void reload();
    });
    const offStatus = channel.status.on((s) => {
      if (s === 'live') void reload();
    });
    return () => {
      offChanges();
      offStatus();
    };
  }, [channel, me.id, topic, reload]);

  const mutate = useCallback(
    async <R,>(write: () => Promise<R>): Promise<R> => {
      try {
        const result = await write();
        channel.sendChanged(topic);
        await reload();
        return result;
      } catch (e) {
        throw new Error(friendlyError(e));
      }
    },
    [channel, topic, reload],
  );

  return { data, loading, error, reload, mutate };
}
