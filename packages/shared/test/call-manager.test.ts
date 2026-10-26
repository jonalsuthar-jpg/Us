import { describe, expect, it, vi } from 'vitest';
import type { Call, CallMedia, CallStatus } from '../src/database.types';
import type { SignalEnvelope } from '../src/realtime/couple-channel';
import { CallManager, opusForMedia, type CallPhase, type RtcAdapter } from '../src/webrtc/call-manager';

// ---------------------------------------------------------------------------
// Fakes: just enough WebRTC surface for the state machine to run end-to-end.
// ---------------------------------------------------------------------------

class FakeTrack {
  enabled = true;
  stopped = false;
  id = Math.random().toString(36).slice(2);
  label = '';
  constructor(
    readonly kind: 'audio' | 'video',
    readonly deviceId = 'default',
  ) {}
  displaySurface?: string;
  getSettings() {
    return { deviceId: this.deviceId, displaySurface: this.displaySurface };
  }
  stop() {
    this.stopped = true;
  }
  contentHint = '';
  constraints: unknown = null;
  async applyConstraints(c: unknown) {
    this.constraints = c;
  }
  private handlers: Record<string, (() => void)[]> = {};
  addEventListener(type: string, fn: () => void) {
    (this.handlers[type] ??= []).push(fn);
  }
  emit(type: string) {
    this.handlers[type]?.forEach((fn) => fn());
  }
}

class FakeStream {
  tracks: FakeTrack[];
  constructor(tracks: FakeTrack[] = []) {
    this.tracks = [...tracks];
  }
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  addTrack(t: FakeTrack) {
    this.tracks.push(t);
  }
  removeTrack(t: FakeTrack) {
    this.tracks = this.tracks.filter((x) => x !== t);
  }
}

class FakeTransceiver {
  direction = 'recvonly';
  params: {
    encodings: Record<string, unknown>[];
    degradationPreference?: string;
    codecs?: { mimeType: string; clockRate: number; sdpFmtpLine?: string }[];
  } = { encodings: [{}] };
  sender = {
    track: null as FakeTrack | null,
    replaceTrack: async (t: FakeTrack | null) => void (this.sender.track = t),
    getParameters: () => structuredClone(this.params),
    setParameters: async (p: typeof this.params) => void (this.params = structuredClone(p)),
  };
  receiver: { track: FakeTrack };
  constructor(kind: 'audio' | 'video') {
    this.receiver = { track: new FakeTrack(kind) };
  }
}

/** Two fake PCs "connect" once both have local + remote descriptions. */
class FakePC {
  connectionState = 'new';
  localDescription: unknown = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  transceivers: FakeTransceiver[] = [];
  private handlers: Record<string, ((e: unknown) => void)[]> = {};
  closed = false;

  constructor(readonly config: RTCConfiguration) {}
  addEventListener(name: string, fn: (e: unknown) => void) {
    (this.handlers[name] ??= []).push(fn);
  }
  emit(name: string, e: unknown = {}) {
    this.handlers[name]?.forEach((fn) => fn(e));
  }
  addTransceiver(trackOrKind: FakeTrack | 'audio' | 'video', init: { direction: string }) {
    const kind = typeof trackOrKind === 'string' ? trackOrKind : trackOrKind.kind;
    const t = new FakeTransceiver(kind);
    t.direction = init.direction;
    if (typeof trackOrKind !== 'string') t.sender.track = trackOrKind;
    this.transceivers.push(t);
    return t;
  }
  getTransceivers() {
    return this.transceivers;
  }
  async createOffer() {
    return { type: 'offer', sdp: `offer:${this.transceivers.length}` };
  }
  async createAnswer() {
    return { type: 'answer', sdp: 'answer' };
  }
  async setLocalDescription(d: unknown) {
    this.localDescription = d;
    this.emit('icecandidate', { candidate: { candidate: 'c1', sdpMid: '0', sdpMLineIndex: 0 } });
    this.maybeConnect();
  }
  async setRemoteDescription(d: { type: string; sdp: string }) {
    this.remoteDescription = d;
    if (d.type === 'offer') {
      const count = Number(d.sdp.split(':')[1] ?? 2);
      const kinds: ('audio' | 'video')[] = ['audio', 'video'];
      for (let i = 0; i < count; i++) this.transceivers.push(new FakeTransceiver(kinds[i]!));
    }
    for (const t of this.transceivers) this.emit('track', { track: t.receiver.track, streams: [] });
    this.maybeConnect();
  }
  async addIceCandidate() {}
  async getStats() {
    return new Map([
      ['t', { type: 'transport', selectedCandidatePairId: 'p' }],
      ['p', { type: 'candidate-pair', localCandidateId: 'l' }],
      ['l', { type: 'local-candidate', candidateType: 'relay' }],
    ]);
  }
  close() {
    this.closed = true;
  }
  private maybeConnect() {
    if (this.localDescription && this.remoteDescription && this.connectionState !== 'connected') {
      this.connectionState = 'connected';
      queueMicrotask(() => this.emit('connectionstatechange'));
    }
  }
}

const rtc = {
  RTCPeerConnection: FakePC,
  MediaStream: FakeStream,
  getUserMedia: async (c: MediaStreamConstraints) =>
    new FakeStream([new FakeTrack('audio'), ...(c.video ? [new FakeTrack('video')] : [])]),
} as unknown as RtcAdapter;

/** A Realtime-like bus: broadcast is delivered to everyone except the sender's client. */
function makeWorld() {
  const clients = new Set<{ id: number; fn: (e: SignalEnvelope) => void }>();
  let nextClient = 0;
  const calls = new Map<string, Call>();
  let callSeq = 0;
  const statusLog: [string, CallStatus][] = [];
  const pushes: string[] = [];

  function backendFor(me: string, partner: string) {
    return {
      createCall: async (media: CallMedia) => {
        const call: Call = {
          id: `call-${++callSeq}`,
          couple_id: 'c',
          caller_id: me,
          callee_id: partner,
          media,
          status: 'ringing',
          created_at: new Date().toISOString(),
          answered_at: null,
          ended_at: null,
        };
        calls.set(call.id, call);
        return call;
      },
      setStatus: async (id: string, status: CallStatus) => {
        statusLog.push([id, status]);
        const c = calls.get(id)!;
        calls.set(id, { ...c, status });
      },
      getCall: async (id: string) => calls.get(id) ?? null,
      iceServers: async () => [{ urls: 'turn:example' }],
      notify: (req: { category: string }) => void pushes.push(req.category),
    };
  }

  function manager(me: string, partner: string, extra: { ringTimeoutMs?: number; rtc?: Partial<RtcAdapter> } = {}) {
    const { rtc: rtcExtra, ...rest } = extra;
    const clientId = nextClient++;
    const owned: FakePC[] = [];
    const m = new CallManager({
      me,
      partnerId: partner,
      rtc: {
        ...rtc,
        RTCPeerConnection: class extends FakePC {
          constructor(c: RTCConfiguration) {
            super(c);
            owned.push(this);
          }
        },
        ...rtcExtra,
      } as unknown as RtcAdapter,
      endedLingerMs: 10,
      ...rest,
      backend: backendFor(me, partner),
      signaling: {
        send: async (event) => {
          const env = { ...event, from: me } as SignalEnvelope;
          for (const c of clients) if (c.id !== clientId) queueMicrotask(() => c.fn(env));
        },
        subscribe: (fn) => {
          const entry = { id: clientId, fn };
          clients.add(entry);
          return () => void clients.delete(entry);
        },
      },
    });
    pcsOf.set(m, owned);
    return m;
  }

  return { manager, calls, statusLog, pushes };
}

const pcsOf = new WeakMap<CallManager, FakePC[]>();
const pcOf = (m: CallManager) => pcsOf.get(m)!.at(-1)!;

async function until(m: CallManager, phase: CallPhase, timeout = 500) {
  const start = Date.now();
  while (m.getState().phase !== phase) {
    if (Date.now() - start > timeout) throw new Error(`expected ${phase}, still ${m.getState().phase}`);
    await new Promise((r) => setTimeout(r, 2));
  }
}

describe('CallManager', () => {
  it('rings, answers and connects both sides', async () => {
    const w = makeWorld();
    const alice = w.manager('alice', 'bob');
    const bob = w.manager('bob', 'alice');

    await alice.startCall('video');
    expect(alice.getState().phase).toBe('outgoing');
    expect(w.pushes).toContain('incoming_call');

    await until(bob, 'incoming');
    expect(bob.getState().call?.caller_id).toBe('alice');

    await bob.accept();
    await until(alice, 'connected');
    await until(bob, 'connected');

    expect(alice.getState().remoteStream?.getTracks().length).toBe(2);
    expect(bob.getState().remoteStream?.getTracks().length).toBe(2);
    expect(w.statusLog).toContainEqual(['call-1', 'active']);
    await vi.waitFor(() => expect(alice.getState().route).toBe('relay'));

    // Callee's local tracks were bound to the offer-created transceivers.
    const bobPc = pcOf(bob);
    expect(bobPc.transceivers.length).toBe(2);
    expect(bobPc.transceivers.every((t) => t.direction === 'sendrecv' && t.sender.track)).toBe(true);

    await alice.hangup();
    await until(bob, 'ended');
    expect(bob.getState().endReason).toBe('remote-hangup');
    expect(w.statusLog).toContainEqual(['call-1', 'ended']);
  });

  it('voice calls keep a video transceiver so the camera can be turned on later', async () => {
    const w = makeWorld();
    const alice = w.manager('alice', 'bob');
    const bob = w.manager('bob', 'alice');
    await alice.startCall('audio');
    await until(bob, 'incoming');
    await bob.accept();
    await until(alice, 'connected');

    const alicePc = pcOf(alice);
    const video = alicePc.transceivers.find((t) => t.receiver.track.kind === 'video')!;
    expect(video.sender.track).toBeNull();
    await alice.toggleCamera();
    expect(video.sender.track?.kind).toBe('video');
    expect(alice.getState().local.camera).toBe(true);
    await until(bob, 'connected');
    await vi.waitFor(() => expect(bob.getState().remote.camera).toBe(true));
  });

  it("a shared screen's sound goes out mixed with the mic, and the mic alone returns after", async () => {
    const w = makeWorld();
    const screen = new FakeStream([new FakeTrack('video'), new FakeTrack('audio')]);
    const mixed = new FakeTrack('audio');
    const close = vi.fn();
    const mixAudio = vi.fn(() => ({ track: mixed, close }));
    const alice = w.manager('alice', 'bob', { rtc: { getDisplayMedia: async () => screen, mixAudio } as never });
    const bob = w.manager('bob', 'alice');
    await alice.startCall('audio');
    await until(bob, 'incoming');
    await bob.accept();
    await until(alice, 'connected');

    const audio = pcOf(alice).transceivers.find((t) => t.receiver.track.kind === 'audio')!;
    const mic = audio.sender.track;
    await alice.startScreenShare();
    expect(mixAudio).toHaveBeenCalledWith([mic, screen.tracks[1]]);
    expect(audio.sender.track).toBe(mixed);

    await alice.stopScreenShare();
    expect(audio.sender.track).toBe(mic);
    expect(close).toHaveBeenCalled();
    expect(screen.tracks[1]!.stopped).toBe(true);
  });

  it('listen together: mics start muted, the picked sound goes out on connect with no picture, and pauses for both', async () => {
    const w = makeWorld();
    const tab = new FakeStream([new FakeTrack('video'), new FakeTrack('audio')]);
    const mixed = new FakeTrack('audio');
    const close = vi.fn();
    const mixAudio = vi.fn(() => ({ track: mixed, close }));
    const alice = w.manager('alice', 'bob', { rtc: { getDisplayMedia: async () => tab, mixAudio } as never });
    const bob = w.manager('bob', 'alice');

    await alice.startSession('listen', tab as unknown as MediaStream);
    expect(w.calls.get(alice.getState().call!.id)!.media).toBe('listen');
    expect(alice.getState().local.mic).toBe(false);
    expect(alice.getState().localStream!.getAudioTracks()[0]!.enabled).toBe(false);
    await until(bob, 'incoming');
    await bob.accept();
    expect(bob.getState().local.mic).toBe(false);
    await until(alice, 'connected');
    await vi.waitFor(() => expect(alice.getState().local.sound).toBe(true));

    const audio = pcOf(alice).transceivers.find((t) => t.receiver.track.kind === 'audio')!;
    const video = pcOf(alice).transceivers.find((t) => t.receiver.track.kind === 'video')!;
    expect(audio.sender.track).toBe(mixed);
    expect(video.sender.track).toBeNull(); // sound only
    expect(tab.tracks[0]!.enabled).toBe(false);
    expect(alice.getState().local.screen).toBe(false);
    await vi.waitFor(() => expect(bob.getState().remote.sound).toBe(true));

    alice.setNowPlaying('  Late night lo-fi  ');
    alice.setSoundPaused(true);
    expect(tab.tracks[1]!.enabled).toBe(false);
    await vi.waitFor(() => expect(bob.getState().remote).toMatchObject({ soundPaused: true, nowPlaying: 'Late night lo-fi' }));

    // Pausing on my side only: their sound keeps going out.
    bob.setHearing(false);
    expect(bob.getState().hearing).toBe(false);
    expect(bob.getState().remoteStream!.getAudioTracks().every((t) => !t.enabled)).toBe(true);

    // The browser's own "Stop sharing" ends the share, and the mic alone returns.
    (tab.tracks[0] as FakeTrack).emit('ended');
    await vi.waitFor(() => expect(alice.getState().local.sound).toBe(false));
    expect(audio.sender.track).toBe(alice.getState().localStream!.getAudioTracks()[0]);
    expect(close).toHaveBeenCalled();
    expect(tab.tracks[1]!.stopped).toBe(true);
  });

  it('listen together: a pick with no sound says so and shares nothing', async () => {
    const w = makeWorld();
    const silent = new FakeStream([new FakeTrack('video')]);
    const alice = w.manager('alice', 'bob', { rtc: { getDisplayMedia: async () => silent, mixAudio: vi.fn() } as never });
    const bob = w.manager('bob', 'alice');
    await alice.startSession('listen');
    await until(bob, 'incoming');
    await bob.accept();
    await until(alice, 'connected');
    expect(await alice.startSoundShare()).toBe(false);
    expect(alice.getState().local.sound).toBe(false);
    expect(alice.getState().error).toMatch(/No sound/);
    expect(silent.tracks[0]!.stopped).toBe(true);
  });

  it('watch together: the screen picked before ringing goes out on connect, mic on', async () => {
    const w = makeWorld();
    const screen = new FakeStream([new FakeTrack('video')]);
    const alice = w.manager('alice', 'bob', { rtc: { getDisplayMedia: async () => screen } as never });
    const bob = w.manager('bob', 'alice');
    await alice.startSession('watch', screen as unknown as MediaStream);
    expect(alice.getState().local.mic).toBe(true);
    await until(bob, 'incoming');
    expect(bob.getState().media).toBe('watch');
    await bob.accept();
    await until(alice, 'connected');
    await vi.waitFor(() => expect(alice.getState().local.screen).toBe(true));
    const video = pcOf(alice).transceivers.find((t) => t.receiver.track.kind === 'video')!;
    expect(video.sender.track).toBe(screen.tracks[0]);
    await vi.waitFor(() => expect(bob.getState().remote.screen).toBe(true));
  });

  it('a session declined before connecting lets go of what was picked', async () => {
    const w = makeWorld();
    const tab = new FakeStream([new FakeTrack('video'), new FakeTrack('audio')]);
    const alice = w.manager('alice', 'bob', { rtc: { getDisplayMedia: async () => tab, mixAudio: vi.fn() } as never });
    const bob = w.manager('bob', 'alice');
    await alice.startSession('listen', tab as unknown as MediaStream);
    await until(bob, 'incoming');
    await bob.decline();
    await until(alice, 'ended');
    expect(tab.tracks.every((t) => t.stopped)).toBe(true);
  });

  it('switches the microphone mid-call, staying muted and keeping a shared sound mixed in', async () => {
    const w = makeWorld();
    const screen = new FakeStream([new FakeTrack('video'), new FakeTrack('audio')]);
    const mixAudio = vi.fn((tracks: FakeTrack[]) => ({ track: new FakeTrack('audio'), close: vi.fn(), tracks }));
    const opened: (string | undefined)[] = [];
    const alice = w.manager('alice', 'bob', {
      rtc: {
        getDisplayMedia: async () => screen,
        mixAudio,
        getUserMedia: (async (c: MediaStreamConstraints) => {
          const a = c.audio as MediaTrackConstraints | boolean;
          const id = typeof a === 'object' && typeof a.deviceId === 'object' ? (a.deviceId as { exact: string }).exact : 'default';
          opened.push(id);
          return new FakeStream([new FakeTrack('audio', id), ...(c.video ? [new FakeTrack('video')] : [])]);
        }) as unknown as RtcAdapter['getUserMedia'],
      } as never,
    });
    const bob = w.manager('bob', 'alice');
    await alice.startCall('audio');
    await until(bob, 'incoming');
    await bob.accept();
    await until(alice, 'connected');

    const audio = pcOf(alice).transceivers.find((t) => t.receiver.track.kind === 'audio')!;
    const first = audio.sender.track as unknown as FakeTrack;
    alice.toggleMic();
    await alice.setMicrophone('usb-mic');
    const usb = audio.sender.track as unknown as FakeTrack;
    expect(usb.deviceId).toBe('usb-mic');
    expect(usb.enabled).toBe(false);
    expect(first.stopped).toBe(true);
    expect(alice.getState().micDeviceId).toBe('usb-mic');
    expect(alice.getState().localStream!.getAudioTracks()).toEqual([usb]);

    await alice.startScreenShare();
    await alice.setMicrophone('headset');
    const mix = mixAudio.mock.results.at(-1)!.value;
    expect((mix.tracks[0] as FakeTrack).deviceId).toBe('headset');
    expect(mix.tracks[1]).toBe(screen.tracks[1]);
    expect(audio.sender.track).toBe(mix.track);
    expect(mixAudio.mock.results[0]!.value.close).toHaveBeenCalled();

    // Unplugged: back to the default mic.
    (alice.getState().localStream!.getAudioTracks()[0] as unknown as FakeTrack).emit('ended');
    await vi.waitFor(() => expect(alice.getState().micDeviceId).toBeNull());
    expect(opened.at(-1)).toBe('default');
  });

  it("flags a shared sound that stopped, or whose speakers changed, until it's shared again", async () => {
    const w = makeWorld();
    const sound = new FakeTrack('audio');
    const alice = w.manager('alice', 'bob', {
      rtc: { getDisplayMedia: async () => new FakeStream([new FakeTrack('video'), sound]), mixAudio: () => ({ track: new FakeTrack('audio'), close: () => {} }) } as never,
    });
    const bob = w.manager('bob', 'alice');
    await alice.startCall('audio');
    await until(bob, 'incoming');
    await bob.accept();
    await until(alice, 'connected');

    alice.outputChanged();
    expect(alice.getState().shareSoundLost).toBe(false); // nothing shared yet
    await alice.startScreenShare();
    expect(alice.getState()).toMatchObject({ shareSound: true, shareSoundLost: false });
    alice.outputChanged();
    expect(alice.getState().shareSoundLost).toBe(true);
    await alice.reshareScreen();
    expect(alice.getState()).toMatchObject({ shareSoundLost: false, local: { screen: true } });
    sound.emit('ended');
    expect(alice.getState().shareSoundLost).toBe(true);
    await alice.stopScreenShare();
    expect(alice.getState()).toMatchObject({ shareSound: false, shareSoundLost: false });
  });

  it('a share goes out smooth by default, switches to sharp, and gives the camera its settings back', async () => {
    const w = makeWorld();
    const screen = new FakeStream([new FakeTrack('video'), new FakeTrack('audio')]);
    const mixAudio = () => ({ track: new FakeTrack('audio'), close: () => {} });
    const alice = w.manager('alice', 'bob', { rtc: { getDisplayMedia: async () => screen, mixAudio } as never });
    const bob = w.manager('bob', 'alice');
    await alice.startCall('video');
    await until(bob, 'incoming');
    await bob.accept();
    await until(alice, 'connected');

    const txs = pcOf(alice).transceivers;
    const video = txs.find((t) => t.receiver.track.kind === 'video')!;
    const audio = txs.find((t) => t.receiver.track.kind === 'audio')!;
    await vi.waitFor(() => expect(audio.params.encodings[0]!.maxBitrate).toBe(40_000));
    video.params = { encodings: [{ maxBitrate: 1_500_000 }] };

    await alice.startScreenShare();
    const shared = screen.tracks[0]!;
    expect(alice.getState().shareMode).toBe('smooth');
    expect(shared.contentHint).toBe('motion');
    expect(shared.constraints).toMatchObject({ frameRate: { max: 60 } });
    expect(video.params.encodings[0]).toMatchObject({ maxBitrate: 8_000_000, maxFramerate: 60, scalabilityMode: 'L1T3' });
    expect(video.params.encodings[0]!.codec).toBeUndefined(); // VP9 wasn't negotiated
    expect(video.params.degradationPreference).toBe('maintain-framerate');
    expect(audio.params.encodings[0]!.maxBitrate).toBe(128_000);

    await alice.setShareMode('sharp');
    expect(shared.contentHint).toBe('detail');
    expect(shared.constraints).toMatchObject({ width: { max: 2560 }, height: { max: 1440 }, frameRate: { max: 15 } });
    expect(video.params.encodings[0]).toMatchObject({ maxBitrate: 8_000_000, maxFramerate: 15 });
    expect(video.params.degradationPreference).toBe('maintain-resolution');

    await alice.stopScreenShare();
    expect(video.params.encodings[0]).toEqual({ maxBitrate: 1_500_000 });
    expect(audio.params.encodings[0]!.maxBitrate).toBe(40_000);
  });

  it('a silent window share goes out sharp in VP9 when both sides have it, and the camera gets its codec back', async () => {
    const w = makeWorld();
    const window = new FakeTrack('video');
    window.displaySurface = 'window';
    const screen = new FakeStream([window]);
    const alice = w.manager('alice', 'bob', { rtc: { getDisplayMedia: async () => screen } as never });
    const bob = w.manager('bob', 'alice');
    await alice.startCall('video');
    await until(bob, 'incoming');
    await bob.accept();
    await until(alice, 'connected');

    const video = pcOf(alice).transceivers.find((t) => t.receiver.track.kind === 'video')!;
    const vp9 = { mimeType: 'video/VP9', clockRate: 90_000, sdpFmtpLine: 'profile-id=0' };
    video.params = {
      encodings: [{ maxBitrate: 1_500_000 }],
      codecs: [
        { mimeType: 'video/VP8', clockRate: 90_000 },
        { mimeType: 'video/VP9', clockRate: 90_000, sdpFmtpLine: 'profile-id=2' },
        vp9,
      ],
    };

    await alice.startScreenShare();
    expect(alice.getState().shareMode).toBe('sharp');
    expect(video.params.encodings[0]).toMatchObject({ codec: vp9, maxFramerate: 15 });

    await alice.stopScreenShare();
    expect(video.params.encodings[0]).toEqual({ maxBitrate: 1_500_000 });
  });

  it('a mode I picked myself sticks for the next share in the call', async () => {
    const w = makeWorld();
    const window = new FakeTrack('video');
    window.displaySurface = 'window';
    const alice = w.manager('alice', 'bob', { rtc: { getDisplayMedia: async () => new FakeStream([window]) } as never });
    const bob = w.manager('bob', 'alice');
    await alice.startCall('video');
    await until(bob, 'incoming');
    await bob.accept();
    await until(alice, 'connected');

    await alice.startScreenShare();
    expect(alice.getState().shareMode).toBe('sharp');
    await alice.setShareMode('smooth');
    await alice.stopScreenShare();
    await alice.startScreenShare();
    expect(alice.getState().shareMode).toBe('smooth');
  });

  it('declining ends both sides and records it', async () => {
    const w = makeWorld();
    const alice = w.manager('alice', 'bob');
    const bob = w.manager('bob', 'alice');
    await alice.startCall('audio');
    await until(bob, 'incoming');
    await bob.decline();
    await until(alice, 'ended');
    expect(alice.getState().endReason).toBe('declined');
    expect(w.statusLog).toContainEqual(['call-1', 'declined']);
  });

  it('an unanswered call times out as missed and replaces the push', async () => {
    const w = makeWorld();
    const alice = w.manager('alice', 'bob', { ringTimeoutMs: 20 });
    const bob = w.manager('bob', 'alice', { ringTimeoutMs: 20 });
    await alice.startCall('video');
    await until(bob, 'incoming');
    await until(alice, 'ended');
    await until(bob, 'ended');
    expect(bob.getState().endReason).toBe('missed');
    expect(w.statusLog).toContainEqual(['call-1', 'missed']);
    expect(w.pushes).toEqual(['incoming_call', 'call_ended']);
  });

  it('a second device of the callee stops ringing when the first answers', async () => {
    const w = makeWorld();
    const alice = w.manager('alice', 'bob');
    const bobPhone = w.manager('bob', 'alice');
    const bobLaptop = w.manager('bob', 'alice');
    await alice.startCall('video');
    await until(bobPhone, 'incoming');
    await until(bobLaptop, 'incoming');
    await bobPhone.accept();
    await until(bobLaptop, 'ended');
    expect(bobLaptop.getState().endReason).toBe('answered-elsewhere');
    await until(alice, 'connected');
    await until(bobPhone, 'connected');
  });

  it('resolves glare: simultaneous calls collapse into one connected call', async () => {
    const w = makeWorld();
    const alice = w.manager('alice', 'bob');
    const bob = w.manager('bob', 'alice');
    await Promise.all([alice.startCall('video'), bob.startCall('video')]);
    await until(alice, 'connected', 1000);
    await until(bob, 'connected', 1000);
    expect(alice.getState().call?.id).toBe(bob.getState().call?.id);
  });

  it('mobile: flips the camera in place and un-mirrors the back camera', async () => {
    const w = makeWorld();
    const flips: string[] = [];
    const alice = w.manager('alice', 'bob', { rtc: { switchCamera: (_t, facing) => void flips.push(facing) } });
    const bob = w.manager('bob', 'alice');
    await alice.startCall('video');
    await until(bob, 'incoming');
    await bob.accept();
    await until(alice, 'connected');
    await vi.waitFor(() => expect(alice.getState().canSwitchCamera).toBe(true));
    expect(alice.getState().facing).toBe('user');
    await alice.switchCamera();
    expect(flips).toEqual(['environment']);
    expect(alice.getState().facing).toBe('environment');
    await alice.switchCamera();
    expect(alice.getState().facing).toBe('user');
  });

  it('web: swaps to the next camera on the same sender, stopping the old one', async () => {
    const w = makeWorld();
    const cams = [
      { deviceId: 'front', label: 'Front camera' },
      { deviceId: 'back', label: 'Back camera' },
    ];
    const opened: (string | undefined)[] = [];
    const alice = w.manager('alice', 'bob', {
      rtc: {
        listCameras: async () => cams,
        getUserMedia: (async (c: MediaStreamConstraints) => {
          const v = c.video as MediaTrackConstraints | false;
          const id = v && typeof v.deviceId === 'object' ? (v.deviceId as { exact: string }).exact : v ? 'front' : undefined;
          if (v) opened.push(id);
          return new FakeStream([...(c.audio ? [new FakeTrack('audio')] : []), ...(v ? [new FakeTrack('video', id)] : [])]);
        }) as unknown as RtcAdapter['getUserMedia'],
      },
    });
    const bob = w.manager('bob', 'alice');
    await alice.startCall('video');
    await until(bob, 'incoming');
    await bob.accept();
    await until(alice, 'connected');
    await vi.waitFor(() => expect(alice.getState().canSwitchCamera).toBe(true));

    const sender = pcOf(alice).transceivers.find((t) => t.receiver.track.kind === 'video')!.sender;
    const before = sender.track!;
    await alice.switchCamera();
    expect(before.stopped).toBe(true);
    expect(sender.track?.deviceId).toBe('back');
    expect(alice.getState().facing).toBe('environment');
    expect(alice.selfViewTrack).toBe(sender.track);

    // Camera off and on again keeps the camera we flipped to.
    await alice.toggleCamera();
    await alice.toggleCamera();
    expect(opened.at(-1)).toBe('back');
  });
});

describe('opusForMedia', () => {
  const sdp = [
    'm=audio 9 UDP/TLS/RTP/SAVPF 111 63',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111 minptime=10;useinbandfec=1',
    'a=rtpmap:63 red/48000/2',
    'a=fmtp:63 111/111',
    '',
  ].join('\r\n');

  it('lets Opus carry stereo music, once, and leaves other codecs alone', () => {
    const out = opusForMedia(opusForMedia(sdp));
    expect(out).toContain('a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000\r\n');
    expect(out.match(/stereo=1/g)).toHaveLength(2); // stereo + sprop-stereo, not doubled
    expect(out).toContain('a=fmtp:63 111/111');
  });

  it('leaves an SDP without Opus untouched', () => {
    expect(opusForMedia('v=0\r\n')).toBe('v=0\r\n');
  });
});
