import { PLANT_ORIGIN, PLANT_VIEWBOX, type ArtLayerId, type ArtShape, type PlantScene } from '@us/shared';
import { useEffect, useId } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

const { width: W, height: H } = PLANT_VIEWBOX;

/**
 * The plant scene from plant-art.ts. The moving parts are drawn on their own
 * stacked canvases so Reanimated can move them: the plant sways from its
 * base, petals drift, water drips.
 */
export function PlantArt({ scene, style, title, still }: { scene: PlantScene; style?: ViewStyle; title: string; still?: boolean }) {
  const reduce = useReducedMotion();
  const calm = still || reduce;
  const sway = useSharedValue(0);
  const fall = useSharedValue(0);
  useEffect(() => {
    if (calm) {
      cancelAnimation(sway);
      cancelAnimation(fall);
      sway.value = 0;
      fall.value = 0;
      return;
    }
    sway.value = withRepeat(withTiming(1, { duration: 2250, easing: Easing.inOut(Easing.sin) }), -1, true);
    fall.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.in(Easing.quad) }), -1, false);
  }, [calm, sway, fall]);

  const swayStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${(sway.value - 0.5) * 3.2}deg` }] }));
  const dripStyle = useAnimatedStyle(() => ({ opacity: calm ? 1 : 1 - fall.value * 0.8, transform: [{ translateY: calm ? 0 : fall.value * 6 }] }));

  const layer = (ids: ArtLayerId[]) => <Canvas scene={scene} ids={ids} />;
  return (
    <View style={[{ aspectRatio: W / H, overflow: 'hidden' }, style]} accessible accessibilityRole="image" accessibilityLabel={title}>
      {layer(['sky', 'ground'])}
      {/* Kept as textures on Android, so moving a layer doesn't repaint its SVG every frame. */}
      <Animated.View renderToHardwareTextureAndroid style={[fill, { transformOrigin: `${(PLANT_ORIGIN.x / W) * 100}% ${(PLANT_ORIGIN.y / H) * 100}%` }, swayStyle]}>
        {layer(['plant'])}
      </Animated.View>
      {layer(['pot', 'canLeft', 'canRight'])}
      <Animated.View renderToHardwareTextureAndroid style={[fill, dripStyle]}>
        {layer(['petals', 'drops'])}
      </Animated.View>
    </View>
  );
}

const fill: ViewStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };

function Canvas({ scene, ids }: { scene: PlantScene; ids: ArtLayerId[] }) {
  // Gradient ids are per canvas: several scenes can be on screen at once.
  const prefix = useId().replace(/[^a-zA-Z0-9]/g, '');
  const paint = (f?: string) => (f?.startsWith('grad:') ? `url(#${prefix}${f.slice(5)})` : (f ?? 'none'));
  return (
    <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={fill}>
      <Defs>
        {scene.gradients.map((g) => {
          const stops = g.stops.map((s, i) => <Stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity ?? 1} />);
          return g.type === 'linear' ? (
            <LinearGradient key={g.id} id={`${prefix}${g.id}`} x1={g.coords[0]} y1={g.coords[1]} x2={g.coords[2]} y2={g.coords[3]}>
              {stops}
            </LinearGradient>
          ) : (
            <RadialGradient key={g.id} id={`${prefix}${g.id}`} cx={g.coords[0]} cy={g.coords[1]} r={g.coords[2]}>
              {stops}
            </RadialGradient>
          );
        })}
      </Defs>
      {scene.layers
        .filter((l) => ids.includes(l.id))
        .map((l) => (
          <G key={l.id}>
            {l.shapes.map((s, i) => (
              <Shape key={i} s={s} paint={paint} />
            ))}
          </G>
        ))}
    </Svg>
  );
}

function Shape({ s, paint }: { s: ArtShape; paint: (f?: string) => string }) {
  if (s.kind === 'path')
    return <Path d={s.d} fill={paint(s.fill)} stroke={s.stroke ?? 'none'} strokeWidth={s.strokeWidth} strokeLinecap="round" opacity={s.opacity} />;
  if (s.kind === 'circle') return <Circle cx={s.cx} cy={s.cy} r={s.r} fill={paint(s.fill)} opacity={s.opacity} />;
  return <Ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={paint(s.fill)} opacity={s.opacity} />;
}
