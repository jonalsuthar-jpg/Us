import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';
import { cn } from './cn';
import { Text } from './text';
import { usePalette } from './palette';

type Variant = 'primary' | 'secondary' | 'quiet' | 'night' | 'end' | 'accept';

const SURFACE: Record<Variant, string> = {
  primary: 'bg-rose-600 active:bg-rose-700',
  secondary: 'border border-plum-200 bg-transparent active:bg-paper-sunken',
  quiet: 'bg-transparent',
  night: 'bg-white/10 active:bg-white/20',
  end: 'bg-rose-600 active:bg-rose-700',
  accept: 'bg-sage-500 active:bg-sage-600',
};

const LABEL: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-ink',
  quiet: 'text-ink-soft underline',
  night: 'text-paper',
  end: 'text-white',
  accept: 'text-white',
};

interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  children: string;
  className?: string;
}

export function Button({ variant = 'primary', size = 'md', loading, icon, children, className, disabled, onPress, ...props }: ButtonProps) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      onPress={(e) => {
        void Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      className={cn(
        'flex-row items-center justify-center gap-2 rounded-control',
        size === 'sm' ? 'h-10 px-4' : size === 'lg' ? 'h-14 px-7' : 'h-12 px-5',
        SURFACE[variant],
        (disabled || loading) && 'opacity-50',
        className,
      )}
      {...props}
    >
      {loading ? <ActivityIndicator color={variant === 'secondary' || variant === 'quiet' ? c.ink : '#fff'} /> : icon}
      <Text className={cn('font-sans-medium', size === 'lg' ? 'text-lead' : 'text-body', LABEL[variant])}>{children}</Text>
    </Pressable>
  );
}

type Tone = 'paper' | 'raised' | 'rose' | 'night' | 'nightOff' | 'end' | 'accept';

const TONE: Record<Tone, string> = {
  paper: 'bg-transparent active:bg-paper-sunken',
  raised: 'border border-paper-edge bg-paper-raised active:bg-paper-sunken',
  rose: 'bg-rose-50 active:bg-rose-100',
  night: 'bg-white/10 active:bg-white/20',
  // Inverted "off" state on call screens: stays light in both themes.
  nightOff: 'bg-white active:bg-white/85',
  end: 'bg-rose-600 active:bg-rose-700',
  accept: 'bg-sage-500 active:bg-sage-600',
};

const SIZE = { sm: 'h-10 w-10', md: 'h-12 w-12', lg: 'h-14 w-14', xl: 'h-[72px] w-[72px]' };

export function IconButton({
  label,
  tone = 'paper',
  size = 'md',
  selected,
  children,
  className,
  onPress,
  ...props
}: Omit<PressableProps, 'children'> & {
  label: string;
  tone?: Tone;
  size?: keyof typeof SIZE;
  selected?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={6}
      onPress={(e) => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.(e);
      }}
      className={cn('items-center justify-center rounded-full', SIZE[size], TONE[tone], className)}
      {...props}
    >
      {children}
    </Pressable>
  );
}
