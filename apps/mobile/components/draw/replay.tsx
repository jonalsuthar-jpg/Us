import { BOARD_H, BOARD_W, replayTimeline, strokesAt, type DrawingFile } from '@us/shared';
import { Pause, Play, RotateCcw } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { cn } from '../ui/cn';
import { Text } from '../ui/text';
import { InkLayers, PageLines, PhotoBackground } from './svg-ink';

const SPEEDS = [1, 2, 4] as const;

function clock(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A saved drawing redrawn at the pace it was drawn, with play/pause, a scrubber and 1× / 2× / 4×. */
export function Replay({
  file,
  width,
  photoUrl,
  tone = 'night',
  autoPlay = true,
  speed: fixedSpeed,
  controls = true,
}: {
  file: DrawingFile;
  width: number;
  photoUrl?: string | null;
  tone?: 'night' | 'paper';
  autoPlay?: boolean;
  /** Lock the speed (a Draw & Guess turn plays at the real pace). */
  speed?: 1 | 2 | 4;
  controls?: boolean;
}) {
  const timeline = useMemo(() => replayTimeline(file.strokes), [file.strokes]);
  const total = timeline.length ? timeline[timeline.length - 1]!.end : 0;
  const [t, setT] = useState(autoPlay ? 0 : total);
  const [playing, setPlaying] = useState(autoPlay);
  const [speed, setSpeed] = useState<1 | 2 | 4>(fixedSpeed ?? 2);
  const [barW, setBarW] = useState(0);
  const last = useRef(0);
  const height = Math.round((width * BOARD_H) / BOARD_W);
  const night = tone === 'night';

  useEffect(() => {
    setT(autoPlay ? 0 : total);
    setPlaying(autoPlay);
  }, [file, autoPlay, total]);

  useEffect(() => {
    if (!playing) return;
    last.current = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const dt = (now - last.current) * speed;
      last.current = now;
      setT((v) => {
        const next = Math.min(total, v + dt);
        if (next >= total) setPlaying(false);
        return next;
      });
    }, 33);
    return () => clearInterval(id);
  }, [playing, speed, total]);

  const shown = useMemo(() => strokesAt(file.strokes, t, timeline), [file.strokes, t, timeline]);
  const done = t >= total;
  const pct = total ? t / total : 1;

  return (
    <View className="gap-3">
      <View className="overflow-hidden rounded-[20px] bg-white" style={{ width, height }} accessible accessibilityRole="image" accessibilityLabel={`Replay, ${Math.round(pct * 100)} percent drawn`}>
        <Svg width={width} height={height} viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}>
          <Rect x={0} y={0} width={BOARD_W} height={BOARD_H} fill="#FFFFFF" />
          <PhotoBackground uri={file.bg?.kind === 'photo' ? photoUrl : null} />
          <InkLayers strokes={shown} id="replay" />
          <PageLines bg={file.bg} />
        </Svg>
      </View>
      {controls ? (
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause replay' : done ? 'Play again' : 'Play replay'}
            onPress={() => {
              if (done) setT(0);
              setPlaying((p) => !p || done);
            }}
            className={cn('h-12 w-12 items-center justify-center rounded-full', night ? 'bg-paper' : 'bg-plum-800')}
          >
            {playing ? (
              <Pause size={18} color={night ? '#241933' : '#FCFAFB'} fill={night ? '#241933' : '#FCFAFB'} />
            ) : done ? (
              <RotateCcw size={18} color={night ? '#241933' : '#FCFAFB'} />
            ) : (
              <Play size={18} color={night ? '#241933' : '#FCFAFB'} fill={night ? '#241933' : '#FCFAFB'} style={{ marginLeft: 2 }} />
            )}
          </Pressable>
          <View className="flex-1 gap-1.5">
            <Pressable
              accessibilityRole="adjustable"
              accessibilityLabel="Replay position"
              onLayout={(e: LayoutChangeEvent) => setBarW(e.nativeEvent.layout.width)}
              onPress={(e) => {
                if (!barW) return;
                setPlaying(false);
                setT(Math.max(0, Math.min(total, (e.nativeEvent.locationX / barW) * total)));
              }}
              className="h-5 justify-center"
            >
              <View className={cn('h-1.5 rounded-full', night ? 'bg-plum-600' : 'bg-paper-edge')}>
                <View className="absolute bottom-0 left-0 top-0 rounded-full bg-rose-400" style={{ width: `${pct * 100}%` }} />
              </View>
              <View className="absolute h-4 w-4 rounded-full bg-paper" style={{ left: Math.max(0, pct * barW - 8), borderWidth: night ? 0 : 1, borderColor: '#E9E2E8' }} />
            </Pressable>
            <View className="flex-row justify-between">
              <Text className={cn('text-[12px]', night ? 'text-plum-200' : 'text-ink-muted')}>{clock(t)}</Text>
              <Text className={cn('text-[12px]', night ? 'text-plum-200' : 'text-ink-muted')}>{clock(total)}</Text>
            </View>
          </View>
          {fixedSpeed ? null : (
            <View accessibilityRole="radiogroup" accessibilityLabel="Speed" className={cn('flex-row rounded-xl p-[3px]', night ? 'bg-plum-700' : 'bg-paper-sunken')}>
              {SPEEDS.map((s) => (
                <Pressable
                  key={s}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: speed === s }}
                  onPress={() => setSpeed(s)}
                  className={cn('rounded-[9px] px-2 py-1.5', speed === s && (night ? 'bg-paper' : 'bg-paper-raised'))}
                >
                  <Text className={cn('font-sans-semibold text-micro', speed === s ? (night ? 'text-plum-800' : 'text-ink') : night ? 'text-plum-200' : 'text-ink-soft')}>{`${s}×`}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}
