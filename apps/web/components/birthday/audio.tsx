'use client';

import { formatVoiceLength } from '@us/shared';
import { Mic, Pause, Play, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** Loud enough, for long enough, to be a breath on the mic rather than talking. */
const BLOW_RMS = 0.22;
const BLOW_FRAMES = 8;

/**
 * Listens on the mic while `listening`, and calls `onBlow` once for a blow.
 * Without a mic (or permission) the candles are simply clicked instead.
 */
export function useBlow(listening: boolean, onBlow: () => void): 'off' | 'on' | 'denied' {
  const [mic, setMic] = useState<'off' | 'on' | 'denied'>('off');
  const blown = useRef(onBlow);
  blown.current = onBlow;

  useEffect(() => {
    if (!listening) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setMic('denied');
      return;
    }
    let live = true;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let frame = 0;
    void (async () => {
      try {
        // No noise suppression: it would filter out the very sound we want.
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
        if (!live) return stream.getTracks().forEach((t) => t.stop());
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        let loud = 0;
        setMic('on');
        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += v * v;
          loud = Math.sqrt(sum / buf.length) > BLOW_RMS ? loud + 1 : 0;
          if (loud >= BLOW_FRAMES) {
            loud = 0;
            blown.current();
          }
          frame = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        if (live) setMic('denied');
      }
    })();
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
      setMic('off');
    };
  }, [listening]);

  return mic;
}

/** Play / pause a voice note, big. */
export function SongPlayer({ url, autoPlay }: { url: string; autoPlay?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState({ at: 0, of: 0 });
  useEffect(() => {
    if (autoPlay) void audio.current?.play().catch(() => {});
  }, [autoPlay, url]);
  const progress = time.of ? Math.min(1, time.at / time.of) : 0;
  return (
    <div className="flex flex-col items-center gap-4">
      <audio
        ref={audio}
        src={url}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime({ at: e.currentTarget.currentTime, of: Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0 })}
        onLoadedMetadata={(e) => {
          // Read it now: React clears currentTarget before the updater runs.
          const of = Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0;
          setTime((t) => ({ ...t, of }));
        }}
      />
      <button
        type="button"
        aria-label={playing ? 'Pause the song' : 'Play the song'}
        onClick={() => (playing ? audio.current?.pause() : void audio.current?.play())}
        className="flex h-24 w-24 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_0_40px_rgba(228,107,138,0.6)] transition-transform hover:scale-105 active:scale-95"
      >
        {playing ? <Pause className="h-10 w-10 fill-current" /> : <Play className="ml-1.5 h-10 w-10 fill-current" />}
      </button>
      <div className="h-1.5 w-56 overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full bg-gold-300" style={{ width: `${progress * 100}%` }} />
      </div>
      <p className="text-small text-plum-200">
        {formatVoiceLength(time.at * 1000)}
        {time.of ? ` / ${formatVoiceLength(time.of * 1000)}` : ''}
      </p>
    </div>
  );
}

function pickAudioType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((t) => MediaRecorder.isTypeSupported(t));
}

/** Record a voice note for the room; hands back the recording and its length. */
export function VoiceRecorder({ onDone }: { onDone: (blob: Blob, ms: number) => void }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  async function start() {
    setError(null);
    const type = pickAudioType();
    if (!type || !navigator.mediaDevices?.getUserMedia) return setError('This browser can’t record. Try the phone app.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream, { mimeType: type });
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const ms = Date.now() - startedAt.current;
        if (ms > 600) onDone(new Blob(chunks, { type }), ms);
        recorder.current = null;
      };
      recorder.current = r;
      startedAt.current = Date.now();
      setElapsed(0);
      r.start(250);
      setRecording(true);
    } catch {
      setError('Allow the microphone to record.');
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-label={recording ? 'Stop recording' : 'Record'}
        onClick={() => (recording ? (recorder.current?.stop(), setRecording(false)) : void start())}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700"
      >
        {recording ? <Square className="h-7 w-7 fill-current" /> : <Mic className="h-8 w-8" />}
      </button>
      <p className="text-small text-ink-soft">{recording ? `Recording… ${formatVoiceLength(elapsed)} · click to stop` : 'Click to record'}</p>
      {error ? <p className="text-small text-rose-600">{error}</p> : null}
    </div>
  );
}
