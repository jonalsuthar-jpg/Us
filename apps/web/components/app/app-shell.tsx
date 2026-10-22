'use client';

import { MODULES, TAB_FEATURES, type ModuleId } from '@us/shared';
import { useCouple, useFeatures } from '@us/shared/react';
import { HeartHandshake, House, MessageCircleHeart, NotebookPen, Settings, Sparkles, Sprout } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Avatar, Seal } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';

const ICONS: Record<ModuleId, typeof MessageCircleHeart> = {
  talk: MessageCircleHeart,
  connect: HeartHandshake,
  plan: NotebookPen,
  memory: Sparkles,
  growth: Sprout,
};

const DOT: Record<ModuleId, string> = {
  talk: 'bg-rose-400',
  connect: 'bg-teal-500',
  plan: 'bg-plum-500',
  memory: 'bg-gold-400',
  growth: 'bg-sage-400',
};

/**
 * Desktop: a quiet left rail — wordmark, the two of you, and a typographic
 * list of areas (active area set in the italic serif). Mobile web: bottom tabs.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me, partner, mySlot, partnerSlot, partnerOnline, unread, connection } = useCouple();
  const has = useFeatures();
  // Only the areas this couple has something in.
  const modules = MODULES.filter((m) => TAB_FEATURES[m.id].some(has));

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-plum-800 px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-paper-edge/80 px-6 py-8 lg:flex"
      >
        <Link href="/home" className="flex items-center gap-2.5 rounded-control focus-visible:ring-2 focus-visible:ring-gold-400">
          <Seal size={30} />
          <span className="font-serif text-heading italic text-ink">Us</span>
        </Link>

        <div className="mt-10 flex items-center gap-3">
          <div className="flex -space-x-2">
            <Avatar name={me.display_name} slot={mySlot} size="sm" />
            <Avatar name={partner.display_name} slot={partnerSlot} size="sm" online={partnerOnline} />
          </div>
          <p className="min-w-0 text-small leading-tight text-ink-soft">
            <span className="block truncate text-ink">
              {me.display_name} &amp; {partner.display_name}
            </span>
            <span className="text-micro text-ink-muted">
              {connection === 'offline' ? 'Reconnecting…' : partnerOnline ? `${partner.display_name} is here` : 'Just you right now'}
            </span>
          </p>
        </div>

        <ul className="mt-10 space-y-1">
          <li>
            <Link
              href="/home"
              aria-current={pathname.startsWith('/home') ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-control px-3 py-2.5 transition-colors duration-quick',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                pathname.startsWith('/home') ? 'bg-paper-sunken text-ink' : 'text-ink-soft hover:text-ink',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full bg-ink transition-transform', pathname.startsWith('/home') ? 'scale-150' : 'opacity-60')} />
              <span className={cn('flex-1', pathname.startsWith('/home') ? 'font-serif text-lead italic' : 'text-body')}>Home</span>
            </Link>
          </li>
          {modules.map((m) => {
            const active = pathname.startsWith(`/${m.id}`);
            return (
              <li key={m.id}>
                <Link
                  href={`/${m.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex items-center gap-3 rounded-control px-3 py-2.5 transition-colors duration-quick',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                    active ? 'bg-paper-sunken text-ink' : 'text-ink-soft hover:text-ink',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full transition-transform', DOT[m.id], active ? 'scale-150' : 'opacity-60')} />
                  <span className={cn('flex-1', active ? 'font-serif text-lead italic' : 'text-body')}>{m.title}</span>
                  {m.id === 'talk' && unread > 0 && <UnreadBadge count={unread} />}
                  {m.status === 'planned' && <span className="text-micro text-ink-muted/80">soon</span>}
                </Link>
              </li>
            );
          })}
        </ul>

        <Link
          href="/settings"
          aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
          className="mt-auto flex items-center gap-3 rounded-control px-3 py-2.5 text-small text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
        >
          <Settings className="h-4 w-4" /> Settings
        </Link>
      </nav>

      <main id="main" className="min-w-0 flex-1 pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">
        {children}
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-paper-edge bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <BottomTab href="/home" label="Home" icon={House} active={pathname.startsWith('/home')} />
        {modules.map((m) => {
          const Icon = ICONS[m.id];
          const active = pathname.startsWith(`/${m.id}`);
          return <BottomTab key={m.id} href={`/${m.id}`} label={m.title} icon={Icon} active={active} badge={m.id === 'talk' ? unread : 0} />;
        })}
      </nav>
    </div>
  );
}

/** Settings lives in the desktop rail; on phone widths it sits in each page's header instead. */
export function MobileSettingsLink({ className }: { className?: string }) {
  return (
    <Link
      href="/settings"
      aria-label="Settings"
      title="Settings"
      className={cn(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-paper-edge bg-paper-raised text-ink-soft transition-colors hover:text-ink lg:hidden',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
        className,
      )}
    >
      <Settings className="h-[18px] w-[18px]" aria-hidden />
    </Link>
  );
}

function BottomTab({
  href,
  label,
  icon: Icon,
  active,
  badge = 0,
}: {
  href: string;
  label: string;
  icon: typeof House;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[12px] leading-4',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400',
        active ? 'font-bold text-ink' : 'font-medium text-ink-soft',
      )}
    >
      {/* A soft pill behind the current tab's icon. */}
      <span className={cn('flex h-8 w-14 items-center justify-center rounded-full transition-colors', active && 'bg-rose-50 text-rose-700')} aria-hidden>
        <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.9} />
      </span>
      <span>{label}</span>
      {badge > 0 && (
        <span className="absolute right-[calc(50%-24px)] top-1">
          <UnreadBadge count={badge} />
        </span>
      )}
    </Link>
  );
}

function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="min-w-[20px] rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white">
      {count > 99 ? '99+' : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}
