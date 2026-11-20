#!/usr/bin/env node
/**
 * Our House's sounds, made in code (no recordings to license): footsteps on
 * each floor, a door, a switch, the fridge, a splash, cooking, pouring
 * water, birds, crickets, rain and a soft looping tune for the speaker.
 * Writes 22 kHz mono WAVs to assets-build/house/sounds/; the house pack
 * (scripts/build-house-assets.mjs) takes them from there.
 *
 *   node scripts/generate-house-sounds.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets-build', 'house', 'sounds');
mkdirSync(out, { recursive: true });

const RATE = 22050;
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

function wav(name, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const k = peak > 0.95 ? 0.95 / peak : 1;
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * k)) * 32767), 44 + i * 2);
  writeFileSync(join(out, `${name}.wav`), buf);
  console.log(`♪ ${name}.wav ${(buf.length / 1024).toFixed(0)} KB`);
}

const len = (s) => Math.round(s * RATE);

/** One-pole low-pass over a signal. */
function lowpass(x, cutoff) {
  const a = Math.exp((-2 * Math.PI * cutoff) / RATE);
  let y = 0;
  return x.map((v) => (y = (1 - a) * v + a * y));
}
function highpass(x, cutoff) {
  const lp = lowpass(x, cutoff);
  return x.map((v, i) => v - lp[i]);
}
const noise = (s) => Array.from({ length: len(s) }, () => rand());
const env = (x, attack, decay) => x.map((v, i) => v * Math.min(1, i / Math.max(1, len(attack))) * Math.exp(-i / Math.max(1, len(decay))));
const mix = (...xs) => {
  const n = Math.max(...xs.map((x) => x.length));
  return Array.from({ length: n }, (_, i) => xs.reduce((s, x) => s + (x[i] ?? 0), 0));
};
const gain = (x, g) => x.map((v) => v * g);
const pad = (x, s) => [...new Array(len(s)).fill(0), ...x];
/** A loop that joins without a click: the last part fades into the start. */
function seamless(x, fade = 0.4) {
  const f = len(fade);
  const body = x.slice(0, x.length - f);
  for (let i = 0; i < f; i++) body[i] = body[i] * (i / f) + x[x.length - f + i] * (1 - i / f);
  return body;
}

// Footsteps: a soft knock, coloured by what's underfoot.
wav('step_wood', mix(gain(env(lowpass(noise(0.18), 900), 0.002, 0.035), 0.9), gain(env(Array.from({ length: len(0.18) }, (_, i) => Math.sin((2 * Math.PI * 110 * i) / RATE)), 0.001, 0.03), 0.5)));
wav('step_tile', mix(gain(env(highpass(noise(0.14), 1800), 0.001, 0.02), 0.7), gain(env(lowpass(noise(0.14), 1400), 0.001, 0.03), 0.6)));
wav('step_grass', gain(env(highpass(lowpass(noise(0.22), 4200), 600), 0.012, 0.06), 0.55));
wav('step_stone', mix(gain(env(lowpass(noise(0.15), 2200), 0.001, 0.028), 0.9), gain(env(highpass(noise(0.15), 3000), 0.001, 0.012), 0.3)));

// A door: a creak, then the latch.
{
  const creak = Array.from({ length: len(0.55) }, (_, i) => {
    const t = i / RATE;
    const f = 380 + 90 * Math.sin(t * 9) + t * 160;
    return Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.25 * Math.sin(Math.PI * Math.min(1, t / 0.55));
  });
  wav('door', mix(lowpass(creak, 1800), pad(gain(env(lowpass(noise(0.12), 700), 0.001, 0.03), 1.2), 0.5)));
}
wav('click', gain(env(highpass(noise(0.05), 2500), 0.0005, 0.006), 0.8));
wav('fridge', mix(gain(env(lowpass(noise(0.3), 400), 0.002, 0.06), 1), pad(gain(env(highpass(noise(0.08), 2000), 0.001, 0.01), 0.3), 0.02)));

// A splash: a burst that falls away, with droplets after.
{
  const burst = gain(env(lowpass(noise(0.9), 3000), 0.004, 0.18), 1);
  const drops = Array.from({ length: len(0.9) }, (_, i) => (rand() > 0.9985 ? rand() : 0));
  wav('splash', mix(burst, gain(lowpass(drops, 5000), 2)));
}

// Loops.
wav('sizzle', seamless(Array.from({ length: len(3.4) }, () => (rand() > 0.97 ? rand() : rand() * 0.15)).map((v, i, a) => v - (a[i - 1] ?? 0) * 0.6)));
wav('pour', seamless(gain(lowpass(highpass(noise(2.4), 400), 2600).map((v, i) => v * (0.8 + 0.2 * Math.sin(i / 900))), 0.6)));
wav('rain', seamless(mix(gain(lowpass(noise(6.4), 1800), 0.5), Array.from({ length: len(6.4) }, () => (rand() > 0.995 ? rand() * 0.6 : 0)))));
{
  // Crickets: a bright chirp in pulses of three.
  const x = new Array(len(4.4)).fill(0);
  for (let t0 = 0; t0 < 4; t0 += 0.55) {
    for (let p = 0; p < 3; p++) {
      const start = len(t0 + p * 0.045);
      for (let i = 0; i < len(0.03); i++) x[start + i] += Math.sin((2 * Math.PI * 4400 * i) / RATE) * Math.sin((Math.PI * i) / len(0.03)) * 0.4;
    }
  }
  wav('crickets', seamless(mix(x, gain(lowpass(noise(4.4), 300), 0.05))));
}
{
  // Birds: little falling and rising whistles, here and there.
  const x = new Array(len(9)).fill(0);
  for (let k = 0; k < 16; k++) {
    const t0 = Math.abs(rand()) * 8.3;
    const base = 2600 + Math.abs(rand()) * 1800;
    const notes = 2 + Math.floor(Math.abs(rand()) * 4);
    for (let n = 0; n < notes; n++) {
      const start = len(t0 + n * 0.11);
      const d = len(0.08);
      const up = rand() > 0;
      let ph = 0;
      for (let i = 0; i < d && start + i < x.length; i++) {
        const f = base * (up ? 1 + (i / d) * 0.35 : 1.35 - (i / d) * 0.35);
        ph += (2 * Math.PI * f) / RATE;
        x[start + i] += Math.sin(ph) * Math.sin((Math.PI * i) / d) * 0.3;
      }
    }
  }
  wav('birds', seamless(mix(x, gain(lowpass(noise(9), 500), 0.03))));
}
{
  // The speaker: a soft four-chord loop at 76 bpm, warm pads, a light beat.
  const bpm = 76;
  const beat = 60 / bpm;
  const bars = 4;
  const total = bars * 4 * beat;
  const x = new Array(len(total)).fill(0);
  const chords = [
    [220.0, 261.6, 329.6, 392.0],
    [174.6, 220.0, 261.6, 329.6],
    [196.0, 246.9, 293.7, 349.2],
    [164.8, 207.7, 246.9, 329.6],
  ];
  chords.forEach((ch, b) => {
    const start = len(b * 4 * beat);
    const d = len(4 * beat);
    for (const f of ch) {
      for (let i = 0; i < d; i++) {
        const t = i / RATE;
        const e = Math.min(1, t / 0.3) * Math.min(1, (d - i) / len(0.4));
        x[start + i] += (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2 * t)) * 0.07 * e;
      }
    }
    // A bass note on the root.
    for (let i = 0; i < d; i++) x[start + i] += Math.sin((2 * Math.PI * (ch[0] / 2) * i) / RATE) * 0.12 * Math.exp(-((i % len(2 * beat)) / len(0.9)));
  });
  for (let k = 0; k < bars * 4; k++) {
    const s = len(k * beat);
    for (let i = 0; i < len(0.25); i++) x[s + i] += Math.sin(2 * Math.PI * (60 - i / 400) * (i / RATE)) * 0.35 * Math.exp(-i / len(0.08));
    const h = len(k * beat + beat / 2);
    const hat = env(highpass(noise(0.05), 6000), 0.001, 0.01);
    hat.forEach((v, i) => (x[h + i] += v * 0.08));
  }
  wav('music', x);
}
wav('chime', mix(...[880, 1108.7, 1318.5].map((f, n) => pad(env(Array.from({ length: len(1.2) }, (_, i) => Math.sin((2 * Math.PI * f * i) / RATE)), 0.005, 0.45), n * 0.09))).map((v) => v * 0.4));
