'use client';

import { adminStats } from '@us/shared';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { AdminHeader, useAdminData } from '@/components/admin/admin-shell';
import { BarChart } from '@/components/admin/bar-chart';
import { Spinner } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { getSupabase } from '@/lib/supabase/client';

export default function AdminOverview() {
  const { data: s, error } = useAdminData(() => adminStats(getSupabase()));

  if (error) return <p className="text-small text-rose-700">{error}</p>;
  if (!s) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-6 w-6 text-rose-400" />
      </div>
    );
  }

  const pending = s.by_status.pending ?? 0;
  return (
    <>
      <AdminHeader title="Overview" />

      {pending > 0 && (
        <Sheet tone="note" accent="gold" pad="sm" className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-small text-ink">
            <span className="font-medium">{pending}</span> {pending === 1 ? 'person is' : 'people are'} waiting for approval.
          </p>
          <Link href="/admin/requests" className="text-small font-medium text-plum-700 underline-offset-4 hover:underline">
            Review requests
          </Link>
        </Sheet>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="People" value={s.people} detail={`${s.by_status.approved ?? 0} approved`} />
        <Stat label="Couples" value={s.couples} detail={`${s.unpaired_approved} approved, not paired`} />
        <Stat label="Active this week" value={s.active_7d} detail={`${s.active_1d} today · ${s.active_30d} this month`} />
        <Stat
          label="Not let in"
          value={(s.by_status.rejected ?? 0) + (s.by_status.suspended ?? 0)}
          detail={`${s.by_status.rejected ?? 0} declined · ${s.by_status.suspended ?? 0} suspended`}
        />
      </dl>

      <div className="mt-6 grid gap-4">
        <BarChart title="Sign-ups, last 30 days" unit="sign-ups" points={s.signups.map((d) => ({ day: d.day, value: d.n }))} />
        <div className="grid gap-4 md:grid-cols-2">
          <BarChart title="Messages sent, last 14 days" unit="messages" barClass="bg-rose-400" points={s.activity.map((d) => ({ day: d.day, value: d.messages }))} />
          <BarChart title="Calls, last 14 days" unit="calls" barClass="bg-teal-500" points={s.activity.map((d) => ({ day: d.day, value: d.calls }))} />
        </div>
      </div>

      {s.push_failures_7d > 0 && (
        <p className="mt-6 flex items-center gap-2 text-small text-ink-soft">
          <AlertTriangle className="h-4 w-4 text-gold-700" aria-hidden />
          {s.push_failures_7d} call notification{s.push_failures_7d === 1 ? '' : 's'} failed to send this week.
        </p>
      )}
      <p className="mt-6 text-micro text-ink-muted">Counts only. What couples write and share is never shown here.</p>
    </>
  );
}

function Stat({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-sheet border border-paper-edge bg-paper-raised p-4">
      <dt className="text-micro text-ink-muted">{label}</dt>
      <dd className="mt-1 font-display text-title text-ink">{value.toLocaleString()}</dd>
      <dd className="mt-0.5 text-micro text-ink-soft">{detail}</dd>
    </div>
  );
}
