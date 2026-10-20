'use client';

import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Modal sheet: rises from the bottom on small screens, centred on large. */
export function Dialog({ open, onOpenChange, title, description, children, className }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-plum-900/40 backdrop-blur-[2px]" />
        <D.Content
          className={cn(
            'fixed z-50 bg-paper-raised p-6 shadow-[0_24px_64px_-24px_rgba(23,15,33,0.5)] focus:outline-none',
            'inset-x-0 bottom-0 rounded-t-[28px] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(92vw,440px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-sheet',
            className,
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <D.Title className="font-display text-heading text-ink">{title}</D.Title>
              {description ? (
                <D.Description className="mt-1 text-small text-ink-soft">{description}</D.Description>
              ) : null}
            </div>
            <D.Close
              className="-mr-2 -mt-1 rounded-full p-2 text-ink-muted hover:bg-paper-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
