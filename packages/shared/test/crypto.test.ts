import { describe, expect, it } from 'vitest';
import {
  ChatCipher,
  fileKeyVersion,
  fromBase64,
  generateChatKey,
  generateDeviceKeys,
  isEncryptedReaction,
  openSealedKey,
  sealKey,
  shortCode,
  toBase64,
  unwrapWithPin,
  utf8Decode,
  utf8Encode,
  wrapWithPin,
} from '../src/crypto';
import { draftMessage, messagePreview, openMessage } from '../src/api/messages';

// Small enough for tests to run quickly; the real parameters are stored with each backup.
const FAST = { N: 2 ** 10, r: 8, p: 1 };

describe('encoding', () => {
  it('round-trips base64 at every padding length, matching Node', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 255);
      const b64 = toBase64(bytes);
      expect(b64).toBe(btoa(String.fromCharCode(...bytes)));
      expect(fromBase64(b64)).toEqual(bytes);
    }
    expect(() => fromBase64('a!bc')).toThrow();
  });

  it('round-trips UTF-8 including emoji and Devanagari, matching TextEncoder', () => {
    for (const s of ['', 'hi', 'नमस्ते', '❤️‍🔥 👨‍👩‍👧', 'é\u0000z']) {
      expect(utf8Encode(s)).toEqual(new TextEncoder().encode(s));
      expect(utf8Decode(utf8Encode(s))).toBe(s);
    }
  });
});

describe('device keys and sealing', () => {
  it('only the recipient device opens a sealed chat key', () => {
    const key = generateChatKey();
    const phone = generateDeviceKeys();
    const laptop = generateDeviceKeys();
    const sealed = sealKey(key, phone.publicKey);
    expect(openSealedKey(sealed, phone)).toEqual(key);
    expect(() => openSealedKey(sealed, laptop)).toThrow();
    const tampered = fromBase64(sealed);
    tampered[70]! ^= 1;
    expect(() => openSealedKey(toBase64(tampered), phone)).toThrow();
  });

  it('a PIN backup opens with the PIN only', async () => {
    const key = generateChatKey();
    const backup = await wrapWithPin(key, 'correct horse', FAST);
    expect(await unwrapWithPin(backup, 'correct horse')).toEqual(key);
    await expect(unwrapWithPin(backup, 'correct house')).rejects.toThrow('wrong_pin');
    await expect(wrapWithPin(key, 'short', FAST)).rejects.toThrow('pin_too_short');
  });

  it('safety codes are stable and order-independent', () => {
    const a = generateDeviceKeys().publicKey;
    const b = generateDeviceKeys().publicKey;
    expect(shortCode(a, b)).toBe(shortCode(b, a));
    expect(shortCode(a)).toMatch(/^\d{4} \d{4}$/);
    expect(shortCode(a)).not.toBe(shortCode(b));
  });
});

describe('ChatCipher', () => {
  const cipher = new ChatCipher(1, generateChatKey());
  const row = { couple_id: 'c1', id: 'm1', sender_id: 'u1' };

  it('round-trips a message and pads its length', () => {
    const ct = cipher.encryptMessage(row, { body: 'नमस्ते ❤️', meta: { width: 10, height: 20 }, mime: 'image/jpeg' });
    expect(cipher.decryptMessage(row, ct)).toEqual({ body: 'नमस्ते ❤️', meta: { width: 10, height: 20 }, mime: 'image/jpeg' });
    expect(fromBase64(cipher.encryptMessage(row, { body: 'a' })).length).toBe(fromBase64(cipher.encryptMessage(row, { body: 'abcdefghij' })).length);
  });

  it('refuses a message moved to another row, sender or key', () => {
    const ct = cipher.encryptMessage(row, { body: 'hi' });
    expect(() => cipher.decryptMessage({ ...row, id: 'm2' }, ct)).toThrow();
    expect(() => cipher.decryptMessage({ ...row, sender_id: 'u2' }, ct)).toThrow();
    expect(() => new ChatCipher(1, generateChatKey()).decryptMessage(row, ct)).toThrow();
  });

  it('reactions are bound to message and person and never look like an emoji', () => {
    const r = cipher.encryptReaction('m1', 'u2', '😂');
    expect(isEncryptedReaction(r)).toBe(true);
    expect(isEncryptedReaction('😂')).toBe(false);
    expect(r.length).toBeLessThanOrEqual(160);
    expect(cipher.decryptReaction('m1', 'u2', r)).toBe('😂');
    expect(() => cipher.decryptReaction('m1', 'u1', r)).toThrow();
  });

  it('files carry a header, the key version and the path they belong at', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const enc = cipher.encryptFile('c1/m1.jpg', png);
    expect(fileKeyVersion(enc)).toBe(1);
    expect(fileKeyVersion(png)).toBe(null);
    expect(cipher.decryptFile('c1/m1.jpg', enc)).toEqual(png);
    expect(() => cipher.decryptFile('c1/m2.jpg', enc)).toThrow();
  });

  it('captions are bound to their photo', () => {
    const ct = cipher.encryptCaption('c1/s1.jpg', 'sunset');
    expect(cipher.decryptCaption('c1/s1.jpg', ct)).toBe('sunset');
    expect(() => cipher.decryptCaption('c1/s2.jpg', ct)).toThrow();
  });

  it('a 4000-character Devanagari message still fits the column', () => {
    const ct = cipher.encryptMessage(row, { body: 'न'.repeat(4000) });
    expect(ct.length).toBeLessThanOrEqual(24000);
  });
});

describe('openMessage', () => {
  const cipher = new ChatCipher(1, generateChatKey());
  const base = { ...draftMessage('c1', 'u1', null), pending: undefined };
  const sealed = {
    ...base,
    ciphertext: cipher.encryptMessage(base, { body: 'secret', meta: { url: 'https://media.giphy.com/x.gif' } }),
    key_version: 1,
    reactions: { u2: cipher.encryptReaction(base.id, 'u2', '❤️'), u1: '😂' },
  };

  it('opens text, media details and reactions', () => {
    const m = openMessage(sealed, cipher);
    expect(m.e2ee).toBe('ok');
    expect(m.body).toBe('secret');
    expect(m.media_meta?.url).toBe('https://media.giphy.com/x.gif');
    expect(m.reactions).toEqual({ u2: '❤️', u1: '😂' });
    expect(messagePreview(m)).toBe('secret');
  });

  it('says locked without a key and failed under the wrong one', () => {
    expect(openMessage(sealed, null).e2ee).toBe('locked');
    expect(messagePreview(openMessage(sealed, null))).toBe('🔒 Encrypted message');
    expect(openMessage(sealed, null).reactions).toEqual({ u1: '😂' });
    expect(openMessage(sealed, new ChatCipher(1, generateChatKey())).e2ee).toBe('failed');
  });

  it('passes plain rows through unchanged', () => {
    const plain = { ...base, body: 'hi' };
    expect(openMessage(plain, cipher)).toBe(plain);
  });
});
