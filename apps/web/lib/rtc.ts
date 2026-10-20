'use client';

import type { RtcAdapter } from '@us/shared';

/** Browser WebRTC. Screen sharing is web-only by design. */
export const webRtc: RtcAdapter = {
  RTCPeerConnection: globalThis.RTCPeerConnection,
  MediaStream: globalThis.MediaStream,
  getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
  getDisplayMedia:
    typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia
      ? () =>
          navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: 15, max: 30 } },
            audio: false,
          })
      : undefined,
};
