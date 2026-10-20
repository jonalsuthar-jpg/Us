import type { Feature } from '@us/shared';
import { Hourglass, Lock } from 'lucide-react-native';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { cn } from './cn';
import { Text } from './text';

/** Mirrors the web PrivacyBadge: the shared/private boundary, always visible. */
export function PrivacyBadge({ privacy, partnerName, className }: { privacy: Feature['privacy']; partnerName: string; className?: string }) {
  const copy = {
    shared: `Shared with ${partnerName}`,
    private: 'Only you',
    'private-until-reveal': 'Hidden until you’ve both answered',
  }[privacy];
  const tone = {
    shared: { bg: 'bg-teal-50', fg: 'text-teal-700', hex: '#31454C' },
    private: { bg: 'bg-plum-50', fg: 'text-plum-700', hex: '#382A3B' },
    'private-until-reveal': { bg: 'bg-gold-50', fg: 'text-gold-700', hex: '#6B4E1F' },
  }[privacy];

  return (
    <View
      accessible
      accessibilityLabel={copy}
      className={cn('flex-row items-center gap-1.5 self-start rounded-full py-1 pl-1.5 pr-2.5', tone.bg, className)}
    >
      {privacy === 'shared' ? (
        <Svg width={14} height={14} viewBox="0 0 16 16">
          <Circle cx={5.75} cy={8} r={4} fill="none" stroke={tone.hex} strokeWidth={1.8} />
          <Circle cx={10.25} cy={8} r={4} fill="none" stroke={tone.hex} strokeWidth={1.8} />
        </Svg>
      ) : privacy === 'private' ? (
        <Lock size={14} color={tone.hex} strokeWidth={2.25} />
      ) : (
        <Hourglass size={14} color={tone.hex} strokeWidth={2.25} />
      )}
      <Text className={cn('font-sans-medium text-micro', tone.fg)}>{copy}</Text>
    </View>
  );
}
