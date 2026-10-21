import type { PartnerSlot } from '@us/shared';
import { useOptionalCouple } from '@us/shared/react';
import { Image, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { cn } from './cn';
import { Text } from './text';

const SIZES = {
  sm: { box: 'h-8 w-8', text: 'text-micro' },
  md: { box: 'h-11 w-11', text: 'text-small' },
  lg: { box: 'h-20 w-20', text: 'text-title' },
  xl: { box: 'h-32 w-32', text: 'text-hero' },
};

const SLOT = { a: 'bg-rose-100 border-rose-400', b: 'bg-teal-100 border-teal-500' };
const INK = { a: 'text-rose-800', b: 'text-teal-800' };

export function Avatar({
  name,
  slot,
  src,
  size = 'md',
  online,
  className,
}: {
  name: string;
  slot: PartnerSlot;
  src?: string | null;
  size?: keyof typeof SIZES;
  online?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  // Inside a paired session, the profile photo of whoever owns this colour.
  const couple = useOptionalCouple();
  const photo = src ?? couple?.photoOf(slot) ?? null;
  return (
    <View
      className={cn('relative', className)}
      accessible
      accessibilityLabel={online === undefined ? name : `${name}, ${online ? 'here now' : 'away'}`}
    >
      <View className={cn('items-center justify-center overflow-hidden rounded-full border-2', s.box, SLOT[slot])}>
        {photo ? (
          <Image source={{ uri: photo }} className="h-full w-full" />
        ) : (
          <Text className={cn('font-sans-semibold', s.text, INK[slot])}>{name.trim().charAt(0).toUpperCase() || '·'}</Text>
        )}
      </View>
      {online !== undefined && (
        <View
          className={cn(
            'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-paper',
            online ? 'bg-sage-400' : 'bg-plum-200',
          )}
        />
      )}
    </View>
  );
}

/** The couple's mark — two overlapping circles. */
export function Seal({ size = 40 }: { size?: number }) {
  const r = size * 0.32;
  const o = size * 0.18;
  return (
    <Svg width={size} height={size} accessibilityElementsHidden>
      <Circle cx={size / 2 - o} cy={size / 2} r={r} fill="#F5547C" />
      <Circle cx={size / 2 + o} cy={size / 2} r={r} fill="#0C8F82" opacity={0.88} />
    </Svg>
  );
}
