'use client';

import { markDoodleSeen, type Drawing } from '@us/shared';
import { useCouple, useDrawings, usePartnerDrawing, useUnseenDoodles } from '@us/shared/react';
import { PenLine } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { DoodleDialog } from './doodle-dialog';

/** "{name} is drawing · Join", while my partner has the live canvas open. */
export function DrawingBanner() {
  const { partner } = useCouple();
  const drawing = usePartnerDrawing();
  const path = usePathname();
  if (!drawing || path.startsWith('/connect/draw')) return null;
  return (
    <div role="status" className="flex items-center gap-3 rounded-[18px] bg-teal-900 py-3 pl-3.5 pr-3 text-paper">
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-teal-500">
        <PenLine className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body font-semibold">{partner.display_name} is drawing</span>
        <span className="text-micro text-teal-200">Draw on the same canvas</span>
      </span>
      <Link href="/connect/draw" className="flex h-10 items-center rounded-xl bg-paper px-4 text-body font-semibold text-teal-900 hover:bg-white">
        Join
      </Link>
    </div>
  );
}

/** The doodle my partner left me, as a sticky note, until I open it. Then "Doodle back". */
export function DoodleNote() {
  const { sb, partner } = useCouple();
  const { doodles, reload } = useUnseenDoodles();
  const { urls, reload: reloadUrls } = useDrawings();
  const [open, setOpen] = useState<Drawing | null>(null);
  const [back, setBack] = useState(false);
  const doodle = doodles[0];
  useEffect(() => {
    if (doodle && !urls[doodle.png_path]) reloadUrls();
  }, [doodle, urls, reloadUrls]);

  if (!doodle) {
    return (
      <>
        <button type="button" onClick={() => setBack(true)} className="flex w-full items-center gap-3 rounded-[20px] bg-paper-sunken px-4 py-3.5 text-left hover:bg-paper-edge/60">
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-rose-100 text-rose-600">
            <PenLine className="h-5 w-5" aria-hidden />
          </span>
          <span className="flex flex-1 flex-col">
            <span className="text-body font-semibold text-ink">Leave a doodle</span>
            <span className="text-micro text-ink-soft">It waits on {partner.display_name}’s Home</span>
          </span>
        </button>
        <DoodleDialog open={back} onOpenChange={setBack} />
      </>
    );
  }

  const url = urls[doodle.png_path];
  return (
    <div className="space-y-4">
      <div className="px-3 pt-3">
        <button
          type="button"
          aria-label={`Open ${partner.display_name}’s doodle`}
          onClick={() => {
            setOpen(doodle);
            void markDoodleSeen(sb, doodle.id).catch(() => {});
          }}
          className="relative mx-auto block w-full max-w-[300px] -rotate-[2.5deg] rounded-[6px_6px_22px_6px] bg-[#FFEDC0] px-[18px] pb-4 pt-[18px] text-left shadow-[0_16px_30px_rgba(124,80,6,0.18)] transition-transform hover:rotate-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          <span aria-hidden className="absolute -top-3 left-1/2 h-6 w-[86px] -translate-x-1/2 rotate-3 rounded-[3px] bg-white/65" />
          <span className="flex items-center justify-between">
            <span className="text-micro font-bold uppercase tracking-[0.04em] text-[#7C5006]">A doodle for you</span>
            <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[12px] font-bold text-white">New</span>
          </span>
          <span className="my-1.5 block aspect-[264/230] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {url ? <img src={url} alt="" className="h-full w-full object-contain mix-blend-multiply" /> : null}
          </span>
          <span className="block font-serif text-lead italic text-[#563805]">
            {doodle.note ? `“${doodle.note}” — ` : '— '}
            {partner.display_name}
          </span>
        </button>
      </div>
      <Dialog
        open={!!open}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(null);
            reload();
          }
        }}
        title={`From ${partner.display_name}`}
        description={open?.note ?? undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {open && urls[open.png_path] ? <img src={urls[open.png_path]} alt="Doodle" className="w-full rounded-[18px] border border-paper-edge bg-white" /> : null}
        <Button
          block
          className="mt-4"
          onClick={() => {
            setOpen(null);
            reload();
            setBack(true);
          }}
        >
          <PenLine className="h-[18px] w-[18px]" aria-hidden /> Doodle back
        </Button>
      </Dialog>
      <DoodleDialog open={back} onOpenChange={setBack} />
    </div>
  );
}
