import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TYPING_EXPIRE_MS, TYPING_HEARTBEAT_MS, TYPING_IDLE_MS, TypingReceiver, TypingSender } from '../src/realtime/typing';

describe('TypingSender', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends true once, heartbeats while typing, and false after idle', () => {
    const sent: boolean[] = [];
    const s = new TypingSender((t) => sent.push(t), () => Date.now());

    s.input('h');
    s.input('he');
    expect(sent).toEqual([true]);

    vi.advanceTimersByTime(TYPING_HEARTBEAT_MS);
    s.input('hel');
    expect(sent).toEqual([true, true]);

    vi.advanceTimersByTime(TYPING_IDLE_MS);
    expect(sent).toEqual([true, true, false]);
  });

  it('stops immediately when the composer is cleared', () => {
    const sent: boolean[] = [];
    const s = new TypingSender((t) => sent.push(t));
    s.input('hi');
    s.input('');
    expect(sent).toEqual([true, false]);
    s.stop();
    expect(sent).toEqual([true, false]);
  });
});

describe('TypingReceiver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('expires on its own if the stop event is lost', () => {
    const states: boolean[] = [];
    const r = new TypingReceiver((t) => states.push(t));
    r.receive(true);
    r.receive(true);
    expect(states).toEqual([true]);
    vi.advanceTimersByTime(TYPING_EXPIRE_MS);
    expect(states).toEqual([true, false]);
  });

  it('clears when a message arrives', () => {
    const states: boolean[] = [];
    const r = new TypingReceiver((t) => states.push(t));
    r.receive(true);
    r.clear();
    expect(states).toEqual([true, false]);
  });
});
