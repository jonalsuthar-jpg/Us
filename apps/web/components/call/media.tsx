'use client';

import { useEffect, useRef } from 'react';
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

export function StreamAudio({ stream, revision }: { stream: MediaStream | null; revision: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream, revision]);
  return <audio ref={ref} autoPlay />;
}
