'use client';

import { useCouple, useDrawGame, useDrawHub, useFeature } from '@us/shared/react';
import { MessageCircleQuestion } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Keeps the drawing hub listening from the moment the app opens (so the live
 * canvas and game invites are there when either of us looks), and shows a
 * "wants to play Draw & Guess" note on any page.
 */
export function DrawBridge() {
  const on = useFeature('draw');
  return on ? <Bridge /> : null;
}

function Bridge() {
  useDrawHub();
  const game = useDrawGame();
  const { me, partner } = useCouple();
  const path = usePathname();
  const s = game.state;
  const invited = s?.phase === 'invited' && s.players[0] !== me.id && !s.joined.includes(me.id);
  if (!invited || path.startsWith('/connect/draw/guess')) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[420px] items-center gap-3 rounded-[20px] bg-plum-800 p-3 pl-3.5 text-paper shadow-[0_20px_40px_-16px_rgba(23,15,33,0.6)] lg:bottom-6 lg:left-auto lg:right-6">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-gold-400 text-gold-900">
        <MessageCircleQuestion className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-body">
        <b className="font-semibold">{partner.display_name}</b> wants to play Draw &amp; Guess
      </span>
      <Link href="/connect/draw/guess" className="flex h-10 items-center rounded-xl bg-gold-400 px-4 text-body font-semibold text-gold-900">
        Play
      </Link>
    </div>
  );
}
