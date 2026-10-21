import { DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';
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

/** Where call sound can go. Android reports which are available right now. */
export type AudioRoute = 'EARPIECE' | 'SPEAKER_PHONE' | 'WIRED_HEADSET' | 'BLUETOOTH';

/**
 * Android 12+ only lets an app use a Bluetooth headset for calls once the
 * person grants "Nearby devices". Without it the headset never shows up.
 */
async function allowBluetooth() {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 31) return;
  try {
    const p = PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT;
    if (!(await PermissionsAndroid.check(p))) await PermissionsAndroid.request(p);
  } catch (e) {
    console.warn('[us] bluetooth permission', e);
  }
}

export async function startCallAudio(media: 'audio' | 'video') {
  // Asked before starting: the audio manager only looks for Bluetooth as it starts.
  await allowBluetooth();
  safely((m) => m.start({ media, auto: true }));
}

/** Send call sound to a device (Android), or toggle the loudspeaker (iOS). */
export function chooseRoute(route: AudioRoute) {
  if (Platform.OS === 'android') safely((m) => void m.chooseAudioRoute(route).catch(() => {}));
  else safely((m) => m.setForceSpeakerphoneOn(route === 'SPEAKER_PHONE'));
}

/** Follow the available devices and the one in use. Android only; returns an unsubscribe. */
export function onAudioRoutes(fn: (available: AudioRoute[], selected: AudioRoute | null) => void): () => void {
  if (Platform.OS !== 'android') return () => {};
  const sub = DeviceEventEmitter.addListener('onAudioDeviceChanged', (d: { availableAudioDeviceList?: string; selectedAudioDevice?: string }) => {
    try {
      const available = JSON.parse(d.availableAudioDeviceList ?? '[]') as AudioRoute[];
      fn(available, (d.selectedAudioDevice || null) as AudioRoute | null);
    } catch {
      // malformed event: keep the last known routes
    }
  });
  return () => sub.remove();
}

export function stopCallAudio() {
  safely((m) => m.stop());
}
