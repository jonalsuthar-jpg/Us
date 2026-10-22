'use client';

import { adminPeople, adminPlans, type AccessStatus } from '@us/shared';
import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdminHeader, useAdmin, useAdminData } from '@/components/admin/admin-shell';
import { planLabel } from '@/components/admin/feature-picker';
import { PersonPanel, StatusPill, when } from '@/components/admin/person-panel';
import { Spinner } from '@/components/ui/button';
import { inputStyles } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { cn } from '@/lib/cn';
import { getSupabase } from '@/lib/supabase/client';

type Filter = 'all' | AccessStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'pending', label: 'Waiting' },
  { value: 'approved', label: 'Approved' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected', label: 'Declined' },
];

export default function PeoplePage() {
  const { refresh } = useAdmin();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  // Search as you type, without a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const people = useAdminData(() => adminPeople(getSupabase(), { status: filter === 'all' ? null : filter, search: query }));
  const plans = useAdminData(() => adminPlans(getSupabase()));
  useEffect(() => people.reload(), [filter, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = people.data ?? [];
  const open = list.find((p) => p.user_id === openId) ?? null;

  return (
    <>
      <AdminHeader title="People" />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Segmented label="Filter" options={FILTERS} value={filter} onChange={setFilter} size="sm" className="overflow-x-auto" />
        <input
          type="search"
          placeholder="Search name or email"
          aria-label="Search people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(inputStyles, 'h-10 sm:ml-auto sm:max-w-xs')}
        />
      </div>

      {!people.data ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-6 w-6 text-rose-400" />
        </div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-small text-ink-soft">No one matches.</p>
      ) : (
        <ul className="divide-y divide-paper-edge overflow-hidden rounded-sheet border border-paper-edge bg-paper-raised">
          {list.map((p) => (
            <li key={p.user_id}>
              <button
                type="button"
                onClick={() => setOpenId(p.user_id)}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400"
              >
                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex items-center gap-1.5 truncate font-medium text-ink">
                    {p.display_name}
                    {p.protected && <ShieldCheck className="h-3.5 w-3.5 text-sage-700" aria-label="Protected" />}
                    {p.is_admin && <span className="text-micro font-normal text-plum-700">admin</span>}
                  </p>
                  <p className="truncate text-small text-ink-soft">{p.email}</p>
                </div>
                <span className="w-28 truncate text-small text-ink-soft">{p.partner_name ? `with ${p.partner_name}` : 'unpaired'}</span>
                <span className="w-40 truncate text-small text-ink-soft">
                  {p.status === 'approved' ? (p.protected ? 'Everything' : planLabel(plans.data ?? [], p.plan_id, p.features)) : '—'}
                </span>
                <span className="hidden w-36 text-micro text-ink-muted md:block">seen {when(p.last_seen)}</span>
                <StatusPill status={p.status} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <PersonPanel person={open} plans={plans.data ?? []} onClose={() => setOpenId(null)} onChanged={refresh} />
    </>
  );
}
