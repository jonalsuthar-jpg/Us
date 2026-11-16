import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';
import type InCallManagerType from 'react-native-incall-manager';
import { audioChoices, audioMode, bluetoothMedia, preferMic, resetCallAudio, type AudioChoices } from '@/modules/us-call';

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

/** Started and not stopped yet; the call screen may mount again mid-call. */
let audioOn = false;
let audioMedia: 'audio' | 'video' = 'audio';
/** The route picked by hand this call, put back if call mode has to restart. */
let pickedRoute: AudioRoute | null = null;
/** Bluetooth earbuds playing as headphones, with the phone's mic (out of call mode on purpose). */
let earbudsAsHeadphones = false;

/** Android's MODE_IN_COMMUNICATION. */
const IN_CALL_MODE = 3;

export async function startCallAudio(media: 'audio' | 'video') {
  if (audioOn) {
    // The app's screen came back mid-call. If call mode was lost while it was
    // away, the phone's voice processing went with it: start it again.
    const mode = audioMode();
    if (!earbudsAsHeadphones && mode !== null && mode !== IN_CALL_MODE) {
      safely((m) => m.stop());
      safely((m) => m.start({ media: audioMedia, auto: true }));
      if (pickedRoute) chooseRoute(pickedRoute);
    }
    return;
  }
  audioOn = true;
  audioMedia = media;
  pickedRoute = null;
  // Asked before starting: the audio manager only looks for Bluetooth as it starts.
  await allowBluetooth();
  safely((m) => m.start({ media, auto: true }));
}

/** Send call sound to a device (Android), or toggle the loudspeaker (iOS). */
export function chooseRoute(route: AudioRoute) {
  pickedRoute = route;
  if (earbudsAsHeadphones) setEarbudsAsHeadphones(false);
  if (Platform.OS === 'android') safely((m) => void m.chooseAudioRoute(route).catch(() => {}));
  else safely((m) => m.setForceSpeakerphoneOn(route === 'SPEAKER_PHONE'));
}

/** Which mic the call uses: the phone's own, or the earphones' (Android picks). */
export type MicChoice = 'phone' | 'earphones';

/** What there is to choose from now (Android). */
export function micOptions(): AudioChoices {
  return Platform.OS === 'android' ? audioChoices() : { headsetMic: false, bluetoothMic: false, bluetoothMedia: false };
}

/**
 * Speak through the phone's mic or the earphones'. With Bluetooth earbuds,
 * the phone's mic means the earbuds play as headphones (better sound, as
 * their mic then isn't in use). Returns false if this phone couldn't.
 */
export function chooseMic(mic: MicChoice, remember = true): boolean {
  if (Platform.OS !== 'android') return false;
  if (remember) void AsyncStorage.setItem(MIC_KEY, mic).catch(() => {});
  const { headsetMic, bluetoothMedia: btMedia } = audioChoices();
  if (mic === 'earphones') {
    if (earbudsAsHeadphones) setEarbudsAsHeadphones(false);
    return preferMic('auto');
  }
  if (headsetMic) return preferMic('phone');
  if (btMedia) return setEarbudsAsHeadphones(true);
  return preferMic('phone');
}

const MIC_KEY = 'us.call-mic';

/** The call just connected: use the mic picked last time, if it was the phone's. */
export async function applyRememberedMic(): Promise<MicChoice> {
  const mic = (await AsyncStorage.getItem(MIC_KEY).catch(() => null)) as MicChoice | null;
  if (mic !== 'phone') return 'earphones';
  const { headsetMic, bluetoothMedia: btMedia } = micOptions();
  if (!headsetMic && !btMedia) return 'earphones';
  return chooseMic('phone', false) ? 'phone' : 'earphones';
}

function setEarbudsAsHeadphones(on: boolean): boolean {
  if (on) {
    // Call mode would hold the earbuds in headset mode: step out of it.
    safely((m) => m.stop());
    const went = bluetoothMedia(true);
    preferMic('phone');
    earbudsAsHeadphones = went === 'bluetoothMedia';
    if (!earbudsAsHeadphones) {
      // This phone keeps call sound off A2DP: back to a normal call.
      bluetoothMedia(false);
      preferMic('auto');
      safely((m) => m.start({ media: audioMedia, auto: true }));
    }
    return earbudsAsHeadphones;
  }
  earbudsAsHeadphones = false;
  bluetoothMedia(false);
  preferMic('auto');
  safely((m) => m.start({ media: audioMedia, auto: true }));
  return true;
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
  audioOn = false;
  pickedRoute = null;
  earbudsAsHeadphones = false;
  resetCallAudio();
  safely((m) => m.stop());
}
