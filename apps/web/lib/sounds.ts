'use client';

/**
 * In-app sounds (the app's own chime and ring, see scripts/generate-sounds.mjs).
 * Browsers don't let web push choose a sound, so foreground notifications
 * play the chime here; background web push uses the OS default.
 */
let ring: HTMLAudioElement | null = null;

function audio(src: string, loop = false) {
  const a = new Audio(src);
  a.loop = loop;
  a.volume = 0.7;
  return a;
}

export function playChime() {
  void audio('/sounds/us_chime.wav').play().catch(() => {});
}

export function startRing() {
  if (ring) return;
  ring = audio('/sounds/us_ring.wav', true);
  void ring.play().catch(() => {});
}

export function stopRing() {
  ring?.pause();
  ring = null;
}
