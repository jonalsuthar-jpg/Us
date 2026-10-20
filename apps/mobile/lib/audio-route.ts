import InCallManager from 'react-native-incall-manager';

/**
 * Call audio routing via react-native-incall-manager. `auto` picks the
 * natural default — speaker for video, earpiece for voice — and hands over
 * to a wired or Bluetooth headset when one is connected. It also runs the
 * proximity sensor on voice calls so the screen sleeps against your ear.
 */
export function startCallAudio(media: 'audio' | 'video') {
  InCallManager.start({ media, auto: true });
}

/** Force the loudspeaker on, or back to the earpiece / headset. */
export function setSpeaker(on: boolean) {
  InCallManager.setForceSpeakerphoneOn(on);
}

export function stopCallAudio() {
  InCallManager.stop();
}
