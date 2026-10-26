import Svg, { Circle, Path } from 'react-native-svg';

/** Little drawings for tiles, in the same 300 × 400 shape as the board. */
export function CoupleDoodle({ width, stroke = 7 }: { width: number; stroke?: number }) {
  return (
    <Svg width={width} height={(width * 4) / 3} viewBox="0 0 300 400" fill="none">
      <Circle cx={236} cy={72} r={24} stroke="#F3A823" strokeWidth={stroke} />
      <Circle cx={112} cy={196} r={17} stroke="#E2336A" strokeWidth={stroke} />
      <Path d="M112 213 V268 M112 268 L96 302 M112 268 L128 302 M112 232 L150 246" stroke="#E2336A" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={188} cy={196} r={17} stroke="#0A776D" strokeWidth={stroke} />
      <Path d="M188 213 V268 M188 268 L172 302 M188 268 L204 302 M188 232 L150 246" stroke="#0A776D" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="M150 168 C132 154 126 140 136 132 C143 127 149 131 150 137 C151 131 157 127 164 132 C174 140 168 154 150 168 Z"
        stroke="#F5547C"
        strokeWidth={stroke - 2}
        fill="#FFB8C9"
      />
    </Svg>
  );
}
