import type { RtcAdapter, VideoTier } from '@us/shared';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import { mediaDevices, MediaStream, RTCPeerConnection, RTCRtpSender } from 'react-native-webrtc';

/**
 * 1080p only when the phone can afford it: on Wi-Fi, charging or above 30%,
 * and not in battery saver. Otherwise 720p, which still looks good on a
 * phone and spends far less battery, heat and data.
 */
async function videoQuality(): Promise<VideoTier> {
  const [net, level, state, saver] = await Promise.all([
    Network.getNetworkStateAsync().catch(() => null),
    Battery.getBatteryLevelAsync().catch(() => -1),
    Battery.getBatteryStateAsync().catch(() => Battery.BatteryState.UNKNOWN),
    Battery.isLowPowerModeEnabledAsync().catch(() => false),
  ]);
  if (saver) return 'standard';
  if (net && net.type !== Network.NetworkStateType.WIFI && net.type !== Network.NetworkStateType.ETHERNET) return 'standard';
  const charging = state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
  if (!charging && level >= 0 && level < 0.3) return 'standard';
  return 'high';
}

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
    const t = track as unknown as {
      applyConstraints(c: object): Promise<void>;
      getSettings(): { width?: number; height?: number; frameRate?: number };
      _switchCamera?: () => void;
    };
    // Constraints left out go back to their defaults, so keep the size.
    const { width, height, frameRate } = t.getSettings?.() ?? {};
    try {
      await t.applyConstraints({ facingMode: facing, ...(width && height ? { width, height } : {}), ...(frameRate ? { frameRate } : {}) });
    } catch {
      t._switchCamera?.(); // older react-native-webrtc builds
    }
  },
  videoQuality,
  // Phones encode H.264 in hardware: much less battery and heat than VP8.
  preferVideoCodec: 'video/H264',
  videoSendCodecs: () => (RTCRtpSender.getCapabilities('video')?.codecs ?? []) as unknown as RTCRtpCodec[],
};
