import { DRAW_COLORS, DRAW_SIZES, type DrawSize, type DrawTool } from '@us/shared';
import * as Haptics from 'expo-haptics';
import { Eraser, Highlighter, Pen, Undo2 } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';

const TOOLS: { id: DrawTool; label: string; Icon: typeof Pen }[] = [
  { id: 'pen', label: 'Pen', Icon: Pen },
  { id: 'marker', label: 'Marker', Icon: Highlighter },
  { id: 'eraser', label: 'Eraser', Icon: Eraser },
];

const tick = () => void Haptics.selectionAsync().catch(() => {});

interface Props {
  tool: DrawTool;
  onTool: (t: DrawTool) => void;
  color: number;
  onColor: (c: number) => void;
  size?: DrawSize;
  onSize?: (s: DrawSize) => void;
  onUndo: () => void;
  canUndo: boolean;
  /** Which colours to offer (indexes into DRAW_COLORS). */
  colors?: number[];
  /** Tool buttons only, colours in their own row below (the full board). */
  layout?: 'full' | 'compact';
  tools?: DrawTool[];
}

/** Pen, marker, eraser, size, undo; then the colours. */
export function Toolbar({ tool, onTool, color, onColor, size, onSize, onUndo, canUndo, colors, layout = 'full', tools = ['pen', 'marker', 'eraser'] }: Props) {
  const c = usePalette();
  const palette = colors ?? DRAW_COLORS.map((_, i) => i);
  const btn = layout === 'full' ? 'h-12 w-12 rounded-[14px]' : 'h-11 w-11 rounded-[14px]';

  const toolButtons = TOOLS.filter((t) => tools.includes(t.id)).map(({ id, label, Icon }) => (
    <Pressable
      key={id}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: tool === id }}
      onPress={() => {
        tick();
        onTool(id);
      }}
      className={cn('items-center justify-center', btn, tool === id ? 'bg-plum-800' : 'bg-paper-raised')}
    >
      <Icon size={20} color={tool === id ? '#FCFAFB' : c.inkSoft} />
    </Pressable>
  ));

  const undo = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Undo my last stroke"
      accessibilityState={{ disabled: !canUndo }}
      disabled={!canUndo}
      onPress={() => {
        tick();
        onUndo();
      }}
      className={cn('items-center justify-center bg-paper-raised', btn, !canUndo && 'opacity-40')}
    >
      <Undo2 size={20} color={c.inkSoft} />
    </Pressable>
  );

  const swatches = palette.map((i) => {
    const sw = DRAW_COLORS[i]!;
    const on = color === i;
    return (
      <Pressable
        key={sw.hex}
        accessibilityRole="radio"
        accessibilityLabel={sw.name}
        accessibilityState={{ checked: on }}
        hitSlop={4}
        onPress={() => {
          tick();
          onColor(i);
          if (tool === 'eraser') onTool('pen');
        }}
        className="h-[42px] w-[42px] items-center justify-center rounded-full"
        style={on ? { borderWidth: 2, borderColor: sw.hex } : null}
      >
        <View className="rounded-full" style={{ width: on ? 30 : 34, height: on ? 30 : 34, backgroundColor: sw.hex }} />
      </Pressable>
    );
  });

  if (layout === 'compact') {
    return (
      <View accessibilityRole="toolbar" className="flex-row flex-wrap items-center gap-2">
        {toolButtons}
        <View accessibilityRole="radiogroup" accessibilityLabel="Colour" className="flex-row items-center gap-0.5">
          {swatches}
        </View>
        <View className="ml-auto">{undo}</View>
      </View>
    );
  }

  return (
    <View className="gap-3.5">
      <View accessibilityRole="toolbar" accessibilityLabel="Tools" className="flex-row items-center gap-2">
        {toolButtons}
        {onSize && size ? (
          <View accessibilityRole="radiogroup" accessibilityLabel="Brush size" className="h-12 flex-1 flex-row items-center justify-center gap-4 rounded-[14px] bg-paper-raised">
            {DRAW_SIZES.map((s, i) => {
              const on = size === s.id;
              const d = [6, 11, 17][i]!;
              return (
                <Pressable
                  key={s.id}
                  accessibilityRole="radio"
                  accessibilityLabel={s.name}
                  accessibilityState={{ checked: on }}
                  hitSlop={8}
                  onPress={() => {
                    tick();
                    onSize(s.id);
                  }}
                  className="h-8 w-8 items-center justify-center rounded-full"
                  style={on ? { borderWidth: 2, borderColor: c.rose } : null}
                >
                  <View className="rounded-full" style={{ width: d, height: d, backgroundColor: on ? '#241933' : '#B39ACC' }} />
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View className="flex-1" />
        )}
        {undo}
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Colour" className="flex-row items-center justify-between">
        {swatches}
      </View>
    </View>
  );
}
