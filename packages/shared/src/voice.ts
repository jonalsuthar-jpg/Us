/**
 * Voice-note waveforms and playback speed. A waveform is drawn from levels
 * taken while recording (mobile: the recorder's metering; web: the decoded
 * clip), kept as a short string of digits 0–9 in the note's encrypted details.
 */

/** Bars in a voice note's waveform. */
export const WAVE_BARS = 40;

/** Playback speeds, in the order the speed button steps through them. */
export const VOICE_SPEEDS = [1, 1.5, 2] as const;
export type VoiceSpeed = (typeof VOICE_SPEEDS)[number];

export function nextSpeed(s: number): VoiceSpeed {
  const i = VOICE_SPEEDS.indexOf(s as VoiceSpeed);
  return VOICE_SPEEDS[(i + 1) % VOICE_SPEEDS.length]!;
}

export const speedLabel = (s: number) => `${s}×`;

/** A metering reading in dBFS (about -60 quiet … 0 loud) as a level from 0 to 1. */
export function dbToLevel(db: number | null | undefined): number {
  if (db == null || !Number.isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db + 55) / 55));
}

/**
 * Many levels (0–1) down to `bars` digits: each bar the loudest of its stretch,
 * scaled so the loudest bar is 9. Silence stays low rather than being stretched up.
 */
export function encodeWaveform(levels: number[], bars = WAVE_BARS): string {
  if (!levels.length) return '';
  const peaks: number[] = [];
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * levels.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / bars));
    let peak = 0;
    for (let j = from; j < to && j < levels.length; j++) peak = Math.max(peak, levels[j]!);
    peaks.push(peak);
  }
  const top = Math.max(...peaks, 0.2);
  return peaks.map((p) => String(Math.min(9, Math.round((p / top) * 9)))).join('');
}

/** Bar heights from 0.15 to 1 for drawing; a gentle made-up shape when the note has none. */
export function waveformBars(wave: unknown, bars = WAVE_BARS): number[] {
  if (typeof wave === 'string' && /^[0-9]+$/.test(wave)) {
    const digits = wave.split('').map(Number);
    return Array.from({ length: bars }, (_, i) => 0.15 + (digits[Math.floor((i * digits.length) / bars)]! / 9) * 0.85);
  }
  return Array.from({ length: bars }, (_, i) => 0.3 + 0.25 * Math.abs(Math.sin(i * 0.9)) + 0.15 * Math.abs(Math.sin(i * 2.3)));
}
