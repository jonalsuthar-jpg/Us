import { afterEach, describe, expect, it, vi } from 'vitest';
import { HousePresence, type HouseEvent } from '../src/house/presence';
import { WRITE_TIMEOUT_MESSAGE, withTimeout } from '../src/react/use-couple-data';

describe('a write that never answers', () => {
  afterEach(() => vi.useRealTimers());

  it('gives up with a message instead of spinning', async () => {
    vi.useFakeTimers();
    const stuck = withTimeout(new Promise<never>(() => {}), 1000);
    const check = expect(stuck).rejects.toThrow(WRITE_TIMEOUT_MESSAGE);
    await vi.advanceTimersByTimeAsync(1000);
    await check;
  });

  it('passes a quick one through', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7);
  });
});

describe('the house, closed', () => {
  it('says bye once, then sends nothing more', () => {
    const sent: HouseEvent[] = [];
    const p = new HousePresence('a', { send: (e) => sent.push(e), on: () => () => {} });
    p.dispose();
    const n = sent.length;
    expect(sent.at(-1)?.op).toBe('bye');
    p.update({ x: 1, y: 0, z: 1, h: 0, m: 1 });
    p.emote('wave');
    p.sendItem({ k: 'tv', s: { on: true }, v: 2 });
    p.dispose();
    expect(sent.length).toBe(n);
  });
});
