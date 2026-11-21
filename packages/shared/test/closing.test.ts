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

describe('the house store, saving', () => {
  it('drops a flood of changes to one thing, and keeps saving the rest', async () => {
    const { FLOOD_MAX, HouseStore } = await import('../src/house/store');
    const saved: string[] = [];
    const api = { load: async () => [], save: async (k: string) => (saved.push(k), saved.length) };
    const store = new HouseStore(api, () => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 500; i++) store.set('tv', { on: i % 2 === 0 });
    store.set('sofa', { x: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(saved.filter((k) => k === 'tv').length).toBe(FLOOD_MAX);
    expect(saved).toContain('sofa');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('a required update', () => {
  it('applies to apps running an older update (or none), and not to newer ones', async () => {
    const { updateIsRequired } = await import('../src/api/admin');
    const required = new Date('2026-11-22T10:00:00Z');
    expect(updateIsRequired(new Date('2026-11-22T09:00:00Z'), required)).toBe(true);
    expect(updateIsRequired(null, required)).toBe(true);
    expect(updateIsRequired(new Date('2026-11-22T11:00:00Z'), required)).toBe(false);
    expect(updateIsRequired(new Date('2026-11-22T09:00:00Z'), null)).toBe(false);
  });
});
