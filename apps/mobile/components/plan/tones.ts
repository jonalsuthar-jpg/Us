import type { EventKind, ExpenseCategory } from '@us/shared';
import {
  Circle,
  Gift,
  Heart,
  House,
  PartyPopper,
  Plane,
  ShoppingBag,
  SquareCheck,
  Star,
  Utensils,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import type { Palette } from '../ui/palette';

export type Tone = 'rose' | 'teal' | 'gold' | 'plum' | 'sage';

/** Pale wash + the deep stop for text on it; both flip with the theme. */
export const TONE: Record<Tone, { wash: string; ink: string }> = {
  rose: { wash: 'bg-rose-50', ink: 'text-rose-700' },
  teal: { wash: 'bg-teal-50', ink: 'text-teal-700' },
  gold: { wash: 'bg-gold-50', ink: 'text-gold-700' },
  plum: { wash: 'bg-plum-50', ink: 'text-plum-600' },
  sage: { wash: 'bg-sage-50', ink: 'text-sage-700' },
};

export const toneIcon = (c: Palette, tone: Tone) =>
  ({ rose: c.onRose, teal: c.onTeal, gold: c.onGold, plum: c.onPlum, sage: c.onSage })[tone];

export const KIND_STYLE: Record<EventKind, { tone: Tone; Icon: LucideIcon }> = {
  date: { tone: 'rose', Icon: Heart },
  trip: { tone: 'gold', Icon: Plane },
  birthday: { tone: 'plum', Icon: Gift },
  errand: { tone: 'teal', Icon: SquareCheck },
  other: { tone: 'sage', Icon: Star },
};

/** `bar` is a fixed brand fill for charts, the same in both themes. */
export const CATEGORY_STYLE: Record<ExpenseCategory, { tone: Tone; Icon: LucideIcon; bar: string }> = {
  food: { tone: 'rose', Icon: Utensils, bar: '#F5547C' },
  groceries: { tone: 'teal', Icon: ShoppingBag, bar: '#0C8F82' },
  rent: { tone: 'plum', Icon: House, bar: '#634882' },
  travel: { tone: 'gold', Icon: Plane, bar: '#F3A823' },
  fun: { tone: 'sage', Icon: PartyPopper, bar: '#37AC5F' },
  bills: { tone: 'plum', Icon: Zap, bar: '#B39ACC' },
  other: { tone: 'plum', Icon: Circle, bar: '#D4C2E6' },
};

/** Partner colours: rose for A, teal for B. */
export const SLOT_FILL = { a: '#F5547C', b: '#0C8F82' } as const;
export const SLOT_BG = { a: 'bg-rose-400', b: 'bg-teal-500' } as const;
