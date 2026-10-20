import type { PartnerSlot } from '@us/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

/** "●●●" in their colour, with an aria-live announcement for screen readers. */
export function TypingBubble({ visible, name, slot }: { visible: boolean; name: string; slot: PartnerSlot }) {
  return (
    <div aria-live="polite" className="min-h-[44px] pt-2">
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className={cn(
              'inline-flex items-center gap-1 rounded-bubble rounded-bl-hair border px-4 py-3',
              slot === 'a' ? 'border-rose-200/70 bg-rose-50' : 'border-teal-200/70 bg-teal-50',
            )}
          >
            <span className="sr-only">{name} is typing…</span>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                aria-hidden
                className={cn(
                  'h-1.5 w-1.5 animate-typing-dot rounded-full',
                  slot === 'a' ? 'bg-rose-500' : 'bg-teal-600',
                )}
                style={{ animationDelay: `${i * 160}ms` }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
