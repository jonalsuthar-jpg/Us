'use client';

import { formatVoiceLength } from '@us/shared';
import { Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
