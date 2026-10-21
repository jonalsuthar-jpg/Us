import { Text as RNText, type TextProps } from 'react-native';
import { cn } from './cn';

/** Body copy in Inter. */
export function Text({ className, ...props }: TextProps & { className?: string }) {
  return <RNText className={cn('font-sans text-body text-ink', className)} {...props} />;
}

/**
 * Headings and names in Inter Bold. `light` / `italic` switch to the serif,
 * kept for warm moments (memories, empty states). Use those deliberately.
 */
export function Display({
  italic,
  light,
  className,
  ...props
}: TextProps & { className?: string; italic?: boolean; light?: boolean }) {
  const family = light
    ? italic
      ? 'font-display-light-italic'
      : 'font-display-light'
    : italic
      ? 'font-display-italic'
      : 'font-display';
  return <RNText accessibilityRole="header" className={cn(family, family === 'font-display' && 'tracking-[-0.3px]', 'text-ink', className)} {...props} />;
}
