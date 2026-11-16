/** Memory's illustrations: a golden-hour banner with fairy lights and polaroids on a string. */
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

export function GoldenBanner({ width, height }: { width: number; height: number }) {
  const lights = [24, 64, 104, 150, 196, 240, 286, 330, 372];
  return (
    <Svg width={width} height={height} viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="mem-sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#E98A78" />
          <Stop offset="0.5" stopColor="#F4AE8C" />
          <Stop offset="1" stopColor="#FBD6C2" />
        </LinearGradient>
        <RadialGradient id="mem-glow" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#FFF1C9" stopOpacity={0.95} />
          <Stop offset="1" stopColor="#FFF1C9" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={400} height={220} fill="url(#mem-sky)" />
      <Circle cx={70} cy={150} r={90} fill="url(#mem-glow)" />
      <Circle cx={70} cy={150} r={26} fill="#FFE4A8" opacity={0.9} />
      <Path d="M0 196 Q100 174 200 190 T400 182 V220 H0Z" fill="#FFF6F1" opacity={0.95} />
      <Path d="M-10 40 Q200 96 410 34" stroke="#7A4B3A" strokeWidth={1.5} fill="none" />
      {lights.map((x, i) => {
        const t = (x + 10) / 420;
        const y = (1 - t) * (1 - t) * 40 + 2 * (1 - t) * t * 96 + t * t * 34;
        return <Circle key={x} cx={x} cy={y + 5} r={4} fill={['#FFE08A', '#FFB4C6', '#FFF3C4'][i % 3]} />;
      })}
      <G transform="translate(206 58) rotate(6)">
        <Rect width={46} height={54} rx={3} fill="#fff" />
        <Rect x={5} y={5} width={36} height={34} fill="#FFD3DE" />
        <Path d="M23 30 c-6 -5 -10 -9 -6 -13 c3 -3 6 -1 6 2 c0 -3 3 -5 6 -2 c4 4 0 8 -6 13z" fill="#F5547C" />
        <Rect x={19} y={-6} width={8} height={10} rx={2} fill="#C08A5A" />
      </G>
      <G transform="translate(262 52) rotate(-5)">
        <Rect width={46} height={54} rx={3} fill="#fff" />
        <Rect x={5} y={5} width={36} height={34} fill="#BFE9E1" />
        <Path d="M5 39 L18 22 L26 31 L32 25 L41 39Z" fill="#0C8F82" />
        <Circle cx={33} cy={13} r={4} fill="#FCC24F" />
        <Rect x={19} y={-6} width={8} height={10} rx={2} fill="#C08A5A" />
      </G>
      <G transform="translate(320 42) rotate(8)">
        <Rect width={46} height={54} rx={3} fill="#fff" />
        <Rect x={5} y={5} width={36} height={34} fill="#FFE7B0" />
        <Path d="M10 30 l22 -14 l-6 18 z" fill="#634882" />
        <Rect x={19} y={-6} width={8} height={10} rx={2} fill="#C08A5A" />
      </G>
    </Svg>
  );
}
