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

/** Plays the remote audio, optionally on a chosen output device (`sinkId`). */
export function StreamAudio({ stream, revision, sinkId }: { stream: MediaStream | null; revision: number; sinkId?: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream, revision]);
  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (el?.setSinkId && sinkId !== undefined) void el.setSinkId(sinkId).catch(() => {});
  }, [sinkId]);
  return <audio ref={ref} autoPlay />;
}

export interface AudioOutput {
  deviceId: string;
  label: string;
}

/**
 * Speakers / headphones this browser can route call audio to. Empty where
 * output selection isn't supported (Safari, most phone browsers), which is
 * where the OS already handles routing.
 */
export function useAudioOutputs(active: boolean): AudioOutput[] {
  const [outputs, setOutputs] = useState<AudioOutput[]>([]);
  useEffect(() => {
    if (!active || typeof HTMLMediaElement === 'undefined' || !('setSinkId' in HTMLMediaElement.prototype)) return;
    const md = navigator.mediaDevices;
    const load = () =>
      void md
        .enumerateDevices()
        .then((all) =>
          setOutputs(
            all
              .filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'communications')
              .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Speaker ${i + 1}` })),
          ),
        )
        .catch(() => {});
    load();
    md.addEventListener('devicechange', load);
    return () => md.removeEventListener('devicechange', load);
  }, [active]);
  return outputs;
}
