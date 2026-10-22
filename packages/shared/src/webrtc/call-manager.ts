import type { Call, CallMedia, CallStatus } from '../database.types';
import type { PushRequest } from '../api/push';
import type { SignalEnvelope } from '../realtime/couple-channel';
import type { MediaState, SignalEvent } from './signals';

// ---------------------------------------------------------------------------
// Contracts the host platform provides
// ---------------------------------------------------------------------------

/** Browser WebRTC on web, react-native-webrtc on mobile. */
export interface RtcAdapter {
  RTCPeerConnection: new (config: RTCConfiguration) => RTCPeerConnection;
  MediaStream: new (tracks?: MediaStreamTrack[]) => MediaStream;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  /** Web only. Absent on mobile, where the UI nudges toward the web app instead. */
  getDisplayMedia?: () => Promise<MediaStream>;
  /**
   * Web: mix several audio tracks into one. A shared screen's sound goes out
   * mixed with my mic on the one audio sender, so neither drops and nothing
   * renegotiates. Without it, a share is picture only.
   */
  mixAudio?: (tracks: MediaStreamTrack[]) => { track: MediaStreamTrack; close: () => void };
  /** Mobile: point an existing camera track at the front or back camera, in place. */
  switchCamera?: (track: MediaStreamTrack, facing: CameraFacing) => void | Promise<void>;
  /** Web: the cameras on this device, so calls can offer a flip when there's more than one. */
  listCameras?: () => Promise<{ deviceId: string; label: string }[]>;
}

export type CameraFacing = 'user' | 'environment';

/** Smooth keeps motion fluid (videos); Sharp keeps text crisp (documents). */
export type ShareMode = 'smooth' | 'sharp';

/** What my shared screen is actually going out at, for the sharer to see. */
export interface ScreenStats {
  height: number | null;
  fps: number | null;
  /** The connection, not the app, is what's holding quality back. */
  limitedByNetwork: boolean;
}

// Smooth runs at the display's 60 fps for video and scrolling; Sharp spends the
// same bits on fewer, crisper frames for text, code and photos.
const SHARE_QUALITY: Record<
  ShareMode,
  { hint: string; width: number; height: number; fps: number; maxBitrate: number; degradation: RTCDegradationPreference }
> = {
  smooth: { hint: 'motion', width: 1920, height: 1080, fps: 60, maxBitrate: 8_000_000, degradation: 'maintain-framerate' },
  sharp: { hint: 'detail', width: 2560, height: 1440, fps: 15, maxBitrate: 8_000_000, degradation: 'maintain-resolution' },
};
// Voice needs little; a shared film or song gets room for stereo music.
const VOICE_BITRATE = 40_000;
const SHARE_AUDIO_BITRATE = 128_000;

/**
 * Let Opus carry stereo up to 128 kbps. This only advertises what I can
 * receive; each sender still picks its bitrate (VOICE_BITRATE by default).
 */
export function opusForMedia(sdp: string): string {
  const pt = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp)?.[1];
  if (!pt) return sdp;
  return sdp.replace(new RegExp(`(a=fmtp:${pt} )([^\r\n]*)`), (_, head: string, params: string) => {
    const kept = params.split(';').filter((p) => p && !/^(stereo|sprop-stereo|maxaveragebitrate)=/.test(p.trim()));
    return `${head}${[...kept, 'stereo=1', 'sprop-stereo=1', 'maxaveragebitrate=128000'].join(';')}`;
  });
}

export interface CallBackend {
  createCall(media: CallMedia): Promise<Call>;
  setStatus(callId: string, status: CallStatus): Promise<unknown>;
  getCall(callId: string): Promise<Call | null>;
  iceServers(): Promise<RTCIceServer[]>;
  notify(req: PushRequest): void;
}

export interface CallSignaling {
  send(event: SignalEvent): Promise<void>;
  subscribe(fn: (env: SignalEnvelope) => void): () => void;
}

export interface CallManagerOptions {
  me: string;
  partnerId: string;
  signaling: CallSignaling;
  backend: CallBackend;
  rtc: RtcAdapter;
  /** iceTransportPolicy 'relay' — verifies TURN works. */
  forceRelay?: boolean;
  ringTimeoutMs?: number;
  /** How long the "call ended" state lingers before returning to idle. */
  endedLingerMs?: number;
  log?: (...args: unknown[]) => void;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type CallPhase =
  | 'idle'
  | 'outgoing' // I'm ringing them
  | 'incoming' // they're ringing me
  | 'connecting' // answered, negotiating media
  | 'connected'
  | 'reconnecting'
  | 'ended';

export type EndReason =
  | 'hangup' // I ended it
  | 'remote-hangup'
  | 'declined' // they declined my call, or I declined theirs
  | 'missed' // nobody answered
  | 'answered-elsewhere'
  | 'failed'
  | 'media-denied';

export interface CallState {
  phase: CallPhase;
  call: Call | null;
  direction: 'outgoing' | 'incoming' | null;
  media: CallMedia;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  local: MediaState;
  remote: MediaState;
  connectedAt: number | null;
  /** 'relay' once ICE settles on a TURN candidate. */
  route: 'direct' | 'relay' | null;
  endReason: EndReason | null;
  error: string | null;
  /** Which way my camera points; the self-view is mirrored only for 'user'. */
  facing: CameraFacing;
  /** True when this device has another camera to flip to. */
  canSwitchCamera: boolean;
  /** How my screen share trades quality when the connection is tight. */
  shareMode: ShareMode;
  /** The microphone I picked (a deviceId), or null for the system default. */
  micDeviceId: string | null;
  /** My share is sending its sound (a tab, or the whole screen on Windows). */
  shareSound: boolean;
  /**
   * The sound I was sharing stopped arriving — it ended, went silent at the
   * source, or my speakers changed under it. Sharing again picks it back up.
   */
  shareSoundLost: boolean;
  /** Bumped whenever tracks on either stream change, so views can re-bind. */
  revision: number;
}

const INITIAL: CallState = {
  phase: 'idle',
  call: null,
  direction: null,
  media: 'video',
  localStream: null,
  remoteStream: null,
  local: { mic: true, camera: false, screen: false },
  remote: { mic: true, camera: false, screen: false },
  connectedAt: null,
  route: null,
  endReason: null,
  error: null,
  facing: 'user',
  canSwitchCamera: false,
  shareMode: 'smooth',
  micDeviceId: null,
  shareSound: false,
  shareSoundLost: false,
  revision: 0,
};

const AUDIO_CONSTRAINTS: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: 'user',
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
};

const MAX_ICE_RESTARTS = 2;
const RECONNECT_GRACE_MS = 4000;

/**
 * One-to-one call state machine. Owns ringing, timeouts, call-row status,
 * the RTCPeerConnection and local media. Platform-agnostic: everything
 * platform-specific is injected via RtcAdapter.
 *
 * Negotiation is fixed-role (caller always offers), and both sides keep one
 * audio and one video transceiver in sendrecv for the whole call. Camera
 * on/off and screen sharing are therefore `replaceTrack` swaps that never
 * require renegotiation — including upgrading a voice call to video.
 */
export class CallManager {
  private state: CallState = INITIAL;
  private listeners = new Set<() => void>();
  private unsubscribe: () => void;

  private pc: RTCPeerConnection | null = null;
  private audioTx: RTCRtpTransceiver | null = null;
  private videoTx: RTCRtpTransceiver | null = null;
  private cameraTrack: MediaStreamTrack | null = null;
  private screenTrack: MediaStreamTrack | null = null;
  /** The shared screen's sound, and the mic + sound mix going out while sharing. */
  private screenAudio: MediaStreamTrack | null = null;
  private audioMix: { track: MediaStreamTrack; close: () => void } | null = null;
  /** The camera's send settings, put back when a share ends. */
  private cameraEncoding: RTCRtpEncodingParameters | null = null;
  /** I picked Smooth or Sharp myself this call, so a new share keeps my choice. */
  private shareModePicked = false;
  private pendingIce: RTCIceCandidateInit[] = [];
  private iceServers: Promise<RTCIceServer[]> | null = null;
  private iceRestarts = 0;
  private glareInvite: string | null = null;
  /** Web: the camera picked by the last flip, reused when the camera is turned back on. */
  private cameraDeviceId: string | null = null;
  private switching = false;

  private ringTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private lingerTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly opts: CallManagerOptions) {
    this.unsubscribe = opts.signaling.subscribe((env) => {
      this.onSignal(env).catch((e) => this.log('signal handling failed', env.type, e));
    });
  }

  // -- store interface (useSyncExternalStore-friendly) -----------------------

  getState = (): CallState => this.state;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  dispose() {
    this.unsubscribe();
    if (this.isBusy()) void this.hangup();
    this.teardown();
    this.listeners.clear();
  }

  // -- public actions ---------------------------------------------------------

  async startCall(media: CallMedia) {
    if (this.isBusy()) return;
    clearTimeout(this.lingerTimer);
    this.set({ ...INITIAL, phase: 'outgoing', direction: 'outgoing', media });
    this.prefetchIce();

    try {
      await this.acquireLocalMedia(media);
    } catch (e) {
      this.end('media-denied', mediaErrorCopy(e));
      return;
    }

    let call: Call;
    try {
      call = await this.opts.backend.createCall(media);
    } catch (e) {
      this.end('failed', 'Could not start the call. Check your connection.');
      return;
    }
    if (this.state.phase !== 'outgoing') {
      // Cancelled while the row was being created.
      void this.opts.backend.setStatus(call.id, 'missed');
      return;
    }
    this.set({ call });

    if (this.glareInvite) {
      const theirs = this.glareInvite;
      this.glareInvite = null;
      if (await this.resolveGlare(theirs)) return;
    }

    await this.send({ type: 'invite', callId: call.id, media });
    this.opts.backend.notify({ category: 'incoming_call', callId: call.id });

    this.ringTimer = setTimeout(() => void this.cancelOutgoing('missed'), this.opts.ringTimeoutMs ?? 45_000);
  }

  /** Surface a ringing call found out-of-band (push tap, app cold start). */
  async presentIncoming(call: Call) {
    if (call.callee_id !== this.opts.me || call.status !== 'ringing') return;
    if (this.state.call?.id === call.id) return;
    if (this.isBusy()) return;
    clearTimeout(this.lingerTimer);
    this.set({ ...INITIAL, phase: 'incoming', direction: 'incoming', media: call.media, call });
    this.prefetchIce();
    clearTimeout(this.ringTimer);
    this.ringTimer = setTimeout(() => {
      if (this.state.phase === 'incoming' && this.state.call?.id === call.id) this.end('missed');
    }, (this.opts.ringTimeoutMs ?? 45_000) + 5_000);
  }

  /**
   * Reconcile with the call row from Postgres Changes — the backstop for a
   * missed broadcast (e.g. caller cancelled while my socket was reconnecting).
   */
  syncFromRow(row: Call) {
    const { call, phase } = this.state;
    if (!call || call.id !== row.id) return;
    if (phase === 'incoming' && row.status !== 'ringing') {
      this.end(row.status === 'active' ? 'answered-elsewhere' : 'missed');
    } else if (phase === 'outgoing' && (row.status === 'declined' || row.status === 'missed')) {
      clearTimeout(this.ringTimer);
      this.end(row.status === 'declined' ? 'declined' : 'missed');
    } else if (this.isBusy() && phase !== 'outgoing' && phase !== 'incoming' && row.status === 'ended') {
      this.end('remote-hangup');
    }
  }

  async accept() {
    const { call, phase } = this.state;
    if (phase !== 'incoming' || !call) return;
    clearTimeout(this.ringTimer);
    this.set({ phase: 'connecting' });

    try {
      await this.acquireLocalMedia(call.media);
    } catch (e) {
      await this.opts.backend.setStatus(call.id, 'declined').catch(() => {});
      await this.send({ type: 'decline', callId: call.id });
      this.end('media-denied', mediaErrorCopy(e));
      return;
    }

    try {
      await this.opts.backend.setStatus(call.id, 'active');
    } catch {
      this.end('failed', 'That call is no longer available.');
      return;
    }
    // Build the peer before telling the caller, so their offer has somewhere to land.
    await this.createPeer();
    await this.send({ type: 'accept', callId: call.id });
  }

  async decline() {
    const { call, phase } = this.state;
    if (phase !== 'incoming' || !call) return;
    this.end('declined');
    await this.send({ type: 'decline', callId: call.id });
    await this.opts.backend.setStatus(call.id, 'declined').catch(() => {});
  }

  async hangup() {
    const { call, phase } = this.state;
    if (phase === 'outgoing') return this.cancelOutgoing('hangup');
    if (phase === 'incoming') return this.decline();
    if (!call || (phase !== 'connecting' && phase !== 'connected' && phase !== 'reconnecting')) return;
    this.end('hangup');
    await this.send({ type: 'hangup', callId: call.id });
    await this.opts.backend.setStatus(call.id, 'ended').catch(() => {});
  }

  /**
   * Speak through another microphone, mid-call. Muted stays muted, and a
   * share's sound stays mixed in. `null` goes back to the system default.
   */
  async setMicrophone(deviceId: string | null) {
    const stream = this.state.localStream;
    const old = stream?.getAudioTracks()[0];
    if (!stream || !old) return;
    let fresh: MediaStreamTrack | undefined;
    try {
      const got = await this.opts.rtc.getUserMedia({ audio: deviceId ? { ...AUDIO_CONSTRAINTS, deviceId: { exact: deviceId } } : AUDIO_CONSTRAINTS, video: false });
      fresh = got.getAudioTracks()[0];
    } catch (e) {
      this.log('microphone not switched', e);
    }
    if (!fresh || this.state.localStream !== stream) {
      fresh?.stop();
      return;
    }
    fresh.enabled = old.enabled;
    stream.removeTrack(old);
    stream.addTrack(fresh);
    old.stop();
    this.watchMic(fresh);
    if (this.audioMix && this.screenAudio) {
      this.audioMix.close();
      this.audioMix = this.opts.rtc.mixAudio!([fresh, this.screenAudio]);
      await this.audioTx?.sender.replaceTrack(this.audioMix.track);
    } else {
      await this.audioTx?.sender.replaceTrack(fresh);
    }
    this.set({ micDeviceId: deviceId, revision: this.state.revision + 1 });
  }

  /** A mic that's unplugged mid-call hands over to the default one. */
  private watchMic(track: MediaStreamTrack | undefined) {
    track?.addEventListener('ended', () => {
      if (this.state.localStream?.getAudioTracks()[0] === track) void this.setMicrophone(null);
    });
  }

  /**
   * My speakers changed while I share sound (say, to headphones). On some
   * systems the shared sound stays with the old ones, so my partner stops
   * hearing it; the UI offers to share again.
   */
  outputChanged() {
    if (this.state.shareSound) this.set({ shareSoundLost: true });
  }

  /** Stop and start my share, from a click: the browser asks what to share again. */
  async reshareScreen() {
    await this.stopScreenShare();
    await this.startScreenShare();
  }

  toggleMic() {
    const track = this.state.localStream?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    this.setLocal({ mic: track.enabled });
  }

  /** Camera off really stops the camera (light goes out); on re-acquires it. */
  async toggleCamera() {
    if (this.state.local.camera) {
      const track = this.cameraTrack;
      this.cameraTrack = null;
      if (track) {
        track.stop();
        this.state.localStream?.removeTrack(track);
      }
      if (!this.state.local.screen) await this.videoTx?.sender.replaceTrack(null);
      this.setLocal({ camera: false });
      return;
    }
    try {
      const track = await this.openCamera();
      if (!track) return;
      this.cameraTrack = track;
      this.state.localStream?.addTrack(track);
      if (!this.state.local.screen) await this.videoTx?.sender.replaceTrack(track);
      this.setLocal({ camera: true });
      void this.refreshCameraOptions();
    } catch (e) {
      this.set({ error: mediaErrorCopy(e) });
    }
  }

  /**
   * Flip to the other camera. Mobile flips the live track in place; web opens
   * the next camera and swaps it onto the same sender (no renegotiation).
   */
  async switchCamera() {
    const old = this.cameraTrack;
    if (!old || this.switching) return;
    const next: CameraFacing = this.state.facing === 'user' ? 'environment' : 'user';

    if (this.opts.rtc.switchCamera) {
      await this.opts.rtc.switchCamera(old, next);
      this.set({ facing: next, revision: this.state.revision + 1 });
      return;
    }

    const cams = (await this.opts.rtc.listCameras?.().catch(() => [])) ?? [];
    if (cams.length < 2) return;
    const current = old.getSettings?.().deviceId;
    const target = cams[(cams.findIndex((c) => c.deviceId === current) + 1) % cams.length]!;

    this.switching = true;
    try {
      // Release the current camera first: many phones can't open two at once.
      old.stop();
      this.state.localStream?.removeTrack(old);
      let fresh: MediaStreamTrack | null = null;
      try {
        fresh = await this.openCamera(target.deviceId);
        this.cameraDeviceId = target.deviceId;
      } catch {
        fresh = await this.openCamera(current).catch(() => null); // put the old one back
      }
      this.cameraTrack = fresh;
      if (fresh) this.state.localStream?.addTrack(fresh);
      if (!this.state.local.screen) await this.videoTx?.sender.replaceTrack(fresh);
      const facing = fresh ? facingOf(fresh, cams.find((c) => c.deviceId === fresh!.getSettings?.().deviceId)?.label) : this.state.facing;
      this.set({ facing, revision: this.state.revision + 1 });
      if (!fresh) this.setLocal({ camera: false });
    } finally {
      this.switching = false;
    }
  }

  /** Open a camera track: a specific device (web flip), else the current facing. */
  private async openCamera(deviceId?: string | null): Promise<MediaStreamTrack | null> {
    const id = deviceId ?? this.cameraDeviceId;
    const video: MediaTrackConstraints = id
      ? { ...VIDEO_CONSTRAINTS, facingMode: undefined, deviceId: { exact: id } }
      : { ...VIDEO_CONSTRAINTS, facingMode: this.state.facing };
    const stream = await this.opts.rtc.getUserMedia({ video, audio: false });
    return stream.getVideoTracks()[0] ?? null;
  }

  private async refreshCameraOptions() {
    if (this.opts.rtc.switchCamera) {
      if (!this.state.canSwitchCamera) this.set({ canSwitchCamera: true });
      return;
    }
    // Device labels (and the full list) are only available once permission is granted.
    const cams = (await this.opts.rtc.listCameras?.().catch(() => [])) ?? [];
    if (cams.length > 1 !== this.state.canSwitchCamera) this.set({ canSwitchCamera: cams.length > 1 });
  }

  get canScreenShare() {
    return Boolean(this.opts.rtc.getDisplayMedia);
  }

  async startScreenShare() {
    if (!this.opts.rtc.getDisplayMedia || this.state.local.screen) return;
    if (this.state.phase !== 'connected' && this.state.phase !== 'reconnecting') return;
    let display: MediaStream;
    try {
      display = await this.opts.rtc.getDisplayMedia();
    } catch {
      return; // user dismissed the picker
    }
    const track = display.getVideoTracks()[0];
    if (!track) return;
    track.addEventListener('ended', () => void this.stopScreenShare());
    this.screenTrack = track;
    this.cameraEncoding = { ...(this.videoTx?.sender.getParameters?.().encodings?.[0] ?? {}) };
    const sound = display.getAudioTracks()[0];
    if (!this.shareModePicked) {
      // A tab or anything with sound is usually a video playing; a window or screen is usually text.
      const surface = (track.getSettings?.() as { displaySurface?: string } | undefined)?.displaySurface;
      this.set({ shareMode: sound || surface === 'browser' ? 'smooth' : 'sharp' });
    }
    await this.videoTx?.sender.replaceTrack(track);
    await this.applyShareQuality();
    const mic = this.state.localStream?.getAudioTracks()[0];
    if (sound && mic && this.opts.rtc.mixAudio) {
      // Muting still works: a disabled mic track feeds the mix silence.
      this.screenAudio = sound;
      this.audioMix = this.opts.rtc.mixAudio([mic, sound]);
      await this.audioTx?.sender.replaceTrack(this.audioMix.track);
      await this.setAudioBitrate(SHARE_AUDIO_BITRATE);
      const lost = () => {
        if (this.screenAudio === sound) this.set({ shareSoundLost: true });
      };
      sound.addEventListener('ended', lost);
      sound.addEventListener('mute', lost);
      sound.addEventListener('unmute', () => {
        if (this.screenAudio === sound) this.set({ shareSoundLost: false });
      });
      this.set({ shareSound: true, shareSoundLost: false });
    } else sound?.stop();
    this.setLocal({ screen: true });
  }

  async stopScreenShare() {
    if (!this.screenTrack) return;
    this.screenTrack.stop();
    this.screenTrack = null;
    await this.videoTx?.sender.replaceTrack(this.cameraTrack ?? null);
    const camera = this.cameraEncoding;
    this.cameraEncoding = null;
    if (camera) await this.updateEncoding(this.videoTx, () => camera, {});
    if (this.audioMix) {
      await this.audioTx?.sender.replaceTrack(this.state.localStream?.getAudioTracks()[0] ?? null);
      await this.setAudioBitrate(VOICE_BITRATE);
    }
    this.stopScreenAudio();
    this.setLocal({ screen: false });
  }

  /** Switch my running share between Smooth and Sharp. */
  async setShareMode(mode: ShareMode) {
    this.shareModePicked = true;
    if (mode === this.state.shareMode) return;
    this.set({ shareMode: mode });
    await this.applyShareQuality();
  }

  /** Resolution and frame rate my shared screen is going out at right now. */
  async screenStats(): Promise<ScreenStats | null> {
    if (!this.screenTrack || !this.pc) return null;
    try {
      const stats = await this.pc.getStats();
      let out: ScreenStats | null = null;
      stats.forEach(
        (r: { type: string; kind?: string; frameHeight?: number; framesPerSecond?: number; qualityLimitationReason?: string }) => {
          if (r.type === 'outbound-rtp' && r.kind === 'video')
            out = { height: r.frameHeight ?? null, fps: r.framesPerSecond ?? null, limitedByNetwork: r.qualityLimitationReason === 'bandwidth' };
        },
      );
      return out;
    } catch {
      return null;
    }
  }

  private async applyShareQuality() {
    const track = this.screenTrack;
    if (!track) return;
    const q = SHARE_QUALITY[this.state.shareMode];
    if ('contentHint' in track) track.contentHint = q.hint;
    await track
      .applyConstraints?.({ width: { max: q.width }, height: { max: q.height }, frameRate: { ideal: q.fps, max: q.fps } })
      .catch(() => {});
    await this.updateEncoding(
      this.videoTx,
      (e) => ({ ...e, maxBitrate: q.maxBitrate, maxFramerate: q.fps, priority: 'high', networkPriority: 'high' }),
      { degradationPreference: q.degradation },
    );
    // Separately, so a browser that refuses these still keeps the settings above.
    // VP9 keeps text far sharper than the default VP8; L1T3 drops frames, not detail, on a lossy link.
    // The camera's own settings, put back when the share ends, carry no codec, so it returns to the default.
    const vp9 = this.shareCodec();
    await this.updateEncoding(this.videoTx, (e) => ({ ...e, ...(vp9 ? { codec: vp9 } : {}), scalabilityMode: 'L1T3' }), {});
  }

  /** VP9 (8-bit profile 0), when both sides negotiated it. */
  private shareCodec(): RTCRtpCodec | undefined {
    const codecs = this.videoTx?.sender.getParameters?.().codecs ?? [];
    return codecs.find((c) => c.mimeType.toLowerCase() === 'video/vp9' && !/profile-id=[1-3]/.test(c.sdpFmtpLine ?? ''));
  }

  private async setAudioBitrate(maxBitrate: number) {
    await this.updateEncoding(this.audioTx, (e) => ({ ...e, maxBitrate }), {});
  }

  /** setParameters is optional on some platforms; quality settings must never break a call. */
  private async updateEncoding(
    tx: RTCRtpTransceiver | null,
    encoding: (e: RTCRtpEncodingParameters) => RTCRtpEncodingParameters,
    extra: Partial<RTCRtpSendParameters>,
  ) {
    const sender = tx?.sender;
    if (!sender?.getParameters || !sender.setParameters) return;
    try {
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      params.encodings[0] = encoding(params.encodings[0]!);
      await sender.setParameters({ ...params, ...extra });
    } catch (e) {
      this.log('encoding not applied', e);
    }
  }

  private stopScreenAudio() {
    this.audioMix?.close();
    this.screenAudio?.stop();
    this.audioMix = this.screenAudio = null;
    if (this.state.shareSound || this.state.shareSoundLost) this.set({ shareSound: false, shareSoundLost: false });
  }

  /** The track to show as my self-view (screen while sharing, else camera). */
  get selfViewTrack(): MediaStreamTrack | null {
    return this.screenTrack ?? this.cameraTrack;
  }

  // -- signaling ------------------------------------------------------------

  private async onSignal(env: SignalEnvelope) {
    const fromMe = env.from === this.opts.me;
    const fromPartner = env.from === this.opts.partnerId;
    if (!fromMe && !fromPartner) return;
    const current = this.state.call;

    // My other device answered or declined the call ringing here.
    if (fromMe) {
      if ((env.type === 'accept' || env.type === 'decline') && current?.id === env.callId && this.state.phase === 'incoming') {
        this.end('answered-elsewhere');
      }
      return;
    }

    switch (env.type) {
      case 'invite': {
        if (this.state.phase === 'outgoing') {
          // Glare: we both called at once. Resolve once my own call id exists.
          if (current) await this.resolveGlare(env.callId);
          else this.glareInvite = env.callId;
          return;
        }
        if (this.isBusy()) return; // they'll time out; we're on another call
        const call = await this.opts.backend.getCall(env.callId);
        if (call) await this.presentIncoming(call);
        return;
      }
      case 'cancel':
        if (current?.id === env.callId && this.state.phase === 'incoming') this.end('missed');
        return;
      case 'decline':
        if (current?.id === env.callId && this.state.phase === 'outgoing') {
          clearTimeout(this.ringTimer);
          this.end('declined');
        }
        return;
      case 'accept':
        if (current?.id === env.callId && this.state.phase === 'outgoing') {
          clearTimeout(this.ringTimer);
          this.set({ phase: 'connecting' });
          await this.createPeer();
          await this.makeOffer();
        }
        return;
      case 'hangup':
        if (current?.id === env.callId && this.isBusy()) this.end('remote-hangup');
        return;
      case 'sdp':
        if (current?.id === env.callId) await this.onRemoteDescription(env.description);
        return;
      case 'ice':
        if (current?.id === env.callId) await this.onRemoteCandidate(env.candidate);
        return;
      case 'media-state':
        if (current?.id === env.callId) this.set({ remote: env.state });
        return;
    }
  }

  private async send(event: SignalEvent) {
    try {
      await this.opts.signaling.send(event);
    } catch (e) {
      this.log('signal send failed', event.type, e);
    }
  }

  // -- peer connection --------------------------------------------------------

  private prefetchIce() {
    this.iceServers ??= this.opts.backend.iceServers().catch(() => []);
  }

  private async acquireLocalMedia(media: CallMedia) {
    if (this.state.localStream) return;
    const stream = await this.opts.rtc.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
      video: media === 'video' ? VIDEO_CONSTRAINTS : false,
    });
    this.cameraTrack = stream.getVideoTracks()[0] ?? null;
    this.watchMic(stream.getAudioTracks()[0]);
    this.set({ localStream: stream });
    this.setLocal({ mic: true, camera: Boolean(this.cameraTrack), screen: false }, false);
    void this.refreshCameraOptions();
  }

  private async createPeer() {
    if (this.pc) return;
    this.prefetchIce();
    const iceServers = (await this.iceServers) ?? [];
    const pc = new this.opts.rtc.RTCPeerConnection({
      iceServers,
      iceTransportPolicy: this.opts.forceRelay ? 'relay' : 'all',
    });
    this.pc = pc;
    this.iceRestarts = 0;

    pc.addEventListener('icecandidate', (e: RTCPeerConnectionIceEvent) => {
      const c = e.candidate;
      const callId = this.state.call?.id;
      if (!c || !callId) return;
      void this.send({
        type: 'ice',
        callId,
        candidate: { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex },
      });
    });

    pc.addEventListener('track', (e: RTCTrackEvent) => {
      let remote = this.state.remoteStream;
      if (!remote) remote = new this.opts.rtc.MediaStream();
      if (!remote.getTracks().some((t) => t.id === e.track.id)) remote.addTrack(e.track);
      this.set({ remoteStream: remote, revision: this.state.revision + 1 });
    });

    pc.addEventListener('connectionstatechange', () => this.onConnectionState(pc.connectionState));

    if (this.state.direction === 'outgoing') {
      // Caller defines the transceivers; the callee's are created by the offer.
      const stream = this.state.localStream!;
      const audio = stream.getAudioTracks()[0];
      this.audioTx = pc.addTransceiver(audio ?? 'audio', { direction: 'sendrecv', streams: [stream] });
      this.videoTx = pc.addTransceiver(this.cameraTrack ?? 'video', { direction: 'sendrecv', streams: [stream] });
    }
  }

  private async makeOffer(iceRestart = false) {
    const pc = this.pc;
    const callId = this.state.call?.id;
    if (!pc || !callId) return;
    const created = await pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
    const offer = { type: created.type, sdp: opusForMedia(created.sdp ?? '') };
    await pc.setLocalDescription(offer);
    await this.send({ type: 'sdp', callId, description: { type: offer.type, sdp: offer.sdp } });
  }

  private async onRemoteDescription(description: RTCSessionDescriptionInit) {
    if (!this.pc) await this.createPeer();
    const pc = this.pc!;
    await pc.setRemoteDescription(description);

    if (description.type === 'offer') {
      if (!this.audioTx || !this.videoTx) this.bindCalleeTransceivers(pc);
      const created = await pc.createAnswer();
      const answer = { type: created.type, sdp: opusForMedia(created.sdp ?? '') };
      await pc.setLocalDescription(answer);
      const callId = this.state.call!.id;
      await this.send({ type: 'sdp', callId, description: { type: answer.type, sdp: answer.sdp } });
    }

    const queued = this.pendingIce.splice(0);
    for (const c of queued) await pc.addIceCandidate(c).catch((e) => this.log('queued ice rejected', e));
  }

  private bindCalleeTransceivers(pc: RTCPeerConnection) {
    const stream = this.state.localStream!;
    for (const t of pc.getTransceivers()) {
      const kind = t.receiver.track?.kind;
      if (kind === 'audio' && !this.audioTx) this.audioTx = t;
      if (kind === 'video' && !this.videoTx) this.videoTx = t;
    }
    const audio = stream.getAudioTracks()[0] ?? null;
    for (const [tx, track] of [
      [this.audioTx, audio],
      [this.videoTx, this.cameraTrack],
    ] as const) {
      if (!tx) continue;
      tx.direction = 'sendrecv';
      void tx.sender.replaceTrack(track);
      tx.sender.setStreams?.(stream);
    }
  }

  private async onRemoteCandidate(candidate: RTCIceCandidateInit) {
    const pc = this.pc;
    if (!pc || !pc.remoteDescription) {
      this.pendingIce.push(candidate);
      return;
    }
    await pc.addIceCandidate(candidate).catch((e) => this.log('ice rejected', e));
  }

  private onConnectionState(s: RTCPeerConnectionState) {
    this.log('connection', s);
    if (!this.isBusy()) return;
    clearTimeout(this.reconnectTimer);

    if (s === 'connected') {
      this.iceRestarts = 0;
      this.set({ phase: 'connected', connectedAt: this.state.connectedAt ?? Date.now() });
      this.broadcastMediaState();
      void this.detectRoute();
      if (!this.audioMix) void this.setAudioBitrate(VOICE_BITRATE);
    } else if (s === 'disconnected') {
      this.set({ phase: 'reconnecting' });
      this.reconnectTimer = setTimeout(() => this.restartIce(), RECONNECT_GRACE_MS);
    } else if (s === 'failed') {
      this.set({ phase: 'reconnecting' });
      this.restartIce();
    }
  }

  private restartIce() {
    if (this.iceRestarts >= MAX_ICE_RESTARTS) {
      void this.hangupAfterFailure();
      return;
    }
    this.iceRestarts += 1;
    // Fixed roles: only the caller re-offers. The callee just waits for it.
    if (this.state.direction === 'outgoing') void this.makeOffer(true);
    this.reconnectTimer = setTimeout(() => {
      if (this.state.phase === 'reconnecting') this.restartIce();
    }, 10_000);
  }

  private async hangupAfterFailure() {
    const call = this.state.call;
    this.end('failed', 'The connection dropped.');
    if (call) {
      await this.send({ type: 'hangup', callId: call.id });
      await this.opts.backend.setStatus(call.id, 'ended').catch(() => {});
    }
  }

  private async detectRoute() {
    try {
      const stats = await this.pc!.getStats();
      let pair: { localCandidateId?: string } | undefined;
      stats.forEach((r: { type: string; selectedCandidatePairId?: string }) => {
        if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId);
      });
      if (!pair) {
        stats.forEach((r: { type: string; nominated?: boolean; state?: string; localCandidateId?: string }) => {
          if (!pair && r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r;
        });
      }
      const local = pair?.localCandidateId ? stats.get(pair.localCandidateId) : undefined;
      if (local) this.set({ route: local.candidateType === 'relay' ? 'relay' : 'direct' });
    } catch {
      // stats are informational only
    }
  }

  // -- helpers ----------------------------------------------------------------

  /**
   * Both partners pressed call at the same moment. The lower call id wins on
   * both devices; the loser drops its own call and answers the winner's,
   * reusing the media it already acquired. Returns true if I yielded.
   */
  private async resolveGlare(theirCallId: string): Promise<boolean> {
    const mine = this.state.call;
    if (!mine || this.state.phase !== 'outgoing' || theirCallId >= mine.id) return false;
    const incoming = await this.opts.backend.getCall(theirCallId);
    if (!incoming || incoming.status !== 'ringing') return false;
    clearTimeout(this.ringTimer);
    void this.opts.backend.setStatus(mine.id, 'missed');
    this.set({ phase: 'incoming', direction: 'incoming', call: incoming, media: incoming.media });
    await this.accept();
    return true;
  }

  private async cancelOutgoing(reason: EndReason) {
    const call = this.state.call;
    clearTimeout(this.ringTimer);
    this.end(reason === 'hangup' ? 'hangup' : 'missed');
    if (call) {
      await this.send({ type: 'cancel', callId: call.id });
      await this.opts.backend.setStatus(call.id, 'missed').catch(() => {});
      this.opts.backend.notify({ category: 'call_ended', callId: call.id });
    }
  }

  private isBusy() {
    const p = this.state.phase;
    return p === 'outgoing' || p === 'incoming' || p === 'connecting' || p === 'connected' || p === 'reconnecting';
  }

  private setLocal(patch: Partial<MediaState>, broadcast = true) {
    this.set({ local: { ...this.state.local, ...patch }, revision: this.state.revision + 1 });
    if (broadcast) this.broadcastMediaState();
  }

  private broadcastMediaState() {
    const callId = this.state.call?.id;
    if (callId && this.pc) void this.send({ type: 'media-state', callId, state: this.state.local });
  }

  private end(reason: EndReason, error: string | null = null) {
    this.teardown();
    this.set({ phase: 'ended', endReason: reason, error, localStream: null, remoteStream: null });
    this.lingerTimer = setTimeout(() => {
      if (this.state.phase === 'ended') this.set({ ...INITIAL });
    }, this.opts.endedLingerMs ?? 2400);
  }

  private teardown() {
    clearTimeout(this.ringTimer);
    clearTimeout(this.reconnectTimer);
    this.state.localStream?.getTracks().forEach((t) => t.stop());
    this.cameraTrack?.stop();
    this.screenTrack?.stop();
    this.cameraTrack = this.screenTrack = null;
    this.cameraEncoding = null;
    this.shareModePicked = false;
    this.stopScreenAudio();
    this.pc?.close();
    this.pc = null;
    this.audioTx = this.videoTx = null;
    this.pendingIce = [];
    this.iceServers = null;
    this.glareInvite = null;
    this.cameraDeviceId = null;
  }

  private set(patch: Partial<CallState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of [...this.listeners]) fn();
  }

  private log(...args: unknown[]) {
    (this.opts.log ?? (() => {}))('[call]', ...args);
  }
}

/** Best guess at which way a camera faces (browsers often leave facingMode unset on laptops). */
function facingOf(track: MediaStreamTrack, label = ''): CameraFacing {
  const f = track.getSettings?.().facingMode;
  if (f === 'environment' || f === 'user') return f;
  return /back|rear|environment/i.test(label || track.label || '') ? 'environment' : 'user';
}

function mediaErrorCopy(e: unknown): string {
  const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Us needs microphone (and camera) access for calls. You can allow it in your settings.';
  if (name === 'NotFoundError') return "We couldn't find a microphone or camera.";
  if (name === 'NotReadableError') return 'Your camera or microphone is being used by another app.';
  return 'Could not start your microphone or camera.';
}
