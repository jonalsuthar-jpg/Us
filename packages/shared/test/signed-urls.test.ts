import { afterEach, describe, expect, it, vi } from 'vitest';
import { isVideoPath, VIDEO_MAX_BYTES, VIDEO_TARGET, videoPlan } from '../src/api/chat-video';
import { forgetSignedUrl, signedUrls } from '../src/api/signed-urls';
import { clearDataCache } from '../src/react/data-cache';
import type { UsClient } from '../src/supabase';

/** A media function that signs "<path>#<n>" and counts what it was asked for. */
function fakeStorage() {
  let n = 0;
  const asked: string[][] = [];
  const sb = {
    functions: {
      invoke: async (_name: string, { body }: { body: { paths: string[] } }) => {
        asked.push(body.paths);
        n++;
        return { data: { urls: Object.fromEntries(body.paths.map((path) => [path, `${path}#${n}`])) }, error: null };
      },
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
    expect(await signedUrls(sb, 'memories', ['a', 'b'])).toEqual({ a: 'a#1', b: 'b#1' });
    expect(await signedUrls(sb, 'memories', ['a', 'c'])).toEqual({ a: 'a#1', c: 'c#2' });
    expect(asked).toEqual([['a', 'b'], ['c']]);
  });

  it('signs again when a kept link is close to running out', async () => {
    vi.useFakeTimers();
    const { sb } = fakeStorage();
    await signedUrls(sb, 'memories', ['a'], 3600);
    vi.advanceTimersByTime(55 * 60_000);
    expect(await signedUrls(sb, 'memories', ['a'], 3600)).toEqual({ a: 'a#2' });
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
    await signedUrls(sb, 'memories', ['a']);
    forgetSignedUrl('memories', 'a');
    expect(await signedUrls(sb, 'memories', ['a'])).toEqual({ a: 'a#2' });
  });
});

describe('isVideoPath', () => {
  it('only matches encrypted files in a couple’s video folder', () => {
    expect(isVideoPath('c1/video/0b6c2a52-6f1e-4a8e-9a3e-1f2d3c4b5a69.enc')).toBe(true);
    expect(isVideoPath('c1/0b6c2a52.enc')).toBe(false);
    expect(isVideoPath('c1/video/x.mp4')).toBe(false);
    expect(isVideoPath('c1/video/a/b.enc')).toBe(false);
    expect(isVideoPath(null)).toBe(false);
  });
});

describe('videoPlan', () => {
  const MB = 1024 * 1024;
  it('sends what already fits', () => {
    expect(videoPlan(10 * MB, 30_000)).toEqual({ action: 'send' });
  });
  it('compresses a big minute to a bitrate that lands under the limit', () => {
    const plan = videoPlan(80 * MB, 60_000);
    expect(plan.action).toBe('compress');
    if (plan.action !== 'compress') return;
    expect(((plan.videoBitrate + plan.audioBitrate) * 60) / 8).toBeLessThan(VIDEO_MAX_BYTES);
    expect(plan.maxHeight).toBe(720);
  });
  it('caps the bitrate for short clips', () => {
    const plan = videoPlan(40 * MB, 10_000);
    expect(plan).toMatchObject({ action: 'compress', videoBitrate: VIDEO_TARGET.maxVideoBitrate, maxHeight: 720 });
  });
  it('drops to 480p, then refuses, as the clip gets longer', () => {
    expect(videoPlan(200 * MB, 180_000)).toMatchObject({ action: 'compress', maxHeight: 480 });
    expect(videoPlan(500 * MB, 600_000)).toEqual({ action: 'too_large' });
  });
});
