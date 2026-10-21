'use client';

import { firstUnseen, type Snap } from '@us/shared';
import { useCouple, useSnaps } from '@us/shared/react';
import { Camera, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { PostSnap } from './post-snap';
import { StoryViewer } from './story-viewer';

/** Today's snaps: my partner's story and mine, each lasting 24 hours. */
export function SnapRow() {
  const { partner } = useCouple();
  const snaps = useSnaps();
  const [viewing, setViewing] = useState<'mine' | 'partner' | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const d = snaps.data;
  const story = viewing && d ? d[viewing] : null;
  // The story ran out (expired, or I deleted the last one): close it.
  useEffect(() => {
    if (viewing && d && !d[viewing].length) setViewing(null);
  }, [viewing, d]);

  const theirs = d?.partner ?? [];
  const mine = d?.mine ?? [];
  const unseen = theirs.some((s) => !s.seen_at);
  const myLatest = mine.at(-1);

  return (
    <Sheet pad="sm" className="flex items-center gap-4">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) setFile(f);
        }}
      />
      <Ring
        label={theirs.length ? `${partner.display_name}’s snaps${unseen ? ', new' : ''}` : `${partner.display_name} hasn’t shared a snap`}
        snap={theirs.at(-1)}
        state={!theirs.length ? 'empty' : unseen ? 'new' : 'seen'}
        caption={partner.display_name}
        onClick={theirs.length ? () => setViewing('partner') : undefined}
      />
      <Ring
        label={mine.length ? 'Your snaps' : 'Share a snap'}
        snap={myLatest}
        state={mine.length ? 'seen' : 'add'}
        caption={myLatest?.seen_at ? `Seen${myLatest.reaction ? ` ${myLatest.reaction}` : ''}` : 'You'}
        onClick={mine.length ? () => setViewing('mine') : () => fileInput.current?.click()}
      />
      <div className="min-w-0 flex-1">
        <p className="text-micro font-medium text-rose-700">Snaps · 24 hours</p>
        <p className="text-small text-ink-soft">
          {unseen ? `${partner.display_name} shared something new.` : 'A photo of your day. It’s gone tomorrow, unless you keep it.'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        aria-label="Share a snap"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-700 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
      >
        <Camera className="h-5 w-5" />
      </button>

      <PostSnap file={file} onClose={() => setFile(null)} mutate={snaps.mutate} />
      <StoryViewer
        snaps={story}
        start={story && viewing === 'partner' ? firstUnseen(story) : 0}
        kept={d?.kept ?? new Set()}
        onClose={() => setViewing(null)}
        mutate={snaps.mutate}
      />
    </Sheet>
  );
}

function Ring({
  label,
  snap,
  state,
  caption,
  onClick,
}: {
  label: string;
  snap?: Snap;
  state: 'new' | 'seen' | 'empty' | 'add';
  caption: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-label={label}
      className="flex w-16 shrink-0 flex-col items-center gap-1 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 disabled:cursor-default"
    >
      <span
        className={cn(
          'relative flex h-14 w-14 items-center justify-center rounded-full p-[3px]',
          state === 'new' ? 'bg-gradient-to-tr from-rose-500 to-gold-400' : state === 'seen' ? 'bg-plum-200' : 'border-2 border-dashed border-ink/20',
        )}
      >
        {snap?.url ? (
          <img src={snap.url} alt="" className="h-full w-full rounded-full border-2 border-paper-raised object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center rounded-full bg-paper-sunken text-ink-muted">
            {state === 'add' ? <Plus className="h-5 w-5" /> : null}
          </span>
        )}
      </span>
      <span className="w-full truncate text-center text-micro text-ink-soft">{caption}</span>
    </button>
  );
}
