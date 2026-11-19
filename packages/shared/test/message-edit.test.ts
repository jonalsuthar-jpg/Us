import { describe, expect, it } from 'vitest';
import { ChatCipher, generateChatKey } from '../src/crypto';
import { canEdit, draftMessage, openMessage } from '../src/api/messages';
import type { Message } from '../src/database.types';

const cipher = new ChatCipher(1, generateChatKey());
const row = (over: Partial<Message> = {}): Message => ({ ...draftMessage('c1', 'me', null), pending: false, key_version: 1, ...over });

describe('edited messages', () => {
  it('show as edited only when the sealed text says so too', () => {
    const base = row();
    const edited = row({ id: base.id, edited_at: '2026-11-20T10:00:00Z', ciphertext: cipher.encryptMessage(base, { body: 'new', edited: '2026-11-20T10:00:00Z' }) });
    expect(openMessage(edited, cipher)).toMatchObject({ body: 'new', edited_at: '2026-11-20T10:00:00Z' });
    // The server swaps the old ciphertext back in but keeps the edit time: not shown as an edit.
    const rolledBack = { ...edited, ciphertext: cipher.encryptMessage(base, { body: 'old' }) };
    expect(openMessage(rolledBack, cipher)).toMatchObject({ body: 'old', edited_at: null });
  });

  it('re-opens a message whose ciphertext changed under the same id', () => {
    const base = row();
    const first = { ...base, ciphertext: cipher.encryptMessage(base, { body: 'one' }) };
    expect(openMessage(first, cipher).body).toBe('one');
    const second = { ...base, ciphertext: cipher.encryptMessage(base, { body: 'two', edited: 'x' }) };
    expect(openMessage(second, cipher).body).toBe('two');
  });

  it('can be edited: mine, settled, encrypted text, within a day', () => {
    const now = Date.parse('2026-11-20T12:00:00Z');
    const mine = { ...row({ created_at: '2026-11-20T11:00:00Z' }), body: 'hi', ciphertext: 'x', e2ee: 'ok' as const };
    expect(canEdit(mine, 'me', now)).toBe(true);
    expect(canEdit({ ...mine, sender_id: 'them' }, 'me', now)).toBe(false);
    expect(canEdit({ ...mine, created_at: '2026-11-19T11:00:00Z' }, 'me', now)).toBe(false);
    expect(canEdit({ ...mine, deleted_at: 'x' }, 'me', now)).toBe(false);
    expect(canEdit({ ...mine, ciphertext: null }, 'me', now)).toBe(false);
    expect(canEdit({ ...mine, pending: true }, 'me', now)).toBe(false);
  });
});
