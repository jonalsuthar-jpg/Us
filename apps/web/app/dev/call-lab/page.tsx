'use client';

/**
 * Dev-only loopback lab: two CallManagers ("A" and "B") in one tab, talking
 * through an in-memory signaling bus and a fake call backend, using the
 * browser's real RTCPeerConnection. Media is synthetic (canvas + oscillator)
 * so no camera permission is needed. Exercises the exact engine the app uses.
 *
 * window.__lab exposes both managers for automated checks.
 */
import { CallManager, type Call, type CallState, type RtcAdapter, type SignalEnvelope } from '@us/shared';
import { notFound } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { StreamVideo } from '@/components/call/media';
import { Button } from '@/components/ui/button';

function synthStream(constraints: MediaStreamConstraints, hue: number): MediaStream {
  const tracks: MediaStreamTrack[] = [];
  if (constraints.video) {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    let t = 0;
    const draw = () => {
      t += 1;
      ctx.fillStyle = `hsl(${hue} 45% 30%)`;
      ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = `hsl(${hue} 60% 70%)`;
      ctx.beginPath();
      ctx.arc(160 + Math.sin(t / 15) * 80, 120, 40, 0, Math.PI * 2);
      ctx.fill();
      requestAnimationFrame(draw);
    };
    draw();
    tracks.push(...canvas.captureStream(24).getVideoTracks());
  }
  if (constraints.audio) {
    const ac = new AudioContext();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    gain.gain.value = 0.0001;
    const dest = ac.createMediaStreamDestination();
    osc.connect(gain).connect(dest);
    osc.start();
    tracks.push(...dest.stream.getAudioTracks());
  }
  return new MediaStream(tracks);
}

function useLab() {
  return useMemo(() => {
    const listeners = new Set<{ id: string; fn: (e: SignalEnvelope) => void }>();
    const calls = new Map<string, Call>();
    let seq = 0;

    const make = (me: string, partner: string, hue: number) => {
      const rtc: RtcAdapter = {
        RTCPeerConnection,
        MediaStream,
        getUserMedia: async (c) => synthStream(c, hue),
        getDisplayMedia: () => navigator.mediaDevices.getDisplayMedia({ video: true }),
      };
      return new CallManager({
        me,
        partnerId: partner,
        rtc,
        endedLingerMs: 1500,
        log: (...a) => console.debug(me, ...a),
        signaling: {
          send: async (event) => {
            const env = { ...event, from: me } as SignalEnvelope;
            for (const l of listeners) if (l.id !== me) setTimeout(() => l.fn(env), 5);
          },
          subscribe: (fn) => {
            const entry = { id: me, fn };
            listeners.add(entry);
            return () => void listeners.delete(entry);
          },
        },
        backend: {
          createCall: async (media) => {
            const call: Call = {
              id: `lab-${Date.now()}-${++seq}`,
              couple_id: 'lab',
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
          setStatus: async (id, status) => {
            const c = calls.get(id);
            if (c) calls.set(id, { ...c, status });
          },
          getCall: async (id) => calls.get(id) ?? null,
          iceServers: async () => [],
          notify: () => {},
        },
      });
    };
    return { a: make('A', 'B', 350), b: make('B', 'A', 190) };
  }, []);
}

function useManagerState(m: CallManager): CallState {
  return useSyncExternalStore(m.subscribe, m.getState, m.getState);
}

export default function CallLab() {
  if (process.env.NODE_ENV === 'production') notFound();
  const { a, b } = useLab();
  useEffect(() => {
    (window as unknown as { __lab: unknown }).__lab = { a, b };
  }, [a, b]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <h1 className="font-display text-title">Call lab</h1>
      <p className="text-small text-ink-soft">Real WebRTC between two in-page peers. Synthetic media; no signaling server.</p>
      <div className="grid gap-6 md:grid-cols-2">
        <Side name="A" m={a} />
        <Side name="B" m={b} />
      </div>
    </main>
  );
}

function Side({ name, m }: { name: string; m: CallManager }) {
  const s = useManagerState(m);
  const [, force] = useState(0);
  return (
    <section className="space-y-3 rounded-sheet border border-paper-edge bg-paper-raised p-4" data-side={name}>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-heading">Peer {name}</h2>
        <code className="text-micro" data-testid={`phase-${name}`}>
          {s.phase}
          {s.endReason ? ` (${s.endReason})` : ''} · route {s.route ?? '–'}
        </code>
      </div>
      <div className="aspect-video overflow-hidden rounded-control bg-plum-900">
        <StreamVideo stream={s.remoteStream} revision={s.revision} />
      </div>
      <p className="text-micro text-ink-muted">
        local mic {String(s.local.mic)} cam {String(s.local.camera)} screen {String(s.local.screen)} · remote cam{' '}
        {String(s.remote.camera)} screen {String(s.remote.screen)} · remote tracks {s.remoteStream?.getTracks().length ?? 0}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void m.startCall('video')}>Video call</Button>
        <Button size="sm" variant="secondary" onClick={() => void m.startCall('audio')}>Voice call</Button>
        <Button size="sm" variant="secondary" onClick={() => void m.accept()}>Accept</Button>
        <Button size="sm" variant="secondary" onClick={() => void m.decline()}>Decline</Button>
        <Button size="sm" variant="secondary" onClick={() => m.toggleMic()}>Mic</Button>
        <Button size="sm" variant="secondary" onClick={() => void m.toggleCamera().then(() => force((x) => x + 1))}>Camera</Button>
        <Button size="sm" variant="secondary" onClick={() => void m.startScreenShare()}>Share</Button>
        <Button size="sm" variant="end" onClick={() => void m.hangup()}>Hang up</Button>
      </div>
    </section>
  );
}
