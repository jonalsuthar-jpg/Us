'use client';

import { removeSticker, STICKERS_TOPIC, type Sticker } from '@us/shared';
import { useCouple, useStickers } from '@us/shared/react';
import { Plus, X } from 'lucide-react';
import { Spinner } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

/** Our stickers: make a new one, or click one to send it. */
export function StickerPicker({
  open,
  onOpenChange,
  onMake,
  onSend,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onMake: () => void;
  onSend: (s: Sticker, url: string | undefined) => void;
}) {
  const { sb, me, channel } = useCouple();
  const { stickers, urls, loading, reload } = useStickers(open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Our stickers" className="sm:w-[min(94vw,480px)]">
      <div className="grid max-h-[60vh] grid-cols-3 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-4">
        <button
          type="button"
          onClick={onMake}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[18px] border-2 border-dashed border-rose-300 text-center text-small font-semibold text-rose-600 hover:bg-rose-50"
        >
          <Plus className="h-6 w-6" aria-hidden />
          Make a sticker
        </button>
        {stickers.map((s) => (
          <div key={s.id} className="group relative aspect-square">
            <button
              type="button"
              aria-label="Send sticker"
              onClick={() => onSend(s, urls[s.path])}
              className="flex h-full w-full items-center justify-center rounded-[18px] bg-paper-sunken p-2 hover:bg-paper-edge/70"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {urls[s.path] ? <img src={urls[s.path]} alt="" className="h-full w-full object-contain" /> : null}
            </button>
            {s.created_by === me.id ? (
              <button
                type="button"
                aria-label="Remove from our stickers"
                title="Remove (messages already sent keep it)"
                onClick={() =>
                  void removeSticker(sb, s.id)
                    .then(() => {
                      channel.sendChanged(STICKERS_TOPIC);
                      reload();
                    })
                    .catch(() => {})
                }
                className="absolute right-1 top-1 hidden h-7 w-7 items-center justify-center rounded-full bg-paper-raised text-ink-soft shadow group-hover:flex focus-visible:flex"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {loading ? (
        <div className="flex justify-center pt-3">
          <Spinner className="h-5 w-5 text-rose-400" />
        </div>
      ) : !stickers.length ? (
        <p className="pt-3 text-center text-small text-ink-soft">Make one from a photo: tap the person or thing to lift it out, then add text or a doodle.</p>
      ) : null}
    </Dialog>
  );
}
