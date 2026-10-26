import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { cn } from './cn';
import { Text } from './text';

/** Mirrors the web Segmented: mutually exclusive choices on an inset track. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  size = 'md',
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className={cn('flex-row rounded-control bg-paper-sunken p-1', className)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            className={cn(
              'flex-1 items-center justify-center rounded-[9px]',
              size === 'sm' ? 'px-1.5 py-1.5' : options.length > 3 ? 'px-1 py-2.5' : 'px-3 py-2.5',
              selected && 'bg-paper-raised shadow-sm shadow-plum-800/10',
            )}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              className={cn('text-small', selected ? 'font-sans-semibold text-ink' : 'font-sans-medium text-ink-soft')}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({
  selected,
  onPress,
  children,
  className,
  icon,
}: {
  selected?: boolean;
  onPress?: () => void;
  children: string;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-1 rounded-full border px-3 py-1.5',
        selected ? 'border-plum-300 bg-paper-raised' : 'border-paper-edge active:bg-paper-sunken',
        className,
      )}
    >
      {icon}
      <Text className={cn('text-small', selected ? 'text-ink' : 'text-ink-soft')}>{children}</Text>
    </Pressable>
  );
}
