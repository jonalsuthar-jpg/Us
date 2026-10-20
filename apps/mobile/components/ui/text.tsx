import { Text as RNText, type TextProps } from 'react-native';
import { cn } from './cn';

/** Body copy in Work Sans. */
export function Text({ className, ...props }: TextProps & { className?: string }) {
  return <RNText className={cn('font-sans text-body text-ink', className)} {...props} />;
}

/** The serif — for names, moments and memories. Use deliberately. */
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
  return <RNText accessibilityRole="header" className={cn(family, 'text-ink', className)} {...props} />;
}
