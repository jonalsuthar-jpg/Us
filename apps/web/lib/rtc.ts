'use client';

import type { RtcAdapter } from '@us/shared';

/** The parts of the User-Agent Client Hints API used here; not yet in TypeScript's DOM types. */
interface UserAgentData {
  getHighEntropyValues(hints: string[]): Promise<{ brands: { brand: string; version: string }[]; platform: string; platformVersion: string }>;
}

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
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              // Keep this call's own audio out of the capture, or my partner hears themselves.
              restrictOwnAudio: true,
            } as MediaTrackConstraints,
            systemAudio: 'include',
            // A shared window sends only that program's sound, where the browser can.
            windowAudio: 'window',
            // This tab's sound is my partner's voice, so it isn't offered for sharing.
            selfBrowserSurface: 'exclude',
          } as DisplayMediaStreamOptions)
      : undefined,
  // The same minimums Google Meet asks for system sound: Chromium 142 on Windows 11 or macOS 14.2.
  canExcludeOwnAudio: async (sound) => {
    if ((sound.getSettings() as { restrictOwnAudio?: boolean }).restrictOwnAudio !== true) return false;
    const ua = (navigator as Navigator & { userAgentData?: UserAgentData }).userAgentData;
    if (!ua) return false;
    const { brands, platform, platformVersion } = await ua.getHighEntropyValues(['platformVersion']);
    if (Number(brands.find((b) => b.brand === 'Chromium')?.version ?? 0) < 142) return false;
    const [major = 0, minor = 0] = platformVersion.split('.').map(Number);
    // Windows 11 reports its platform version as 13 or above.
    if (platform === 'Windows') return major >= 13;
    if (platform === 'macOS') return major > 14 || (major === 14 && minor >= 2);
    return false;
  },
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
