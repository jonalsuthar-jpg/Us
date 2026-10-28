import { tokens } from '@us/shared';
import * as Haptics from 'expo-haptics';
import { Camera, Image as ImageIcon, PenLine, Sparkles, Sticker, type LucideIcon } from 'lucide-react-native';
import { Modal, Pressable, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Text } from '../ui/text';

const { colors } = tokens;

export interface AttachOption {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Top and bottom of the tile's two-tone disc. */
  tint: [string, string];
  onPress: () => void;
}

/** Tile colours, one family each so they're told apart at a glance. */
export const ATTACH_TINTS = {
  gallery: [colors.plum[400], colors.plum[600]],
  camera: [colors.rose[400], colors.rose[600]],
  draw: [colors.teal[400], colors.teal[600]],
  gif: [colors.gold[400], colors.gold[600]],
  sticker: [colors.sage[400], colors.sage[600]],
} satisfies Record<string, [string, string]>;

export const ATTACH_ICONS = { gallery: ImageIcon, camera: Camera, draw: PenLine, gif: Sparkles, sticker: Sticker };

/**
 * What the paperclip opens: a card of round, colour-coded tiles floating
 * above the message bar, like WhatsApp's attach menu.
 */
export function AttachSheet({ open, onClose, options }: { open: boolean; onClose: () => void; options: AttachOption[] }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} className="flex-1 justify-end bg-plum-900/25 px-3" style={{ paddingBottom: insets.bottom + 72 }}>
        {open ? (
          <Animated.View entering={FadeInDown.duration(200).springify().damping(18)}>
            <Pressable className="flex-row flex-wrap rounded-[28px] border border-paper-edge bg-paper-raised px-2 py-5" style={{ elevation: 12, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } }}>
              {options.map((o) => (
                <Tile
                  key={o.key}
                  option={o}
                  onPress={() => {
                    void Haptics.selectionAsync().catch(() => {});
                    onClose();
                    o.onPress();
                  }}
                />
              ))}
            </Pressable>
          </Animated.View>
        ) : null}
      </Pressable>
    </Modal>
  );
}

function Tile({ option, onPress }: { option: AttachOption; onPress: () => void }) {
  const Icon = option.icon;
  const [top, bottom] = option.tint;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={option.label} onPress={onPress} className="w-1/3 items-center gap-2 py-2.5 active:opacity-70">
      {/* A disc lit from above, with a soft coloured glow beneath. */}
      <View className="h-[58px] w-[58px] items-center justify-center rounded-full" style={{ backgroundColor: bottom, elevation: 4, shadowColor: bottom, shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }}>
        <Svg width={58} height={58} style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id={`g-${option.key}`} x1="0" y1="0" x2="0.3" y2="1">
              <Stop offset="0" stopColor={top} />
              <Stop offset="1" stopColor={bottom} />
            </LinearGradient>
          </Defs>
          <Circle cx={29} cy={29} r={29} fill={`url(#g-${option.key})`} />
          <Circle cx={29} cy={29} r={28.25} fill="none" stroke="#fff" strokeOpacity={0.22} strokeWidth={1.5} />
        </Svg>
        <Icon size={25} color="#fff" strokeWidth={1.9} />
      </View>
      <Text className="text-small text-ink-soft">{option.label}</Text>
    </Pressable>
  );
}
