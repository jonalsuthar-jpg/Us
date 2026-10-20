import { describe, expect, it, vi } from 'vitest';
import type { Call, CallMedia, CallStatus } from '../src/database.types';
import type { SignalEnvelope } from '../src/realtime/couple-channel';
import { CallManager, type CallPhase, type RtcAdapter } from '../src/webrtc/call-manager';

// ---------------------------------------------------------------------------
// Fakes: just enough WebRTC surface for the state machine to run end-to-end.
// ---------------------------------------------------------------------------

class FakeTrack {
  enabled = true;
  stopped = false;
  id = Math.random().toString(36).slice(2);
  constructor(readonly kind: 'audio' | 'video') {}
  stop() {
    this.stopped = true;
  }
  addEventListener() {}
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
  sender = { track: null as FakeTrack | null, replaceTrack: async (t: FakeTrack | null) => void (this.sender.track = t) };
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

  function manager(me: string, partner: string, extra: { ringTimeoutMs?: number } = {}) {
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
      } as unknown as RtcAdapter,
      endedLingerMs: 10,
      ...extra,
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
});
