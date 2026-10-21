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
            // The sound of what's shared (a video, music): offered for tabs, and for the
            // whole screen on Windows. Left raw — call-style processing mangles music.
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
            systemAudio: 'include',
            // Keep this call's own audio out of the capture, or my partner hears themselves.
            restrictOwnAudio: true,
          } as DisplayMediaStreamOptions)
      : undefined,
  mixAudio: (tracks) => {
    const ac = new AudioContext();
    const out = ac.createMediaStreamDestination();
    for (const t of tracks) ac.createMediaStreamSource(new MediaStream([t])).connect(out);
    return { track: out.stream.getAudioTracks()[0]!, close: () => void ac.close() };
  },
  listCameras: async () =>
    (await navigator.mediaDevices.enumerateDevices())
      .filter((d) => d.kind === 'videoinput' && d.deviceId)
      .map((d) => ({ deviceId: d.deviceId, label: d.label })),
};
