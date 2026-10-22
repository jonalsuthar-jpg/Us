'use client';

import { adminPeople, watchAccessQueue } from '@us/shared';
import { ArrowLeft, BarChart3, Flag, Inbox, Megaphone, ScrollText, Users, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Seal } from '@/components/ui/avatar';
import { cn } from '@/lib/cn';
import { getSupabase } from '@/lib/supabase/client';

const NAV = [
  { href: '/admin', label: 'Overview', icon: BarChart3 },
  { href: '/admin/requests', label: 'Requests', icon: Inbox },
  { href: '/admin/people', label: 'People', icon: Users },
  { href: '/admin/couples', label: 'Couples', icon: UsersRound },
  { href: '/admin/features', label: 'Features & plans', icon: Flag },
  { href: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollText },
];

interface AdminValue {
  pending: number;
  /** Bumped whenever anyone's access changes, so pages can reload. */
  version: number;
  refresh: () => void;
}

const Ctx = createContext<AdminValue>({ pending: 0, version: 0, refresh: () => {} });

export const useAdmin = () => useContext(Ctx);

/** The console frame: a rail of sections, with a live count of people waiting. */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pending, setPending] = useState(0);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
    void adminPeople(getSupabase(), { status: 'pending' }).then((p) => setPending(p.length), () => {});
  }, []);

  useEffect(() => {
    refresh();
    return watchAccessQueue(getSupabase(), refresh);
  }, [refresh]);

  useEffect(() => {
    document.title = pending ? `(${pending}) Us · Admin` : 'Us · Admin';
  }, [pending]);

  return (
    <Ctx.Provider value={{ pending, version, refresh }}>
      <div className="flex min-h-dvh flex-col lg:flex-row">
        <nav aria-label="Admin" className="shrink-0 border-b border-paper-edge/80 px-4 py-4 lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:border-b-0 lg:border-r lg:px-5 lg:py-8">
          <div className="flex items-center gap-2.5 px-2">
            <Seal size={26} />
            <span className="font-serif text-lead italic text-ink">Us</span>
            <span className="rounded-full bg-plum-800 px-2 py-0.5 text-micro font-medium text-paper">Admin</span>
          </div>
          <ul className="-mx-1 mt-4 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:mt-8 lg:flex-col lg:overflow-visible">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
              return (
                <li key={href} className="shrink-0">
                  <Link
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 whitespace-nowrap rounded-control px-3 py-2 text-small transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
                      active ? 'bg-paper-sunken font-medium text-ink' : 'text-ink-soft hover:text-ink',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    <span className="flex-1">{label}</span>
                    {href === '/admin/requests' && pending > 0 && (
                      <span className="min-w-[20px] rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white">
                        {pending}
                        <span className="sr-only"> waiting</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link
            href="/home"
            className="mt-6 hidden items-center gap-2 rounded-control px-3 py-2 text-small text-ink-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 lg:flex"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Us
          </Link>
        </nav>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-10">
          <div className="mx-auto max-w-5xl">{children}</div>
        </main>
      </div>
    </Ctx.Provider>
  );
}

export function AdminHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <h1 className="font-display text-title text-ink">{title}</h1>
      {children}
    </header>
  );
}

/** A tiny loader for admin pages: data, error, reload, refreshed with the shell. */
export function useAdminData<T>(load: () => Promise<T>) {
  const { version } = useAdmin();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    load().then(
      (d) => !cancelled && (setData(d), setError(null)),
      (e) => !cancelled && setError((e as Error).message ?? 'Couldn’t load this.'),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, tick]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}
