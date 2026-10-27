import { BRUSH_MAX, BRUSH_MIN, colorOf, DRAW_SIZES, DRAW_TOOLS, type DrawColor, type DrawTool } from '@us/shared';
import * as Haptics from 'expo-haptics';
import { Eraser, Highlighter, PaintBucket, Pen, Pencil, PenTool, Undo2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Text } from '../ui/text';
import { ColourSheet, Swatch, useRecentColours } from './colours';
import { Slider } from './slider';

export const TOOL_INFO: Record<DrawTool, { label: string; Icon: typeof Pen }> = {
  pen: { label: 'Pen', Icon: Pen },
  pencil: { label: 'Pencil', Icon: Pencil },
  marker: { label: 'Marker', Icon: Highlighter },
  calligraphy: { label: 'Calligraphy', Icon: PenTool },
  fill: { label: 'Fill', Icon: PaintBucket },
  eraser: { label: 'Eraser', Icon: Eraser },
};

const tick = () => void Haptics.selectionAsync().catch(() => {});

/** The "more colours" button: a little colour wheel with a plus. */
function Wheel({ size = 40 }: { size?: number }) {
  const r = size / 2;
  const colours = ['#F5547C', '#F3A823', '#FFE14D', '#37AC5F', '#0C8F82', '#2F6FDB', '#634882'];
  return (
    <Svg width={size} height={size}>
      {colours.map((c, i) => {
        const a0 = (i / colours.length) * Math.PI * 2 - Math.PI / 2;
        const a1 = ((i + 1) / colours.length) * Math.PI * 2 - Math.PI / 2;
        const d = `M${r} ${r}L${r + r * Math.cos(a0)} ${r + r * Math.sin(a0)}A${r} ${r} 0 0 1 ${r + r * Math.cos(a1)} ${r + r * Math.sin(a1)}Z`;
        return <Path key={c} d={d} fill={c} />;
      })}
      <Circle cx={r} cy={r} r={r * 0.55} fill="#FFFFFF" />
      <Path d={`M${r} ${r * 0.62}V${r * 1.38}M${r * 0.62} ${r}H${r * 1.38}`} stroke="#241933" strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

interface Props {
  tool: DrawTool;
  onTool: (t: DrawTool) => void;
  color: DrawColor;
  onColor: (c: DrawColor) => void;
  /** Brush width in board units; leave out to hide the size row. */
  size?: number;
  onSize?: (w: number) => void;
  onUndo: () => void;
  canUndo: boolean;
  /** Which tools to offer (all of them by default). */
  tools?: DrawTool[];
  /** Smaller buttons, for sheets and the game. */
  dense?: boolean;
}

/**
 * Brushes, size and colour, as in the mockup: a row of tools with undo at the
 * end, five sizes and a slider, then the current colour, recent ones and a
 * wheel that opens the full palette with a custom colour.
 */
export function Toolbar({ tool, onTool, color, onColor, size, onSize, onUndo, canUndo, tools = DRAW_TOOLS, dense }: Props) {
  const c = usePalette();
  const [recent, pushRecent] = useRecentColours();
  const [sheet, setSheet] = useState(false);
  const btn = dense ? 40 : 44;
  const hex = colorOf(color);

  const choose = (col: DrawColor) => {
    tick();
    onColor(col);
    pushRecent(col);
    if (tool === 'eraser') onTool('pen');
  };

  return (
    <View className={dense ? 'gap-2' : 'gap-2.5'}>
      <View accessibilityRole="toolbar" accessibilityLabel="Brushes" className="flex-row items-center">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-1.5" className="flex-1">
          {tools.map((id) => {
            const { label, Icon } = TOOL_INFO[id];
            const on = tool === id;
            return (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: on }}
                onPress={() => {
                  tick();
                  onTool(id);
                }}
                className={cn('items-center justify-center rounded-[14px]', on ? 'bg-plum-800' : 'bg-paper-raised')}
                style={{ width: btn, height: btn }}
              >
                <Icon size={19} color={on ? '#FCFAFB' : c.inkSoft} />
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Undo my last stroke"
          accessibilityState={{ disabled: !canUndo }}
          disabled={!canUndo}
          onPress={() => {
            tick();
            onUndo();
          }}
          className={cn('ml-1.5 items-center justify-center rounded-[14px] bg-paper-raised', !canUndo && 'opacity-40')}
          style={{ width: btn, height: btn }}
        >
          <Undo2 size={19} color={c.inkSoft} />
        </Pressable>
      </View>

      {onSize && size !== undefined ? (
        <View accessibilityLabel="Brush size" className="h-11 flex-row items-center gap-2.5 rounded-[14px] bg-paper-raised px-3">
          {DRAW_SIZES.map((s, i) => {
            const on = Math.abs(size - s.w) < 2;
            const d = [4, 7, 11, 15, 19][i]!;
            return (
              <Pressable
                key={s.id}
                accessibilityRole="radio"
                accessibilityLabel={s.name}
                accessibilityState={{ checked: on }}
                hitSlop={6}
                onPress={() => {
                  tick();
                  onSize(s.w);
                }}
                className="h-6 w-6 items-center justify-center rounded-full"
                style={on ? { borderWidth: 2, borderColor: c.rose } : null}
              >
                <View className="rounded-full" style={{ width: d, height: d, backgroundColor: on ? '#241933' : '#B39ACC' }} />
              </Pressable>
            );
          })}
          <Slider label="Brush size" value={(size - BRUSH_MIN) / (BRUSH_MAX - BRUSH_MIN)} onChange={(v) => onSize(Math.round(BRUSH_MIN + v * (BRUSH_MAX - BRUSH_MIN)))} />
          <Text className="w-8 text-right text-[12px] text-ink-muted">{String(size)}</Text>
        </View>
      ) : null}

      <View accessibilityRole="radiogroup" accessibilityLabel="Colour" className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Colour: ${hex}. Open all colours`}
          onPress={() => setSheet(true)}
          className="items-center justify-center rounded-full"
          style={{ width: btn + 4, height: btn + 4, borderWidth: 2, borderColor: '#241933' }}
        >
          <Swatch c={color} size={btn - 4} />
        </Pressable>
        <View className="mx-0.5 h-7 w-px bg-paper-edge" />
        {recent.slice(0, dense ? 5 : 6).map((r, i) => (
          <Pressable key={`${String(r)}-${i}`} accessibilityRole="radio" accessibilityLabel={colorOf(r)} accessibilityState={{ checked: colorOf(r) === hex }} hitSlop={3} onPress={() => choose(r)}>
            <Swatch c={r} size={dense ? 28 : 32} />
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel="More colours" onPress={() => setSheet(true)} className="ml-auto">
          <Wheel size={dense ? 36 : 40} />
        </Pressable>
      </View>

      <ColourSheet open={sheet} onClose={() => setSheet(false)} value={color} onPick={choose} />
    </View>
  );
}

/** The brush I'm drawing with: tool, colour and width. */
export function useBrush(start: { tool?: DrawTool; color?: DrawColor; size?: number } = {}) {
  const [tool, setTool] = useState<DrawTool>(start.tool ?? 'pen');
  const [color, setColor] = useState<DrawColor>(start.color ?? 1);
  const [size, setSize] = useState(start.size ?? 50);
  return { tool, setTool, color, setColor, size, setSize };
}
