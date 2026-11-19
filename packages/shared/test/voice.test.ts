import { describe, expect, it } from 'vitest';
import { dbToLevel, encodeWaveform, nextSpeed, waveformBars } from '../src/voice';

describe('voice notes', () => {
  it('shrink many levels into digit bars, loudest at 9', () => {
    const levels = Array.from({ length: 400 }, (_, i) => (i < 200 ? 0.1 : 0.8));
    const w = encodeWaveform(levels, 10);
    expect(w).toHaveLength(10);
    expect(w.slice(0, 5)).toBe('11111');
    expect(w.slice(5)).toBe('99999');
    expect(encodeWaveform([])).toBe('');
  });

  it('keep a quiet clip quiet', () => {
    expect(encodeWaveform(Array(50).fill(0.02), 5)).toBe('11111');
  });

  it('read metering and step through speeds', () => {
    expect(dbToLevel(0)).toBe(1);
    expect(dbToLevel(-160)).toBe(0);
    expect(dbToLevel(undefined)).toBe(0);
    expect([nextSpeed(1), nextSpeed(1.5), nextSpeed(2), nextSpeed(3)]).toEqual([1.5, 2, 1, 1]);
  });

  it('draw bars from a waveform, or a placeholder without one', () => {
    const bars = waveformBars('09', 4);
    expect(bars[0]).toBeCloseTo(0.15);
    expect(bars[3]).toBeCloseTo(1);
    expect(waveformBars(undefined, 8)).toHaveLength(8);
    expect(waveformBars('<script>', 8).every((b) => b > 0 && b <= 1)).toBe(true);
  });
});
