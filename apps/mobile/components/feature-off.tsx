import { Sheet } from '@/components/ui/sheet';
import { Display, Text } from '@/components/ui/text';

/** In place of a part of Us this couple doesn't have, or one that's paused for now. */
export function FeatureOff({ paused }: { paused?: string | null }) {
  return (
    <Sheet tone="inset" pad="lg" className="items-center">
      <Display className="text-center text-heading">{paused ? 'Taking a short break' : 'Not part of your space yet'}</Display>
      <Text className="mt-2 text-center text-small text-ink-soft">
        {paused || 'This part of Us isn’t switched on for the two of you. It may open up later.'}
      </Text>
    </Sheet>
  );
}
