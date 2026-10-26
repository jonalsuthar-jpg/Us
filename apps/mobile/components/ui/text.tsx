import { Text as RNText, type TextProps } from 'react-native';
import { cn } from './cn';

/**
 * A text colour in className. NativeWind settles two colours by stylesheet
 * order, not by their order in the string, so the default ink is only added
 * when no colour is given (else e.g. text-gold-300 can lose to ink).
 */
const HAS_COLOR = /(^|\s)text-(ink|paper|white|black|transparent|rose|teal|gold|sage|plum)(-|\/|\s|$)/;
const ink = (className?: string) => (className && HAS_COLOR.test(className) ? null : 'text-ink');

/** Body copy in Inter. */
export function Text({ className, ...props }: TextProps & { className?: string }) {
  return <RNText className={cn('font-sans text-body', ink(className), className)} {...props} />;
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
  return <RNText accessibilityRole="header" className={cn(family, family === 'font-display' && 'tracking-[-0.3px]', ink(className), className)} {...props} />;
}
