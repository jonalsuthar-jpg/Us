import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/* In-app playback of the app's own chime and ring (scripts/generate-sounds.mjs).
 * The same files are bundled as native notification sounds by onesignal-expo-plugin. */

let ring: AudioPlayer | null = null;
let modeSet = false;

async function ensureMode() {
  if (modeSet) return;
  modeSet = true;
  await setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
}

export async function playChime() {
  await ensureMode();
  const p = createAudioPlayer(require('../assets/sounds/us_chime.wav'));
  p.volume = 0.8;
  p.play();
  setTimeout(() => p.remove(), 2000);
}

export async function startRing() {
  if (ring) return;
  await ensureMode();
  ring = createAudioPlayer(require('../assets/sounds/us_ring.wav'));
  ring.loop = true;
  ring.play();
}

export function stopRing() {
  ring?.pause();
  ring?.remove();
  ring = null;
}
