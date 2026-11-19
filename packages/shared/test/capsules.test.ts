import { describe, expect, it } from 'vitest';
import { capsuleDatePicks, capsuleMoment, capsuleProblem, capsuleText, type Capsule } from '../src/api/capsules';
import { ChatCipher, generateChatKey } from '../src/crypto';
import { openMessage, draftMessage } from '../src/api/messages';

describe('time capsules', () => {
  const now = new Date(2026, 10, 21, 12, 0); // 21 Nov 2026, local noon

  it('turn a date and a time into one moment, and refuse what is too soon or too far', () => {
    const at = capsuleMoment('2027-02-14', '21:00')!;
    expect([at.getFullYear(), at.getMonth(), at.getDate(), at.getHours(), at.getMinutes()]).toEqual([2027, 1, 14, 21, 0]);
    expect(capsuleMoment('2027-02-14', 'soon')).toBeNull();
    expect(capsuleProblem(null, now)).toMatch(/date and a time/);
    expect(capsuleProblem(new Date(now.getTime() + 5 * 60_000), now)).toMatch(/10 minutes/);
    expect(capsuleProblem(new Date(2037, 0, 1), now)).toMatch(/10 years/);
    expect(capsuleProblem(at, now)).toBeNull();
  });

  it('offer our anniversary and their next birthday among the quick dates', () => {
    const picks = capsuleDatePicks(
      [
        { title: 'Our anniversary', on_date: '2024-02-14', yearly: true },
        { title: 'Alex’s birthday', on_date: '1996-11-21', yearly: true },
        { title: 'Trip', on_date: '2027-01-01', yearly: false },
      ],
      'Alex',
      now,
    );
    expect(picks.map((p) => p.label)).toEqual(['In a month', 'In a year', 'Our anniversary', 'Alex’s birthday']);
    expect(picks[2]!.date).toBe('2027-02-14');
    // Their birthday is today: next year's, so it's still a surprise.
    expect(picks[3]!.date).toBe('2027-11-21');
  });

  it('open in the chat exactly as written, marked as a capsule', () => {
    const cipher = new ChatCipher(1, generateChatKey());
    const id = 'cap-1';
    const ciphertext = cipher.encryptMessage({ couple_id: 'c', id, sender_id: 'me' }, { body: 'Happy anniversary, future us', capsule: '2026-11-21T06:30:00Z' });
    const c: Capsule = { id, couple_id: 'c', sender_id: 'me', ciphertext, key_version: 1, deliver_at: '2027-02-14T15:30:00Z', created_at: '2026-11-21T06:30:00Z', delivered_at: null };
    expect(capsuleText(c, cipher)).toBe('Happy anniversary, future us');
    const row = { ...draftMessage('c', 'me', null), id, pending: false, ciphertext, key_version: 1, capsule_sealed_at: c.created_at };
    expect(openMessage(row, cipher)).toMatchObject({ body: 'Happy anniversary, future us', e2ee: 'ok', capsule_sealed_at: c.created_at });
    expect(capsuleText(c, new ChatCipher(1, generateChatKey()))).toBeNull();
  });
});
