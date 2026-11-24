import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimateVideoBytes, isVideoPath, VIDEO_MAX_BYTES, VIDEO_PROFILES, VIDEO_TARGET, videoPlan } from '../src/api/chat-video';
import { likenessUrls } from '../src/api/house';
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
  const size = (p: ReturnType<typeof videoPlan>, secs: number) => (p.action === 'compress' ? ((p.videoBitrate + p.audioBitrate) * secs) / 8 : 0);

  it('keeps a clip that is already efficient', () => {
    // 30 s at about 1.4 Mbps.
    expect(videoPlan(5 * MB, 30_000)).toEqual({ action: 'send' });
    expect(videoPlan(5 * MB, 30_000, 'hd')).toEqual({ action: 'send' });
  });

  it('re-encodes a camera file even when it would fit, like WhatsApp', () => {
    // 20 s straight off the camera: 20 MB, about 8 Mbps.
    expect(videoPlan(20 * MB, 20_000)).toMatchObject({ action: 'compress', videoBitrate: VIDEO_PROFILES.standard.videoBitrate, maxHeight: 720 });
    const hd = videoPlan(20 * MB, 20_000, 'hd');
    expect(hd).toMatchObject({ action: 'compress', videoBitrate: VIDEO_PROFILES.hd.videoBitrate, maxHeight: 1080 });
    expect(size(hd, 20)).toBeLessThan(12 * MB);
  });

  it('scales a 4K clip down even if its bitrate looks fine', () => {
    expect(videoPlan(10 * MB, 30_000, 'hd', 2160)).toMatchObject({ action: 'compress', maxHeight: 1080 });
    expect(videoPlan(10 * MB, 30_000, 'hd', 1080)).toEqual({ action: 'send' });
  });

  it('stays under each limit for a full minute', () => {
    for (const q of ['standard', 'hd', 'memory'] as const) {
      const plan = videoPlan(400 * MB, 60_000, q);
      expect(plan.action).toBe('compress');
      expect(size(plan, 60)).toBeLessThan(VIDEO_PROFILES[q].maxBytes);
    }
    expect(VIDEO_MAX_BYTES).toBe(VIDEO_PROFILES.hd.maxBytes);
  });

  it('keeps memories close to the original', () => {
    expect(videoPlan(80 * MB, 60_000, 'memory')).toMatchObject({ action: 'compress', videoBitrate: VIDEO_PROFILES.memory.videoBitrate, maxHeight: 1080 });
    // An efficient 1080p file (about 9 Mbps) is kept as it is.
    expect(videoPlan(65 * MB, 60_000, 'memory', 1080)).toEqual({ action: 'send' });
  });

  it('drops a step, then refuses, as the clip gets longer', () => {
    expect(videoPlan(200 * MB, 180_000)).toMatchObject({ action: 'compress', maxHeight: 480 });
    expect(videoPlan(500 * MB, 600_000)).toEqual({ action: 'too_large' });
    expect(VIDEO_TARGET.minVideoBitrate).toBeGreaterThan(0);
  });

  it('estimates the size for the chooser', () => {
    expect(estimateVideoBytes(5 * MB, 30_000, 'standard')).toBe(5 * MB);
    expect(estimateVideoBytes(20 * MB, 20_000, 'hd')).toBeLessThan(estimateVideoBytes(20 * MB, 20_000, 'memory')!);
    expect(estimateVideoBytes(500 * MB, 600_000, 'standard')).toBeNull();
  });
});

describe('likenessUrls', () => {
  it('signs each of us in our own private memories, never the public pack', async () => {
    const { sb, asked } = fakeStorage();
    const couple = 'AAAAAAAA-0000-0000-0000-000000000001';
    expect(await likenessUrls(sb, couple, ['jonal', 'parul'])).toEqual({
      jonal: 'aaaaaaaa-0000-0000-0000-000000000001/house/body_jonal_v2.glb#1',
      parul: 'aaaaaaaa-0000-0000-0000-000000000001/house/body_parul_v2.glb#1',
    });
    expect(asked).toEqual([['aaaaaaaa-0000-0000-0000-000000000001/house/body_jonal_v2.glb', 'aaaaaaaa-0000-0000-0000-000000000001/house/body_parul_v2.glb']]);
    expect(await likenessUrls(sb, couple, [])).toEqual({});
  });
});
