import type { PartnerSlot } from '@us/shared';
import { Plus } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { cn } from '../ui/cn';
import { Text } from '../ui/text';
import { SLOT_BG } from './tones';

/** The rose pill in a section's corner that opens its add form. */
export function AddPill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="h-11 flex-row items-center justify-center gap-1.5 rounded-control bg-rose-600 px-4 active:bg-rose-700"
    >
      <Plus size={18} color="#fff" strokeWidth={2.4} />
      <Text className="font-sans-semibold text-white">{label}</Text>
    </Pressable>
  );
}

/** Small caps heading over a group. */
export function GroupLabel({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="font-sans-semibold text-micro uppercase tracking-[0.8px] text-ink-soft">{children}</Text>
      {right}
    </View>
  );
}

/** A partner's initial in their colour. */
export function Initial({ slot, name, size = 30 }: { slot: PartnerSlot; name: string; size?: number }) {
  return (
    <View className={cn('items-center justify-center rounded-full', SLOT_BG[slot])} style={{ width: size, height: size }}>
      <Text className="font-sans-semibold text-white" style={{ fontSize: size * 0.42 }}>
        {(name.trim()[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );
}

/** A thin progress ring, 0–1. */
export function Ring({ value, color, track, size = 36, stroke = 4 }: { value: number; color: string; track: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${Math.max(0, Math.min(1, value)) * len} ${len}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

/** A two-colour split bar: `aShare` of it in A's colour (0–1). */
export function SplitBar({ left, leftColor, rightColor, height = 8 }: { left: number; leftColor: string; rightColor: string; height?: number }) {
  return (
    <View className="flex-row overflow-hidden rounded-full bg-paper-sunken" style={{ height }}>
      <View style={{ width: `${Math.round(left * 100)}%`, backgroundColor: leftColor }} />
      <View style={{ flex: 1, backgroundColor: rightColor }} />
    </View>
  );
}

/** Choice pill with a wash when picked. */
export function Pick({
  selected,
  onPress,
  children,
  icon,
  className,
}: {
  selected: boolean;
  onPress: () => void;
  children: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'min-h-[40px] flex-row items-center justify-center gap-1.5 rounded-full border-[1.5px] px-3.5',
        selected ? 'border-plum-400 bg-plum-50' : 'border-paper-edge bg-paper-raised active:bg-paper-sunken',
        className,
      )}
    >
      {icon}
      <Text className={cn('text-small', selected ? 'font-sans-semibold text-ink' : 'font-sans-medium text-ink-soft')}>{children}</Text>
    </Pressable>
  );
}
