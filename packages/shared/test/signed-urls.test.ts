import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetSignedUrl, signedUrls } from '../src/api/signed-urls';
import { clearDataCache } from '../src/react/data-cache';
import type { UsClient } from '../src/supabase';

/** A Storage client that signs "<path>#<n>" and counts what it was asked for. */
function fakeStorage() {
  let n = 0;
  const asked: string[][] = [];
  const sb = {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          asked.push(paths);
          n++;
          return { data: paths.map((path) => ({ path, signedUrl: `${path}#${n}` })), error: null };
        },
      }),
    },
  } as unknown as UsClient;
  return { sb, asked };
}

afterEach(() => {
  clearDataCache();
  vi.useRealTimers();
});

describe('signedUrls', () => {
  it('reuses a link while it lasts, so the file keeps one URL', async () => {
    const { sb, asked } = fakeStorage();
    expect(await signedUrls(sb, 'b', ['a', 'b'])).toEqual({ a: 'a#1', b: 'b#1' });
    expect(await signedUrls(sb, 'b', ['a', 'c'])).toEqual({ a: 'a#1', c: 'c#2' });
    expect(asked).toEqual([['a', 'b'], ['c']]);
  });

  it('signs again when a kept link is close to running out', async () => {
    vi.useFakeTimers();
    const { sb } = fakeStorage();
    await signedUrls(sb, 'b', ['a'], 3600);
    vi.advanceTimersByTime(55 * 60_000);
    expect(await signedUrls(sb, 'b', ['a'], 3600)).toEqual({ a: 'a#2' });
  });

  it('keeps short links short: one never outlives what it was signed for', async () => {
    vi.useFakeTimers();
    const { sb } = fakeStorage();
    await signedUrls(sb, 'snaps', ['s'], 120);
    expect(await signedUrls(sb, 'snaps', ['s'], 60)).toEqual({ s: 's#1' });
    vi.advanceTimersByTime(90_000);
    expect(await signedUrls(sb, 'snaps', ['s'], 60)).toEqual({ s: 's#2' });
  });

  it('forgets a deleted file', async () => {
    const { sb } = fakeStorage();
    await signedUrls(sb, 'b', ['a']);
    forgetSignedUrl('b', 'a');
    expect(await signedUrls(sb, 'b', ['a'])).toEqual({ a: 'a#2' });
  });
});
