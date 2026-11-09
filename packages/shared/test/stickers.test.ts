import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteMessage, draftMessage, isOurStickerPath, keepSticker, sendMessage, stickerMime, stickerPath, stickerTextBox, STICKER_TEXT_STYLES, type UsClient } from '../src';

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
    functions: {
      invoke: async (name: string, { body }: { body: Record<string, unknown> }) => {
        log.push(`${name}:${body.action}:${body.path ?? (body.paths as string[] | undefined)?.join(',') ?? body.messageId}`);
        return { data: { url: 'https://r2.example/put', ok: true }, error: null };
      },
    },
    rpc: async (fn: string) => (log.push(`rpc:${fn}`), { data: { id: 'm1' }, error: null }),
  } as unknown as UsClient;
}

afterEach(() => vi.unstubAllGlobals());

describe('our stickers', () => {
  it('live at the top of our chat folder, and only those count as ours', () => {
    const p = stickerPath('c1', '11111111-1111-4111-8111-111111111111');
    expect(p).toBe('c1/sticker-11111111-1111-4111-8111-111111111111.png');
    expect(isOurStickerPath(p)).toBe(true);
    expect(isOurStickerPath('c1/photo.png')).toBe(false);
    expect(isOurStickerPath(null)).toBe(false);
  });

  it('keyboard stickers keep their own type, so they stay animated', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const gif = stickerPath('c1', id, 'image/gif');
    expect(gif).toBe(`c1/sticker-${id}.gif`);
    expect(isOurStickerPath(gif)).toBe(true);
    expect(stickerMime(gif)).toBe('image/gif');
    expect(stickerMime(stickerPath('c1', id, 'image/webp'))).toBe('image/webp');
    expect(stickerMime(stickerPath('c1', id))).toBe('image/png');
    expect(isOurStickerPath(`c1/sticker-${id}.mp4`)).toBe(false);
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

  it('a new sticker shows at once: its file uploads to the sticker path as it sends', async () => {
    vi.stubGlobal('fetch', async () => new Response(null, { status: 200 }));
    const log: string[] = [];
    const path = stickerPath('c1', undefined, 'image/gif');
    const draft = draftMessage('c1', 'me', null, {
      media: { kind: 'sticker', path, meta: { width: 200, height: 200 }, localUri: 'file:///k.gif', upload: { body: new Uint8Array([1]), contentType: 'image/gif' }, keep: true },
    });
    expect(draft.pending).toBe(true);
    expect(draft.keep).toBe(true);
    await sendMessage(fakeSb(log), draft);
    expect(log).toContain(`media:upload:${path}`);
    const insert = JSON.parse(log.find((l) => l.startsWith('insert:'))!.slice(7));
    expect(insert).toMatchObject({ media_kind: 'sticker', media_path: path });
  });

  it('deleting for everyone removes the file, but never a sticker kept in Ours', async () => {
    const log: string[] = [];
    await deleteMessage(fakeSb(log), { id: 'm1', media_path: 'c1/m1.jpg' }, true);
    expect(log).toEqual(['rpc:delete_message', 'media:remove:c1/m1.jpg']);
    const kept: string[] = [];
    await deleteMessage(fakeSb(kept), { id: 'm2', media_path: stickerPath('c1') }, true);
    expect(kept).toEqual(['rpc:delete_message']);
    const mine: string[] = [];
    await deleteMessage(fakeSb(mine), { id: 'm3', media_path: 'c1/m3.jpg' }, false);
    expect(mine).toEqual(['rpc:delete_message']);
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
