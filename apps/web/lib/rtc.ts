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
            // Up to 60 fps and 1440p: the most either mode asks for. The call engine then
            // narrows it per Smooth (1080p, 60 fps) or Sharp (1440p, 15 fps).
            video: { frameRate: { ideal: 60, max: 60 }, width: { max: 2560 }, height: { max: 1440 } },
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
