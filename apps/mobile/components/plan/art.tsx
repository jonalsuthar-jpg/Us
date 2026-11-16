/** Plan's illustrations: the sunset banner and the pictures on the hub's cards. */
import { useId, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

/**
 * A view filled with a diagonal gradient. The gradient is drawn at the
 * measured size (Android sizes a "100%" Svg too early) over a solid fill.
 */
export function GradientView({ from, to, radius = 0, style, className, children }: { from: string; to: string; radius?: number; style?: StyleProp<ViewStyle>; className?: string; children?: ReactNode }) {
  const id = useId().replace(/:/g, '');
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  return (
    <View
      className={className}
      style={[{ backgroundColor: to, borderRadius: radius, overflow: 'hidden' }, style]}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (!size || size.w !== w || size.h !== h) setSize({ w, h });
      }}
    >
      {size ? (
        <Svg style={{ position: 'absolute', top: 0, left: 0 }} width={size.w} height={size.h} pointerEvents="none">
          <Defs>
            <LinearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill={`url(#g${id})`} />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

/** Dusk over the hills, a low sun, leaves in the corner. */
export function SunsetBanner({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="plan-sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#7B5EA7" />
          <Stop offset="0.55" stopColor="#B88BC4" />
          <Stop offset="1" stopColor="#F3C1C9" />
        </LinearGradient>
        <RadialGradient id="plan-sun" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FFE8B0" />
          <Stop offset="1" stopColor="#FCC9A0" />
        </RadialGradient>
      </Defs>
      <Rect width={400} height={220} fill="url(#plan-sky)" />
      <Circle cx={262} cy={128} r={46} fill="#FCD9B8" opacity={0.35} />
      <Circle cx={262} cy={128} r={34} fill="url(#plan-sun)" />
      <Path d="M0 160 L60 128 L110 150 L170 104 L230 146 L290 120 L350 148 L400 128 V220 H0Z" fill="#9C7BB8" opacity={0.7} />
      <Path d="M0 182 L70 150 L130 172 L200 140 L260 170 L330 150 L400 168 V220 H0Z" fill="#8A6BA8" opacity={0.75} />
      <Path d="M0 200 Q100 176 200 194 T400 188 V220 H0Z" fill="#F6F2FA" opacity={0.9} />
      <G fill="#3F2C66" opacity={0.85}>
        <Path d="M318 6 c14 2 22 14 18 26 c-12 -2 -20 -12 -18 -26z" />
        <Path d="M344 22 c12 6 16 20 8 30 c-10 -6 -14 -18 -8 -30z" />
        <Path d="M370 4 c10 8 12 22 2 30 c-8 -8 -10 -20 -2 -30z" />
        <Path d="M384 40 c10 6 14 18 6 28 c-8 -6 -12 -16 -6 -28z" />
        <Path d="M300 30 c12 0 20 10 18 22 c-12 0 -20 -10 -18 -22z" />
      </G>
      <Path d="M330 0 Q360 30 400 44" stroke="#3F2C66" strokeWidth={2} fill="none" />
    </Svg>
  );
}

/** A candlelit table for two by a window: the "Next up" picture. */
export function DinnerArt({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 200 110" fill="none">
      <Rect x={96} y={6} width={96} height={62} rx={6} fill="#3B2A5C" />
      <Path d="M144 6 v62 M96 37 h96" stroke="#241933" strokeWidth={3} />
      <G fill="#F3A823" opacity={0.7}>
        <Rect x={106} y={44} width={5} height={16} />
        <Rect x={116} y={38} width={6} height={22} />
        <Rect x={158} y={40} width={5} height={20} />
        <Rect x={170} y={46} width={6} height={14} />
      </G>
      <Path d="M40 30 c-10 6 -14 20 -6 30 c4 -10 10 -18 6 -30z M50 26 c10 8 10 22 0 30 c-2 -12 -4 -20 0 -30z" fill="#37AC5F" opacity={0.7} />
      <Ellipse cx={120} cy={80} rx={58} ry={10} fill="#C9B6E4" />
      <Path d="M62 80 h116 l-8 26 h-100z" fill="#B49BD8" />
      <Path d="M120 52 v18" stroke="#AE6F08" strokeWidth={2} />
      <Path d="M110 52 h20 l-4 -12 h-12z" fill="#FCC24F" />
      <Circle cx={120} cy={46} r={16} fill="#FCC24F" opacity={0.25} />
      <Ellipse cx={94} cy={76} rx={9} ry={3} fill="#fff" />
      <Ellipse cx={146} cy={76} rx={9} ry={3} fill="#fff" />
      <Path d="M34 108 v-30 a12 12 0 0 1 12 -12 h6 v42" fill="#C08A5A" />
      <Path d="M206 108 v-30 a12 12 0 0 0 -12 -12 h-6 v42" fill="#C08A5A" />
    </Svg>
  );
}

/** A shopping bag with greens and a loaf. */
export function BagArt({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <Path d="M60 6 l-4 10 M74 10 l-6 8" stroke="#634882" strokeWidth={3} strokeLinecap="round" />
      <Path d="M34 40 c-4 -14 6 -22 12 -12 c2 -12 14 -10 12 2 c8 -8 16 2 8 10z" fill="#37AC5F" />
      <Rect x={70} y={16} width={16} height={44} rx={8} transform="rotate(22 78 38)" fill="#F3A823" />
      <Path d="M26 46 h68 l-6 64 h-56z" fill="#F7B8D4" />
      <Path d="M26 46 h68 l-2 14 h-64z" fill="#F29BC2" />
      <Path d="M44 52 v-10 a16 16 0 0 1 32 0 v10" stroke="#C084B8" strokeWidth={4} strokeLinecap="round" />
    </Svg>
  );
}

/** Two stacks of ₹ coins. */
export function CoinsArt({ width, height }: { width: number; height: number }) {
  const coin = (x: number, y: number) => (
    <G key={`${x}-${y}`}>
      <Ellipse cx={x} cy={y + 6} rx={26} ry={9} fill="#D9774E" />
      <Ellipse cx={x} cy={y} rx={26} ry={9} fill="#F4A882" />
    </G>
  );
  return (
    <Svg width={width} height={height} viewBox="0 0 140 110" fill="none">
      <Path d="M98 6 l-2 12 M114 12 l-8 8 M124 26 l-10 2" stroke="#E2336A" strokeWidth={3} strokeLinecap="round" />
      {[88, 78, 68, 58].map((y) => coin(90, y))}
      <Ellipse cx={90} cy={50} rx={26} ry={9} fill="#F8C2A4" />
      <SvgText x={90} y={55} textAnchor="middle" fontWeight="800" fontSize={13} fill="#E2336A">
        ₹
      </SvgText>
      {[98, 88].map((y) => coin(46, y))}
      <Ellipse cx={46} cy={80} rx={26} ry={9} fill="#F8C2A4" />
      <SvgText x={46} y={85} textAnchor="middle" fontWeight="800" fontSize={13} fill="#E2336A">
        ₹
      </SvgText>
    </Svg>
  );
}

/** A prize wheel on a stand. */
export function WheelArt({ width, height }: { width: number; height: number }) {
  const slices = ['#9A7BE0', '#7B5BC8', '#B79CF0', '#6A4BB4', '#A88AE8', '#8565D2'];
  const r = 42;
  return (
    <Svg width={width} height={height} viewBox="0 0 120 130" fill="none">
      <Path d="M86 4 l-4 10 M100 12 l-8 6" stroke="#FCC24F" strokeWidth={3} strokeLinecap="round" />
      <Path d="M40 120 h40 l-6 -14 h-28z" fill="#F3A823" />
      <Circle cx={60} cy={62} r={48} fill="#E9DEFB" />
      <G x={60} y={62}>
        {slices.map((fill, i) => {
          const a0 = (i / slices.length) * Math.PI * 2;
          const a1 = ((i + 1) / slices.length) * Math.PI * 2;
          return (
            <Path
              key={i}
              d={`M0 0 L${(Math.cos(a0) * r).toFixed(1)} ${(Math.sin(a0) * r).toFixed(1)} A${r} ${r} 0 0 1 ${(Math.cos(a1) * r).toFixed(1)} ${(Math.sin(a1) * r).toFixed(1)}Z`}
              fill={fill}
            />
          );
        })}
        <Circle r={7} fill="#fff" />
      </G>
      <Path d="M52 8 h16 l-8 16z" fill="#F3A823" stroke="#AE6F08" strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}

/** Three little lines, a burst of excitement. */
export function Burst({ size = 24, color = '#0C8F82' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 4 l2 6 M14 2 v7 M21 8 l-6 4" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}
