import type { RtcAdapter } from '@us/shared';
import { mediaDevices, MediaStream, RTCPeerConnection } from 'react-native-webrtc';

/**
 * react-native-webrtc behind the shared RtcAdapter. No getDisplayMedia: on
 * mobile, the call screen nudges people to share from the web app instead.
 *
 * react-native-webrtc's classes are structurally close to the DOM's but not
 * typed as them, hence the casts.
 */
export const nativeRtc: RtcAdapter = {
  RTCPeerConnection: RTCPeerConnection as unknown as RtcAdapter['RTCPeerConnection'],
  MediaStream: MediaStream as unknown as RtcAdapter['MediaStream'],
  getUserMedia: (c) => mediaDevices.getUserMedia(c as never) as unknown as Promise<globalThis.MediaStream>,
  switchCamera: async (track, facing) => {
    const t = track as unknown as { applyConstraints(c: object): Promise<void>; _switchCamera?: () => void };
    try {
      await t.applyConstraints({ facingMode: facing });
    } catch {
      t._switchCamera?.(); // older react-native-webrtc builds
    }
  },
};
