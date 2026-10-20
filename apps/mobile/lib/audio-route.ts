import type InCallManagerType from 'react-native-incall-manager';

/**
 * Call audio routing via react-native-incall-manager. `auto` picks the
 * natural default — speaker for video, earpiece for voice — and hands over
 * to a wired or Bluetooth headset when one is connected. It also runs the
 * proximity sensor on voice calls so the screen sleeps against your ear.
 *
 * Loaded on first use (not at app start), and every call is guarded, so a
 * problem in the native module can only cost audio routing — never the app.
 */
let manager: typeof InCallManagerType | null | undefined;

function icm(): typeof InCallManagerType | null {
  if (manager === undefined) {
    try {
      manager = require('react-native-incall-manager').default ?? null;
    } catch (e) {
      console.warn('[us] in-call audio routing unavailable', e);
      manager = null;
    }
  }
  return manager ?? null;
}

function safely(fn: (m: typeof InCallManagerType) => void) {
  const m = icm();
  if (!m) return;
  try {
    fn(m);
  } catch (e) {
    console.warn('[us] in-call audio routing failed', e);
  }
}

export function startCallAudio(media: 'audio' | 'video') {
  safely((m) => m.start({ media, auto: true }));
}

/** Force the loudspeaker on, or back to the earpiece / headset. */
export function setSpeaker(on: boolean) {
  safely((m) => m.setForceSpeakerphoneOn(on));
}

export function stopCallAudio() {
  safely((m) => m.stop());
}
