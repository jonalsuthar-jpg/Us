import type { Feature } from '@us/shared';
import { Hourglass, Lock } from 'lucide-react';
import { cn } from '@/lib/cn';

type Privacy = Feature['privacy'];

/**
 * The private/shared boundary, made visible. Every surface that holds personal
 * data carries one of these so nobody ever has to guess what their partner sees.
 *
 *   shared               two linked circles · "Shared with {name}"   (teal/rose)
 *   private              lock · "Only you"                           (plum)
 *   private-until-reveal hourglass · "Hidden until you've both..."   (gold)
 */
export function PrivacyBadge({
  privacy,
  partnerName,
  className,
  compact,
}: {
  privacy: Privacy;
  partnerName: string;
  className?: string;
  compact?: boolean;
}) {
  const copy = {
    shared: `Shared with ${partnerName}`,
    private: 'Only you',
    'private-until-reveal': 'Hidden until you’ve both answered',
  }[privacy];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full py-1 pl-1.5 pr-2.5 text-micro font-medium',
        privacy === 'shared' && 'bg-teal-50 text-teal-700',
        privacy === 'private' && 'bg-plum-50 text-plum-700',
        privacy === 'private-until-reveal' && 'bg-gold-50 text-gold-700',
        className,
      )}
    >
      {privacy === 'shared' ? (
        <SharedGlyph />
      ) : privacy === 'private' ? (
        <Lock className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
      ) : (
        <Hourglass className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
      )}
      <span className={compact ? 'sr-only' : undefined}>{copy}</span>
    </span>
  );
}

function SharedGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
      <circle cx="5.75" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="10.25" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
