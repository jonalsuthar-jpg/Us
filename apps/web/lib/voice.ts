'use client';

import { encodeWaveform, nextSpeed, type VoiceSpeed } from '@us/shared';
import { useSyncExternalStore } from 'react';

/** A recorded clip's waveform (see encodeWaveform), or '' if this browser can't decode it. */
export async function waveformOf(blob: Blob): Promise<string> {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return '';
    const ctx = new Ctx();
    try {
      const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
      const data = audio.getChannelData(0);
      // Loudness (RMS) of a few hundred short stretches.
      const steps = 400;
      const size = Math.max(1, Math.floor(data.length / steps));
      const levels: number[] = [];
      for (let i = 0; i < data.length; i += size) {
        let sum = 0;
        const end = Math.min(data.length, i + size);
        for (let j = i; j < end; j++) sum += data[j]! * data[j]!;
        levels.push(Math.sqrt(sum / (end - i)));
      }
      return encodeWaveform(levels);
    } finally {
      void ctx.close();
    }
  } catch {
    return '';
  }
}

/** How fast voice notes play, the same for every note and remembered in this browser. */
const KEY = 'us:voice-speed';
const listeners = new Set<() => void>();
function read(): VoiceSpeed {
  try {
    const n = Number(localStorage.getItem(KEY));
    return n === 1.5 || n === 2 ? n : 1;
  } catch {
    return 1;
  }
}
let speed: VoiceSpeed | null = null;

export function useVoiceSpeed(): [VoiceSpeed, () => void] {
  const value = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => (speed ??= read()),
    () => 1 as VoiceSpeed,
  );
  const step = () => {
    speed = nextSpeed(value);
    try {
      localStorage.setItem(KEY, String(speed));
    } catch {
      // per-session only
    }
    listeners.forEach((fn) => fn());
  };
  return [value, step];
}
