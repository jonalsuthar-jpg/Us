'use client';

import { adminDecide, adminPeople, adminPlans, friendlyError, type AdminPerson } from '@us/shared';
import { useState } from 'react';
import { AdminHeader, useAdmin, useAdminData } from '@/components/admin/admin-shell';
import { ApproveDialog, ReasonDialog, when } from '@/components/admin/person-panel';
import { Button, Spinner } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { getSupabase } from '@/lib/supabase/client';

export default function RequestsPage() {
  const { refresh } = useAdmin();
  const people = useAdminData(() => adminPeople(getSupabase(), { status: 'pending' }));
  const plans = useAdminData(() => adminPlans(getSupabase()));
  const [approving, setApproving] = useState<AdminPerson | null>(null);
  const [declining, setDeclining] = useState<AdminPerson | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = people.data ?? [];
  const defaultPlan = plans.data?.find((p) => p.is_default);

  async function approveSelected() {
    setBusy(true);
    setError(null);
    try {
      for (const id of selected) await adminDecide(getSupabase(), id, 'approved', { plan: defaultPlan?.id ?? null });
      setSelected(new Set());
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
      refresh();
    }
  }

  return (
    <>
      <AdminHeader title="Requests">
        {selected.size > 0 && (
          <Button size="sm" loading={busy} onClick={() => void approveSelected()}>
            Approve {selected.size} with {defaultPlan?.name ?? 'the default plan'}
          </Button>
        )}
      </AdminHeader>
      {error && <p className="mb-4 text-small text-rose-700" role="alert">{error}</p>}

      {!people.data ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-6 w-6 text-rose-400" />
        </div>
      ) : list.length === 0 ? (
        <Sheet tone="inset" pad="lg" className="text-center">
          <p className="font-display text-heading text-ink">No one is waiting</p>
          <p className="mt-1 text-small text-ink-soft">New sign-ups appear here the moment they arrive, and you’ll get an email.</p>
        </Sheet>
      ) : (
        <ul className="divide-y divide-paper-edge overflow-hidden rounded-sheet border border-paper-edge bg-paper-raised">
          {list.map((p) => (
            <li key={p.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                aria-label={`Select ${p.display_name}`}
                className="h-4 w-4 accent-plum-700"
                checked={selected.has(p.user_id)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(p.user_id);
                  else next.delete(p.user_id);
                  setSelected(next);
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{p.display_name}</p>
                <p className="truncate text-small text-ink-soft">
                  {p.email} · asked {when(p.requested_at)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setDeclining(p)}>
                  Decline
                </Button>
                <Button size="sm" onClick={() => setApproving(p)} disabled={!plans.data}>
                  Approve…
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ApproveDialog person={approving} plans={plans.data ?? []} onClose={() => setApproving(null)} onDone={refresh} />
      <ReasonDialog person={declining} status="rejected" onClose={() => setDeclining(null)} onDone={refresh} />
    </>
  );
}
