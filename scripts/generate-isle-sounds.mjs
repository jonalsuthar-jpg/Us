#!/usr/bin/env node
/**
 * Isle's sounds, made in code (nothing recorded, nothing to license): dice
 * rattling and tumbling onto a wooden raft, pieces clacking onto the board,
 * cards, a coin-bright chime when cards come in, the robber's thud, a bell
 * for your turn, a fanfare for the win, waves with gulls, and a gentle
 * plucked tune to play under it all.
 *
 * Writes 22 kHz mono WAVs to apps/mobile/assets/isle/ (bundled with the
 * app) and apps/web/public/isle/sounds/.
 *
 *   node scripts/generate-isle-sounds.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outs = [join(root, 'apps', 'mobile', 'assets', 'isle'), join(root, 'apps', 'web', 'public', 'isle', 'sounds')];
for (const o of outs) mkdirSync(o, { recursive: true });

const RATE = 22050;
let seed = 4242;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const len = (s) => Math.round(s * RATE);
const TAU = 2 * Math.PI;

function wav(name, samples, loop = false) {
  // One-shots end in a quick fade, so a sound cut off mid-ring doesn't click.
  if (!loop) {
    const f = Math.min(samples.length, len(0.03));
    for (let i = 0; i < f; i++) samples[samples.length - 1 - i] *= i / f;
  }
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
  const k = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * k)) * 32767), 44 + i * 2);
  for (const o of outs) writeFileSync(join(o, `${name}.wav`), buf);
  console.log(`♪ ${name}.wav ${(buf.length / 1024).toFixed(0)} KB`);
}

// ---- Building blocks ---------------------------------------------------------

const silence = (s) => new Array(len(s)).fill(0);
const noise = (s) => Array.from({ length: len(s) }, () => rand());
function lowpass(x, cutoff) {
  const a = Math.exp((-TAU * cutoff) / RATE);
  let y = 0;
  return x.map((v) => (y = (1 - a) * v + a * y));
}
function highpass(x, cutoff) {
  const lp = lowpass(x, cutoff);
  return x.map((v, i) => v - lp[i]);
}
const bandpass = (x, lo, hi) => lowpass(highpass(x, lo), hi);
const gain = (x, g) => x.map((v) => v * g);
/** Adds `x` into `into` starting at `at` seconds. */
function put(into, x, at = 0, g = 1) {
  const o = len(at);
  for (let i = 0; i < x.length; i++) if (o + i < into.length) into[o + i] += x[i] * g;
  return into;
}
/** A sine (or a few partials) with a quick attack and an exponential decay. */
function tone(freq, s, { decay = s / 4, attack = 0.004, partials = [[1, 1]], shape = 'sine', bend = 0 } = {}) {
  let ph = partials.map(() => 0);
  return Array.from({ length: len(s) }, (_, i) => {
    const t = i / RATE;
    const f = freq * Math.pow(2, (bend * t) / 12);
    let v = 0;
    partials.forEach(([mul, amp], k) => {
      ph[k] += (TAU * f * mul) / RATE;
      const p = ph[k];
      v += amp * (shape === 'tri' ? (2 / Math.PI) * Math.asin(Math.sin(p)) : Math.sin(p));
    });
    return v * Math.min(1, t / attack) * Math.exp(-t / decay);
  });
}
/** A knock on wood: a short burst of filtered noise and a few quickly-dying wooden partials. */
function knock(freq, s = 0.25, bright = 2200) {
  const body = tone(freq, s, { decay: 0.045, attack: 0.0008, partials: [[1, 1], [2.31, 0.5], [3.9, 0.25], [5.6, 0.12]] });
  const hit = gain(lowpass(noise(0.03), bright), 1).map((v, i) => v * Math.exp(-i / len(0.006)));
  return put(body, hit, 0, 0.9);
}
/** A die clicking on wood: bright and tiny. */
function click(s = 0.05, bright = 5200, tone0 = 0) {
  const n = highpass(lowpass(noise(s), bright), 900).map((v, i) => v * Math.exp(-i / len(0.007)));
  return tone0 ? put(n, tone(tone0, s, { decay: 0.012, attack: 0.0005 }), 0, 0.5) : n;
}
/** A plucked string (Karplus–Strong): the music and the warmer chimes. */
function pluck(freq, s, damp = 0.996, bright = 0.5) {
  const n = Math.max(2, Math.round(RATE / freq));
  const ring = Array.from({ length: n }, () => rand() * (0.5 + bright * 0.5));
  const out = new Array(len(s));
  let prev = 0;
  for (let i = 0; i < out.length; i++) {
    const j = i % n;
    const v = ring[j];
    const next = damp * (0.5 * (v + prev));
    prev = v;
    ring[j] = next;
    out[i] = v;
  }
  return lowpass(out, 3800).map((v, i) => v * Math.min(1, i / 40));
}
/** A soft bell: a few inharmonic partials, long decay. */
const bell = (freq, s = 1.2, decay = 0.4) => tone(freq, s, { decay, attack: 0.002, partials: [[1, 1], [2.0, 0.35], [2.76, 0.18], [5.4, 0.06]] });
const note = (n) => 440 * Math.pow(2, (n - 69) / 12);
/** A loop that joins without a click: the tail fades into the start. */
function seamless(x, fade = 0.5) {
  const f = len(fade);
  const body = x.slice(0, x.length - f);
  for (let i = 0; i < f; i++) body[i] = body[i] * (i / f) + x[x.length - f + i] * (1 - i / f);
  return body;
}

// ---- Dice: shaken, thrown, bouncing on the raft, settling (timed to the board's 1.15 s tumble) ----

{
  const x = silence(1.3);
  // In the hand: a quick rattle.
  for (let i = 0; i < 7; i++) put(x, click(0.04, 6000), 0.02 + i * 0.032 + rand() * 0.008, 0.35 + Math.random() * 0.2);
  // Landing and bouncing: two dice, each hit lighter and closer together.
  const hits = [0.58, 0.62, 0.71, 0.76, 0.84, 0.88, 0.94, 0.98, 1.02, 1.06, 1.09];
  hits.forEach((t, i) => {
    const g = Math.pow(0.82, i);
    put(x, knock(520 + rand() * 80, 0.12, 4200), t, 0.45 * g);
    put(x, click(0.05, 6500, 1900 + rand() * 300), t + 0.004, 0.8 * g);
  });
  // A last roll to a stop.
  put(x, gain(bandpass(noise(0.12), 1800, 5000), 0.12).map((v, i) => v * Math.exp(-i / len(0.04))), 1.1);
  wav('dice', x);
}

// ---- Pieces ---------------------------------------------------------------------

wav('town', put(put(silence(0.45), knock(190, 0.35, 2600), 0), knock(240, 0.2, 2000), 0.055, 0.35));
wav('road', put(put(silence(0.3), knock(300, 0.25, 3000), 0), knock(360, 0.15, 2600), 0.04, 0.25));
{
  const x = put(silence(1.2), knock(170, 0.35, 2400), 0);
  [72, 76, 79, 84].forEach((n, i) => put(x, bell(note(n), 0.9, 0.35), 0.12 + i * 0.07, 0.35));
  wav('city', x);
}
wav('click', put(silence(0.08), knock(700, 0.06, 5000), 0, 0.6));

// ---- Cards ----------------------------------------------------------------------

function swish(s, from, to, g = 1) {
  const n = noise(s);
  const out = [];
  let lp = 0;
  let hp = 0;
  for (let i = 0; i < n.length; i++) {
    const t = i / n.length;
    const f = from + (to - from) * t;
    const a = Math.exp((-TAU * f) / RATE);
    lp = (1 - a) * n[i] + a * lp;
    hp = 0.92 * hp + 0.08 * lp;
    out.push((lp - hp) * Math.sin(Math.PI * t) * g);
  }
  return out;
}
wav('card', put(put(silence(0.3), swish(0.2, 1500, 5200), 0), click(0.03, 7000), 0.17, 0.4));
wav('steal', swish(0.26, 5200, 900, 1));
{
  // Cards coming in: a bright little two-note pling.
  const x = silence(0.7);
  put(x, bell(note(88), 0.6, 0.18), 0, 0.5);
  put(x, bell(note(93), 0.6, 0.22), 0.06, 0.45);
  wav('gain', x);
}
{
  const x = silence(0.9);
  put(x, bell(note(79), 0.8, 0.28), 0, 0.6);
  put(x, bell(note(84), 0.8, 0.32), 0.14, 0.6);
  wav('trade', x);
}

// ---- The robber, knights, a 7 -----------------------------------------------------

{
  const x = silence(1.2);
  put(x, tone(70, 0.6, { decay: 0.18, attack: 0.002, bend: -6 }), 0, 1);
  put(x, lowpass(noise(0.2), 400).map((v, i) => v * Math.exp(-i / len(0.05))), 0, 0.6);
  put(x, tone(110, 1.0, { decay: 0.45, attack: 0.05, shape: 'tri' }), 0.05, 0.25);
  put(x, tone(130.8, 1.0, { decay: 0.45, attack: 0.05, shape: 'tri' }), 0.05, 0.2);
  wav('robber', x);
}
{
  const x = silence(1.0);
  put(x, tone(2240, 0.9, { decay: 0.3, attack: 0.001, partials: [[1, 1], [1.41, 0.6], [2.13, 0.4], [3.07, 0.2]] }), 0, 0.4);
  put(x, highpass(noise(0.15), 3000).map((v, i) => v * Math.exp(-i / len(0.04))), 0, 0.3);
  wav('knight', x);
}
{
  const x = silence(1.4);
  put(x, tone(60, 0.5, { decay: 0.15, bend: -4 }), 0, 1);
  [67, 63, 60].forEach((n, i) => put(x, tone(note(n), 0.7, { decay: 0.3, shape: 'tri' }), 0.1 + i * 0.16, 0.35));
  wav('seven', x);
}

// ---- Turns, bonuses, the win ----------------------------------------------------------

{
  const x = silence(1.4);
  [76, 79, 84].forEach((n, i) => put(x, bell(note(n), 1.1, 0.45), i * 0.12, 0.45));
  wav('turn', x);
}
{
  const x = silence(1.3);
  [72, 76, 79, 84, 88].forEach((n, i) => put(x, pluck(note(n), 1.0, 0.997, 0.8), i * 0.07, 0.5));
  wav('bonus', x);
}
{
  // The win: a short fanfare and a held chord.
  const x = silence(3.2);
  const seq = [
    [72, 0, 0.16],
    [72, 0.18, 0.12],
    [72, 0.32, 0.12],
    [76, 0.46, 0.3],
    [79, 0.8, 0.25],
    [84, 1.08, 1.6],
  ];
  for (const [n, t, d] of seq) {
    put(x, tone(note(n), d + 0.4, { decay: d * 0.9 + 0.1, attack: 0.01, shape: 'tri', partials: [[1, 1], [2, 0.3], [3, 0.12]] }), t, 0.45);
    put(x, pluck(note(n - 12), d + 0.5, 0.997), t, 0.25);
  }
  for (const n of [60, 64, 67, 72]) put(x, tone(note(n), 2.0, { decay: 0.9, attack: 0.05, shape: 'tri' }), 1.08, 0.18);
  wav('win', x);
}

// ---- Loops: the sea, and a tune -----------------------------------------------------------

{
  // Waves: low surf breathing in and out every few seconds, and a gull now and then.
  const S = 9;
  const surf = lowpass(noise(S + 0.6), 900);
  const hiss = bandpass(noise(S + 0.6), 1500, 4000);
  const x = surf.map((v, i) => {
    const t = i / RATE;
    const swell = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin((TAU * t) / 4.6 - 1.2), 2);
    return v * swell * 0.9 + hiss[i] * Math.pow(swell, 3) * 0.25;
  });
  const gull = (at, base) => {
    for (let k = 0; k < 2; k++) {
      const c = Array.from({ length: len(0.28) }, (_, i) => {
        const t = i / RATE;
        const f = base * (1.35 - 0.55 * (t / 0.28));
        return Math.sin(TAU * f * t + 2.5 * Math.sin(TAU * 7 * t)) * Math.sin(Math.PI * (t / 0.28));
      });
      put(x, highpass(c, 600), at + k * 0.34, 0.05);
    }
  };
  gull(2.3, 1700);
  gull(6.4, 1900);
  wav('waves', seamless(x, 0.6), true);
}
{
  // A gentle plucked tune: D, Bm, G, A twice over (96 bpm, 8 bars), harp-like arpeggios and a melody.
  const BPM = 96;
  const beat = 60 / BPM;
  const bars = 8;
  const S = bars * 4 * beat;
  const x = silence(S + 1.2);
  const chords = [
    [50, 57, 62, 66],
    [47, 54, 59, 62],
    [43, 50, 55, 59],
    [45, 52, 57, 61],
  ];
  for (let b = 0; b < bars; b++) {
    const ch = chords[b % 4];
    const t0 = b * 4 * beat;
    put(x, pluck(note(ch[0] - 12), 3.2, 0.998, 0.3), t0, 0.55);
    // Arpeggio in eighths.
    const arp = [ch[1], ch[2], ch[3], ch[2], ch[1] + 12, ch[2], ch[3], ch[2]];
    arp.forEach((n, k) => put(x, pluck(note(n), 1.4, 0.996, 0.4), t0 + k * (beat / 2), 0.22));
  }
  // The melody over it (bar, beat, midi note, beats long).
  const tune = [
    [0, 0, 74, 1.5], [0, 1.5, 76, 0.5], [0, 2, 78, 2],
    [1, 0, 76, 1], [1, 1, 74, 1], [1, 2, 71, 2],
    [2, 0, 74, 1.5], [2, 1.5, 71, 0.5], [2, 2, 67, 2],
    [3, 0, 69, 1], [3, 1, 71, 1], [3, 2, 73, 2],
    [4, 0, 78, 1.5], [4, 1.5, 76, 0.5], [4, 2, 74, 2],
    [5, 0, 71, 1], [5, 1, 74, 1], [5, 2, 78, 2],
    [6, 0, 79, 1.5], [6, 1.5, 78, 0.5], [6, 2, 76, 1], [6, 3, 74, 1],
    [7, 0, 73, 2], [7, 2, 69, 2],
  ];
  for (const [b, at, n, d] of tune) put(x, pluck(note(n), d * beat + 1.2, 0.997, 0.7), (b * 4 + at) * beat, 0.3);
  // Fold the ringing tail back into the start so it loops cleanly.
  const loop = x.slice(0, len(S));
  const tail = x.slice(len(S));
  for (let i = 0; i < tail.length; i++) loop[i] += tail[i];
  wav('music', lowpass(loop, 5200), true);
}
