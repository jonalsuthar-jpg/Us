'use client';

import { isStickerMime } from '@us/shared';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export type PastedSendAs = 'gif' | 'sticker' | 'video';

/**
 * A GIF, sticker or picture pasted into the message box, with how to send it:
 * as a GIF / picture (in a bubble, as it is, never re-encoded so a GIF keeps
 * moving), or as a sticker (no bubble, and kept in Ours). A PNG or WebP is
 * most likely a sticker, so that's offered first.
 */
export function PastedMediaDialog({
  file,
  stickers,
  onClose,
  onSend,
}: {
  file: File | null;
  /** Whether our stickers are on for this couple. */
  stickers: boolean;
  onClose: () => void;
  onSend: (file: File, as: PastedSendAs) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return setUrl(null);
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const video = !!file?.type.startsWith('video/');
  const options: { as: PastedSendAs; label: string }[] = video
    ? [{ as: 'video', label: 'Send as video' }]
    : [
        { as: 'gif', label: file?.type === 'image/gif' ? 'Send as GIF' : 'Send as picture' },
        ...(stickers && file && isStickerMime(file.type) ? [{ as: 'sticker' as const, label: 'Send as sticker' }] : []),
      ];
  if (!video && options.length > 1 && file?.type !== 'image/gif') options.reverse();

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose()} title={video ? 'Send this video?' : 'Send this?'} className="sm:w-[min(92vw,420px)]">
      <div className="flex justify-center">
        {url && file ? (
          video ? (
            <video src={url} autoPlay loop muted playsInline className="max-h-64 rounded-[14px]" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Preview" className="max-h-64 object-contain" />
          )
        ) : null}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {options.map((o, i) => (
          <Button key={o.as} block variant={i === 0 ? 'primary' : 'secondary'} onClick={() => file && onSend(file, o.as)}>
            {o.label}
          </Button>
        ))}
      </div>
    </Dialog>
  );
}
