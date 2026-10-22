'use client';

import {
  adminDecide,
  adminDeleteUser,
  adminSetAdmin,
  adminSetCoupleFeatures,
  adminSetNote,
  featureLabel,
  friendlyError,
  type AccessStatus,
  type AdminPerson,
  type FeatureKey,
  type Plan,
} from '@us/shared';
import { ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TextAreaField } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { getSupabase } from '@/lib/supabase/client';
import { FeaturePicker, planLabel } from './feature-picker';

export const STATUS_STYLE: Record<AccessStatus, string> = {
  pending: 'bg-gold-100 text-gold-800',
  approved: 'bg-sage-100 text-sage-800',
  rejected: 'bg-paper-sunken text-ink-soft',
  suspended: 'bg-rose-100 text-rose-800',
};

export function StatusPill({ status }: { status: AccessStatus }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-micro font-medium capitalize', STATUS_STYLE[status])}>{status}</span>;
}

export function when(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Approve with a chosen set of features (or a plan). */
export function ApproveDialog({
  person,
  plans,
  onClose,
  onDone,
}: {
  person: AdminPerson | null;
  plans: Plan[];
  onClose: () => void;
  onDone: () => void;
}) {
  const fallback = plans.find((p) => p.is_default) ?? plans[0];
  const [value, setValue] = useState<{ plan: string | null; features: FeatureKey[] }>({ plan: null, features: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (person) setValue(fallback ? { plan: fallback.id, features: fallback.features } : { plan: null, features: [] });
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.user_id]);

  async function approve() {
    if (!person) return;
    setBusy(true);
    setError(null);
    try {
      await adminDecide(getSupabase(), person.user_id, 'approved', value.plan ? { plan: value.plan } : { features: value.features });
      onDone();
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={!!person}
      onOpenChange={(o) => !o && onClose()}
      title={`Let ${person?.display_name ?? 'them'} in`}
      description="Choose what they get. Once they pair, the same set applies to their partner."
      className="sm:w-[min(92vw,640px)] max-h-[90dvh] overflow-y-auto"
    >
      <FeaturePicker plans={plans} value={value} onChange={setValue} />
      {error && <p className="mt-4 text-small text-rose-700" role="alert">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={busy} disabled={!value.features.length} onClick={() => void approve()}>
          Approve · {planLabel(plans, value.plan, value.features)}
        </Button>
      </div>
    </Dialog>
  );
}

/** Reject or suspend, with an optional reason the person will see. */
export function ReasonDialog({
  person,
  status,
  onClose,
  onDone,
}: {
  person: AdminPerson | null;
  status: 'rejected' | 'suspended';
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setReason('');
    setError(null);
  }, [person?.user_id]);

  async function go() {
    if (!person) return;
    setBusy(true);
    try {
      await adminDecide(getSupabase(), person.user_id, status, { reason });
      onDone();
      onClose();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const verb = status === 'rejected' ? 'Decline' : 'Suspend';
  return (
    <Dialog
      open={!!person}
      onOpenChange={(o) => !o && onClose()}
      title={`${verb} ${person?.display_name ?? ''}`}
      description={
        status === 'suspended'
          ? 'They’ll be signed out of everything shared. Their partner keeps their data but can’t use shared features until you reinstate them.'
          : 'They won’t be able to use Us. You can approve them later.'
      }
    >
      <TextAreaField label="Reason (they’ll see this, optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={280} />
      {error && <p className="mt-3 text-small text-rose-700" role="alert">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={busy} onClick={() => void go()}>
          {verb}
        </Button>
      </div>
    </Dialog>
  );
}

/** Everything about one person, and what an admin can do with them. */
export function PersonPanel({
  person,
  plans,
  onClose,
  onChanged,
}: {
  person: AdminPerson | null;
  plans: Plan[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<{ plan: string | null; features: FeatureKey[] }>({ plan: null, features: [] });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reasonFor, setReasonFor] = useState<'suspended' | 'rejected' | null>(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (!person) return;
    setNote(person.note ?? '');
    setValue({ plan: person.plan_id, features: person.features });
    setEditing(false);
    setError(null);
    setConfirmDelete(false);
  }, [person]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      onChanged();
      return true;
    } catch (e) {
      setError(friendlyError(e));
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (!person) return null;
  const sb = getSupabase();
  const locked = person.protected;

  async function saveFeatures() {
    if (!person) return;
    const ok = await run('features', () =>
      person.couple_id
        ? adminSetCoupleFeatures(sb, person.couple_id, value.plan ? { plan: value.plan } : { features: value.features })
        : adminDecide(sb, person.user_id, person.status, value.plan ? { plan: value.plan } : { features: value.features }),
    );
    if (ok) setEditing(false);
  }

  return (
    <>
      <Dialog
        open={!!person && !reasonFor && !approving}
        onOpenChange={(o) => !o && onClose()}
        title={person.display_name}
        description={person.email ?? undefined}
        className="sm:w-[min(92vw,680px)] max-h-[90dvh] overflow-y-auto"
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={person.status} />
          {person.is_admin && <span className="rounded-full bg-plum-100 px-2 py-0.5 text-micro font-medium text-plum-800">Admin</span>}
          {locked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sage-100 px-2 py-0.5 text-micro font-medium text-sage-800">
              <ShieldCheck className="h-3 w-3" aria-hidden /> Protected
            </span>
          )}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-small">
          <Item label="Signed up">{when(person.requested_at)}</Item>
          <Item label="Last seen">{when(person.last_seen)}</Item>
          <Item label="Partner">{person.partner_name ?? 'Not paired yet'}</Item>
          <Item label="Paired">{when(person.paired_at)}</Item>
          {person.reason && <Item label="Reason shown to them">{person.reason}</Item>}
        </dl>

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-small font-medium text-ink">
              Features {person.couple_id ? <span className="font-normal text-ink-muted">· shared with {person.partner_name}</span> : null}
            </h3>
            {!locked && !editing && (
              <Button variant="quiet" size="sm" onClick={() => setEditing(true)}>
                Change
              </Button>
            )}
          </div>
          {locked ? (
            <p className="mt-2 text-small text-ink-soft">Everything, always. The founding couple can’t be changed from here.</p>
          ) : editing ? (
            <div className="mt-3">
              <FeaturePicker plans={plans} value={value} onChange={setValue} />
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="quiet" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" loading={busy === 'features'} onClick={() => void saveFeatures()}>
                  Save{person.couple_id ? ' for both' : ''}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 text-small text-ink-soft">{planLabel(plans, person.plan_id, person.features)}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {person.features.map((f) => (
                  <li key={f} className="rounded-full bg-paper-sunken px-2 py-0.5 text-micro text-ink-soft">
                    {featureLabel(f)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="mt-6">
          <TextAreaField label="Private note (only admins see this)" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          {note !== (person.note ?? '') && (
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="secondary" loading={busy === 'note'} onClick={() => void run('note', () => adminSetNote(sb, person.user_id, note))}>
                Save note
              </Button>
            </div>
          )}
        </section>

        {error && <p className="mt-4 text-small text-rose-700" role="alert">{error}</p>}

        {!locked && (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-paper-edge pt-5">
            {person.status !== 'approved' && (
              <Button size="sm" onClick={() => (person.status === 'pending' ? setApproving(true) : void run('approve', () => adminDecide(sb, person.user_id, 'approved')))}>
                {person.status === 'pending' ? 'Approve…' : 'Reinstate'}
              </Button>
            )}
            {person.status === 'pending' && (
              <Button size="sm" variant="secondary" onClick={() => setReasonFor('rejected')}>
                Decline…
              </Button>
            )}
            {person.status === 'approved' && (
              <Button size="sm" variant="secondary" onClick={() => setReasonFor('suspended')}>
                Suspend…
              </Button>
            )}
            {person.status === 'approved' && (
              <Button
                size="sm"
                variant="secondary"
                loading={busy === 'admin'}
                onClick={() => void run('admin', () => adminSetAdmin(sb, person.user_id, !person.is_admin))}
              >
                {person.is_admin ? 'Remove admin' : 'Make admin'}
              </Button>
            )}
            {!person.couple_id &&
              (confirmDelete ? (
                <Button
                  size="sm"
                  variant="end"
                  loading={busy === 'delete'}
                  onClick={async () => {
                    if (await run('delete', () => adminDeleteUser(sb, person.user_id))) onClose();
                  }}
                >
                  Yes, delete for good
                </Button>
              ) : (
                <Button size="sm" variant="quiet" onClick={() => setConfirmDelete(true)}>
                  Delete account…
                </Button>
              ))}
          </div>
        )}
      </Dialog>

      <ReasonDialog person={reasonFor ? person : null} status={reasonFor ?? 'suspended'} onClose={() => setReasonFor(null)} onDone={onChanged} />
      <ApproveDialog person={approving ? person : null} plans={plans} onClose={() => setApproving(false)} onDone={onChanged} />
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-micro text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{children}</dd>
    </div>
  );
}
