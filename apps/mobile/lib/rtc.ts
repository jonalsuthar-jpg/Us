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
  switchCamera: (track) => {
    const t = track as unknown as { getSettings(): { facingMode?: string }; applyConstraints(c: object): Promise<void> };
    const facing = t.getSettings().facingMode === 'environment' ? 'user' : 'environment';
    void t.applyConstraints({ facingMode: facing });
  },
};
