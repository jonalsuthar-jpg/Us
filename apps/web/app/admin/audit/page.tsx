'use client';

import { adminAudit, featureLabel, type AuditEntry } from '@us/shared';
import { AdminHeader, useAdminData } from '@/components/admin/admin-shell';
import { when } from '@/components/admin/person-panel';
import { Spinner } from '@/components/ui/button';
import { getSupabase } from '@/lib/supabase/client';

/** Every admin action, newest first. */
export default function AuditPage() {
  const log = useAdminData(() => adminAudit(getSupabase(), 200));

  return (
    <>
      <AdminHeader title="Audit log" />
      {!log.data ? (
        <div className="flex justify-center py-20">
          <Spinner className="h-6 w-6 text-rose-400" />
        </div>
      ) : log.data.length === 0 ? (
        <p className="py-10 text-center text-small text-ink-soft">Nothing yet. Every approval and change will be listed here.</p>
      ) : (
        <ol className="divide-y divide-paper-edge overflow-hidden rounded-sheet border border-paper-edge bg-paper-raised">
          {log.data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-4 py-3">
              <span className="w-40 shrink-0 text-micro text-ink-muted">{when(e.at)}</span>
              <span className="min-w-0 flex-1 text-small text-ink">{describe(e)}</span>
              <span className="text-micro text-ink-muted">by {e.admin_name ?? 'an admin'}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function describe(e: AuditEntry): string {
  const who = e.target_name ?? (e.before as { display_name?: string } | null)?.display_name ?? 'someone';
  const after = (e.after ?? {}) as Record<string, unknown>;
  switch (true) {
    case e.action === 'decide:approved':
      return `Approved ${who}`;
    case e.action === 'decide:rejected':
      return `Declined ${who}`;
    case e.action === 'decide:suspended':
      return `Suspended ${who}`;
    case e.action === 'decide:pending':
      return `Moved ${who} back to waiting`;
    case e.action === 'couple_features':
      return `Changed a couple’s features to ${((after.features as string[]) ?? []).map(featureLabel).join(', ') || 'nothing'}`;
    case e.action === 'feature_switch':
      return `${after.enabled ? 'Resumed' : 'Paused'} ${featureLabel(String(after.key))} for everyone`;
    case e.action === 'plan_save':
      return `Saved the ${String(after.name)} plan`;
    case e.action === 'plan_delete':
      return `Deleted a plan`;
    case e.action === 'announce':
      return `Posted an announcement: “${String(after.body)}”`;
    case e.action === 'announce_end':
      return 'Took an announcement down';
    case e.action === 'admin:grant':
      return `Made ${who} an admin`;
    case e.action === 'admin:revoke':
      return `Removed ${who} as admin`;
    case e.action === 'delete_user':
      return `Deleted ${who}’s account`;
    default:
      return e.action;
  }
}
