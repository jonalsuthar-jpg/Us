#!/usr/bin/env node
/**
 * Synthesises the app's own sounds so they're reproducible and license-free.
 *
 *   us_chime.wav  notification chime: a soft, felt-hammer bell — E5 then B5,
 *                 rising a fifth, warm partials, no sharp transient. ~1.4 s.
 *   us_ring.wav   incoming-call ring: E5 · G♯5 · B5 arpeggio that breathes,
 *                 followed by silence so it loops gently. 3 s.
 *
 * Output: 44.1 kHz / 16-bit / mono WAV (what OneSignal requires for iOS
 * bundles and Android res/raw). Writes to packages/shared/assets/sounds and
 * copies into each app.
 *
 *   npm run sounds
 */
import { mkdirSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 44100;

/** A bell-ish voice: a few partials, each decaying at its own rate. */
function bell(buffer, startSec, freq, { gain = 1, decay = 0.55, attack = 0.012 } = {}) {
  // [ratio, amplitude, decay multiplier] — mostly harmonic for warmth, one
  // slightly inharmonic partial gives the "bell" without the clang.
  const partials = [
    [1, 1, 1],
    [2, 0.32, 0.6],
    [2.76, 0.08, 0.4],
    [3, 0.1, 0.35],
    [0.5, 0.12, 1.4], // sub-octave body
  ];
  const start = Math.floor(startSec * RATE);
  const length = Math.floor((decay * 7) * RATE);
  for (let i = 0; i < length && start + i < buffer.length; i++) {
    const t = i / RATE;
    // Raised-cosine attack avoids a click; exponential decay after.
    const a = t < attack ? 0.5 - 0.5 * Math.cos((Math.PI * t) / attack) : 1;
    let s = 0;
    for (const [ratio, amp, d] of partials) {
      s += amp * Math.exp(-t / (decay * d)) * Math.sin(2 * Math.PI * freq * ratio * t);
    }
    buffer[start + i] += gain * a * s;
  }
}

function normalise(buffer, peakDb) {
  let peak = 0;
  for (const v of buffer) peak = Math.max(peak, Math.abs(v));
  const target = 10 ** (peakDb / 20);
  const k = peak ? target / peak : 1;
  for (let i = 0; i < buffer.length; i++) buffer[i] *= k;
  // Fade the last 30 ms so loops and truncation never click.
  const fade = Math.floor(0.03 * RATE);
  for (let i = 0; i < fade; i++) buffer[buffer.length - 1 - i] *= i / fade;
}

function wav(buffer) {
  const data = Buffer.alloc(buffer.length * 2);
  for (let i = 0; i < buffer.length; i++) {
    const v = Math.max(-1, Math.min(1, buffer[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const E5 = 659.25;
const Gs5 = 830.61;
const B5 = 987.77;

function chime() {
  const b = new Float64Array(Math.floor(1.45 * RATE));
  bell(b, 0, E5, { gain: 0.9, decay: 0.42 });
  bell(b, 0.13, B5, { gain: 0.75, decay: 0.5 });
  normalise(b, -4);
  return b;
}

function ring() {
  const b = new Float64Array(Math.floor(3 * RATE));
  bell(b, 0.0, E5, { gain: 0.8, decay: 0.35 });
  bell(b, 0.16, Gs5, { gain: 0.7, decay: 0.35 });
  bell(b, 0.32, B5, { gain: 0.75, decay: 0.5 });
  bell(b, 0.9, B5, { gain: 0.45, decay: 0.3 });
  bell(b, 1.06, E5 * 2, { gain: 0.25, decay: 0.4 });
  normalise(b, -3);
  return b;
}

const outDir = join(root, 'packages/shared/assets/sounds');
mkdirSync(outDir, { recursive: true });
const files = { 'us_chime.wav': chime(), 'us_ring.wav': ring() };
for (const [name, buf] of Object.entries(files)) {
  writeFileSync(join(outDir, name), wav(buf));
  console.log(`✓ ${name} (${(buf.length / RATE).toFixed(2)} s)`);
}

const targets = ['apps/web/public/sounds', 'apps/mobile/assets/sounds'];
for (const t of targets) {
  const dir = join(root, t);
  if (!existsSync(join(root, t.split('/').slice(0, 2).join('/')))) continue;
  mkdirSync(dir, { recursive: true });
  for (const name of Object.keys(files)) copyFileSync(join(outDir, name), join(dir, name));
  console.log(`  → ${t}`);
}
