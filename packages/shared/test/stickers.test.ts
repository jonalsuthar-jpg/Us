import { describe, expect, it } from 'vitest';
import { draftMessage, isOurStickerPath, keepSticker, sendMessage, stickerPath, stickerTextBox, STICKER_TEXT_STYLES, type UsClient } from '../src';

function fakeSb(log: string[], insertError: unknown = null): UsClient {
  const chain = {
    insert: (row: unknown) => (log.push(`insert:${JSON.stringify(row)}`), chain),
    select: () => chain,
    single: async () => ({ data: { id: 'm1' }, error: insertError }),
    then: (resolve: (v: unknown) => void) => resolve({ data: null, error: insertError }),
  };
  return {
    from: (t: string) => (log.push(`from:${t}`), chain),
    storage: { from: () => ({ upload: async () => (log.push('upload'), { error: null }) }) },
  } as unknown as UsClient;
}

describe('our stickers', () => {
  it('live at the top of our chat folder, and only those count as ours', () => {
    const p = stickerPath('c1', '11111111-1111-4111-8111-111111111111');
    expect(p).toBe('c1/sticker-11111111-1111-4111-8111-111111111111.png');
    expect(isOurStickerPath(p)).toBe(true);
    expect(isOurStickerPath('c1/photo.png')).toBe(false);
    expect(isOurStickerPath(null)).toBe(false);
  });

  it('sending one points the message at the saved file; nothing is uploaded', async () => {
    const log: string[] = [];
    const path = stickerPath('c1');
    const draft = draftMessage('c1', 'me', null, { media: { kind: 'sticker', path, meta: { width: 512, height: 512 } } });
    expect(draft.media_path).toBe(path);
    await sendMessage(fakeSb(log), draft);
    expect(log).not.toContain('upload');
    const insert = JSON.parse(log.find((l) => l.startsWith('insert:'))!.slice(7));
    expect(insert).toMatchObject({ media_kind: 'sticker', media_path: path, body: null });
  });

  it('keeping a sticker that is already in Ours is fine', async () => {
    await expect(keepSticker(fakeSb([], { code: '23505' }), 'c1', 'me', stickerPath('c1'))).resolves.toBeUndefined();
    await expect(keepSticker(fakeSb([], { code: '42501', message: 'no' }), 'c1', 'me', stickerPath('c1'))).rejects.toBeTruthy();
  });

  it('text looks and boxes', () => {
    expect(STICKER_TEXT_STYLES.map((s) => s.id)).toEqual(['outline', 'pop', 'bubble', 'rose']);
    const short = stickerTextBox({ text: 'hi', size: 0.13 });
    const long = stickerTextBox({ text: 'good morning', size: 0.13 });
    expect(long.w).toBeGreaterThan(short.w);
    expect(short.h).toBeCloseTo(0.13 * 1.45);
  });
});
