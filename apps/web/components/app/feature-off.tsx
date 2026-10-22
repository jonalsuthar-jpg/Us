import { Sheet } from '@/components/ui/sheet';

/** In place of a part of Us this couple doesn't have, or one that's paused for now. */
export function FeatureOff({ paused }: { paused?: string | null }) {
  return (
    <Sheet tone="inset" pad="lg" className="text-center">
      <p className="font-display text-heading text-ink">{paused ? 'Taking a short break' : 'Not part of your space yet'}</p>
      <p className="mx-auto mt-2 max-w-sm text-small text-ink-soft">
        {paused || 'This part of Us isn’t switched on for the two of you. It may open up later.'}
      </p>
    </Sheet>
  );
}
