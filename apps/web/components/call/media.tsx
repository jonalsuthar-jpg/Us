'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/** Binds a MediaStream to a <video>. `revision` re-binds when tracks change. */
export function StreamVideo({
  stream,
  revision,
  mirrored,
  fit = 'cover',
  className,
}: {
  stream: MediaStream | null;
  revision: number;
  mirrored?: boolean;
  fit?: 'cover' | 'contain';
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream, revision]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted // audio plays through <StreamAudio>, so hiding video never silences it
      className={cn('h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain', mirrored && '-scale-x-100', className)}
    />
  );
}

/** Plays the remote audio, optionally on a chosen output device (`sinkId`) and at a volume (0–1). */
export function StreamAudio({ stream, revision, sinkId, volume = 1 }: { stream: MediaStream | null; revision: number; sinkId?: string; volume?: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream, revision]);
  useEffect(() => {
    if (ref.current) ref.current.volume = Math.min(1, Math.max(0, volume));
  }, [volume]);
  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (el?.setSinkId && sinkId !== undefined) void el.setSinkId(sinkId).catch(() => {});
  }, [sinkId]);
  return <audio ref={ref} autoPlay />;
}

export interface AudioDevice {
  deviceId: string;
  label: string;
}

/**
 * The speakers / headphones and the microphones this browser can use, kept
 * current as devices come and go. Outputs are empty where output selection
 * isn't supported (Safari, most phone browsers): there the OS routes sound.
 * `defaultOutput` names whatever the system plays through right now.
 */
export function useAudioDevices(active: boolean): { outputs: AudioDevice[]; inputs: AudioDevice[]; defaultOutput: string | null } {
  const [devices, setDevices] = useState<{ outputs: AudioDevice[]; inputs: AudioDevice[]; defaultOutput: string | null }>({
    outputs: [],
    inputs: [],
    defaultOutput: null,
  });
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
    const md = navigator.mediaDevices;
    const canPickOutput = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
    const list = (all: MediaDeviceInfo[], kind: MediaDeviceKind, fallback: string) =>
      all
        .filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'communications')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
    const load = () =>
      void md
        .enumerateDevices()
        .then((all) => {
          const outs = all.filter((d) => d.kind === 'audiooutput');
          const def = outs.find((d) => d.deviceId === 'default') ?? outs[0];
          setDevices({
            outputs: canPickOutput ? list(all, 'audiooutput', 'Speaker') : [],
            inputs: list(all, 'audioinput', 'Microphone'),
            // Its label changes ("Default - Headphones") when the system switches.
            defaultOutput: def ? `${def.groupId}|${def.label}` : null,
          });
        })
        .catch(() => {});
    load();
    md.addEventListener('devicechange', load);
    return () => md.removeEventListener('devicechange', load);
  }, [active]);
  return devices;
}
