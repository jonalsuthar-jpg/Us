'use client';

import type { RtcAdapter } from '@us/shared';

/** Browser WebRTC. Screen sharing is web-only by design; camera flips cycle real devices. */
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
  listCameras: async () =>
    (await navigator.mediaDevices.enumerateDevices())
      .filter((d) => d.kind === 'videoinput' && d.deviceId)
      .map((d) => ({ deviceId: d.deviceId, label: d.label })),
};
