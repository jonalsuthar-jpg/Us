import { View, type ViewProps } from 'react-native';
import { cn } from './cn';

type Tone = 'paper' | 'inset' | 'note' | 'night';
type Accent = 'none' | 'rose' | 'teal' | 'gold' | 'sage' | 'plum';

const TONE: Record<Tone, string> = {
  paper: 'rounded-sheet border border-paper-edge bg-paper-raised shadow-sm shadow-plum-800/20',
  inset: 'rounded-sheet bg-paper-sunken',
  note: 'rounded-r-sheet border-l-[3px] bg-paper-raised',
  night: 'rounded-sheet bg-plum-800',
};
const ACCENT: Record<Accent, string> = {
  none: '',
  rose: 'border-l-rose-400',
  teal: 'border-l-teal-500',
  gold: 'border-l-gold-400',
  sage: 'border-l-sage-400',
  plum: 'border-l-plum-500',
};

/** Same four surfaces as the web Sheet. */
export function Sheet({
  tone = 'paper',
  accent = 'none',
  pad = 'md',
  className,
  ...props
}: ViewProps & { tone?: Tone; accent?: Accent; pad?: 'none' | 'sm' | 'md' | 'lg'; className?: string }) {
  const p = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-7' }[pad];
  return <View className={cn(TONE[tone], ACCENT[accent], p, className)} {...props} />;
}
