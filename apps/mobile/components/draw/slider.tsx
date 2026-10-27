import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

interface Props {
  /** 0–1. */
  value: number;
  onChange: (v: number) => void;
  label: string;
  /** A gradient for the track (hue, lightness); otherwise a filled track. */
  stops?: string[];
  /** The thumb's fill (the colour it picks). */
  thumb?: string;
  height?: number;
}

/**
 * A slider drawn with react-native-svg and moved with a gesture-handler Pan,
 * so there's no native slider module to add. Used for brush size and for the
 * custom colour strips.
 */
export function Slider({ value, onChange, label, stops, thumb = '#FFFFFF', height = 22 }: Props) {
  const [w, setW] = useState(0);
  const v = Math.max(0, Math.min(1, value));
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .runOnJS(true)
        .onBegin((e) => w && onChange(Math.max(0, Math.min(1, e.x / w))))
        .onUpdate((e) => w && onChange(Math.max(0, Math.min(1, e.x / w)))),
    [w, onChange],
  );
  const track = stops ? height : 6;
  const knob = stops ? height + 6 : 20;
  const id = useMemo(() => `g${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(Math.max(0, Math.min(1, v + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1))))}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        className="flex-1 justify-center"
        style={{ height: Math.max(knob, 32) }}
      >
        {w ? (
          <Svg width={w} height={track} style={{ position: 'absolute', top: (Math.max(knob, 32) - track) / 2 }}>
            {stops ? (
              <>
                <Defs>
                  <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
                    {stops.map((c, i) => (
                      <Stop key={i} offset={i / (stops.length - 1)} stopColor={c} />
                    ))}
                  </LinearGradient>
                </Defs>
                <Rect x={0} y={0} width={w} height={track} rx={track / 2} fill={`url(#${id})`} />
              </>
            ) : (
              <>
                <Rect x={0} y={0} width={w} height={track} rx={track / 2} fill="#E9E2E8" />
                <Rect x={0} y={0} width={Math.max(track, v * w)} height={track} rx={track / 2} fill="#F5547C" />
              </>
            )}
          </Svg>
        ) : null}
        <View
          pointerEvents="none"
          className="absolute rounded-full"
          style={{
            left: Math.max(0, Math.min(w - knob, v * w - knob / 2)),
            width: knob,
            height: knob,
            backgroundColor: thumb,
            borderWidth: stops ? 3 : 0,
            borderColor: '#FFFFFF',
            elevation: 3,
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
          }}
        />
      </View>
    </GestureDetector>
  );
}
