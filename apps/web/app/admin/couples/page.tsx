'use client';

import { adminPeople, adminPlans, type AdminPerson } from '@us/shared';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { AdminHeader, useAdmin, useAdminData } from '@/components/admin/admin-shell';
import { planLabel } from '@/components/admin/feature-picker';
import { PersonPanel, StatusPill, when } from '@/components/admin/person-panel';
import { Spinner } from '@/components/ui/button';
import { getSupabase } from '@/lib/supabase/client';

/** Each pair, with the one feature set they share. */
export default function CouplesPage() {
  const { refresh } = useAdmin();
  const people = useAdminData(() => adminPeople(getSupabase()));
  const plans = useAdminData(() => adminPlans(getSupabase()));
  const [openId, setOpenId] = useState<string | null>(null);

  const byCouple = new Map<string, AdminPerson[]>();
  for (const p of people.data ?? []) {
    if (!p.couple_id) continue;
    byCouple.set(p.couple_id, [...(byCouple.get(p.couple_id) ?? []), p]);
  }
  const couples = [...byCouple.values()]
    .map((pair) => ({ first: pair[0]!, pair }))
    .sort((a, b) => Date.parse(b.first.paired_at ?? '') - Date.parse(a.first.paired_at ?? ''));
  const open = people.data?.find((p) => p.user_id === openId) ?? null;

  return (
    <>
      <AdminHeader title="Couples">
        <span className="text-small text-ink-muted">{couples.length} paired</span>
      </AdminHeader>
      {!people.data ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-6 w-6 text-rose-400" />
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {couples.map(({ first: a, pair }) => {
            const locked = pair.some((p) => p.protected);
            return (
              <li key={a.couple_id} className="rounded-sheet border border-paper-edge bg-paper-raised p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-display text-lead text-ink">{pair.map((p) => p.display_name).join(' & ')}</p>
                  {locked && <ShieldCheck className="h-4 w-4 shrink-0 text-sage-700" aria-label="Protected" />}
                </div>
                <p className="mt-0.5 text-micro text-ink-muted">Paired {when(a.paired_at)}</p>
                <p className="mt-3 text-small text-ink-soft">{locked ? 'Everything, always' : planLabel(plans.data ?? [], a.plan_id, a.features)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {pair.map((p) => (
                    <button
                      key={p.user_id}
                      type="button"
                      onClick={() => setOpenId(p.user_id)}
                      className="inline-flex items-center gap-2 rounded-full border border-paper-edge px-3 py-1 text-small text-ink hover:bg-paper-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                    >
                      {p.display_name} <StatusPill status={p.status} />
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PersonPanel person={open} plans={plans.data ?? []} onClose={() => setOpenId(null)} onChanged={refresh} />
    </>
  );
}
