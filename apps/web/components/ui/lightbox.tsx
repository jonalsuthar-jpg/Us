'use client';

import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';

/** The whole photo, uncropped; click to see it full screen. */
export function Photo({ src, label, className }: { src: string; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label}. Open full screen`}
        className={cn(
          'block w-full cursor-zoom-in overflow-hidden rounded-control bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
          className,
        )}
      >
        <img src={src} alt="" className="mx-auto max-h-[60dvh] w-auto max-w-full object-contain" />
      </button>
      <Lightbox src={open ? src : null} label={label} onClose={() => setOpen(false)} />
    </>
  );
}

/** Black full-screen viewer; click the photo to toggle actual size. */
export function Lightbox({ src, label, onClose }: { src: string | null; label: string; onClose: () => void }) {
  const [actual, setActual] = useState(false);
  return (
    <D.Root
      open={!!src}
      onOpenChange={(o) => {
        if (!o) {
          setActual(false);
          onClose();
        }
      }}
    >
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-black/95" />
        <D.Content
          className={cn('fixed inset-0 z-[60] focus:outline-none', actual ? 'overflow-auto' : 'flex items-center justify-center')}
          aria-describedby={undefined}
        >
          <D.Title className="sr-only">{label}</D.Title>
          {src ? (
            <img
              src={src}
              alt={label}
              onClick={() => setActual((a) => !a)}
              className={cn(
                actual ? 'max-w-none cursor-zoom-out' : 'max-h-dvh max-w-full cursor-zoom-in object-contain',
              )}
            />
          ) : null}
          <D.Close
            aria-label="Close photo"
            className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <X className="h-5 w-5" />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
