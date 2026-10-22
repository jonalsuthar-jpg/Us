'use client';

import {
  adminDeletePlan,
  adminFeatures,
  adminPlans,
  adminSavePlan,
  adminSetFeature,
  featureLabel,
  FEATURE_GROUPS,
  friendlyError,
  type FeatureKey,
  type FeatureSwitch,
  type Plan,
} from '@us/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { AdminHeader, useAdminData } from '@/components/admin/admin-shell';
import { FeaturePicker } from '@/components/admin/feature-picker';
import { Button, Spinner } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { getSupabase } from '@/lib/supabase/client';

export default function FeaturesPage() {
  const features = useAdminData(() => adminFeatures(getSupabase()));
  const plans = useAdminData(() => adminPlans(getSupabase()));
  const [pausing, setPausing] = useState<FeatureSwitch | null>(null);
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resume(f: FeatureSwitch) {
    setError(null);
    try {
      await adminSetFeature(getSupabase(), f.key, true);
      features.reload();
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  return (
    <>
      <AdminHeader title="Features & plans" />
      {error && <p className="mb-4 text-small text-rose-700" role="alert">{error}</p>}

      <section aria-labelledby="switches">
        <h2 id="switches" className="font-display text-heading text-ink">
          Switches
        </h2>
        <p className="mt-1 max-w-2xl text-small text-ink-soft">
          Pause a feature for everyone at once, say while something is broken or costing too much. People see your message in its place. The
          founding couple is never affected.
        </p>
        {!features.data ? (
          <Spinner className="mt-6 h-5 w-5 text-rose-400" />
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_GROUPS.map((g) => (
              <div key={g.id} className="rounded-sheet border border-paper-edge bg-paper-raised p-4">
                <p className="text-micro font-medium uppercase tracking-wide text-ink-muted">{g.title}</p>
                <ul className="mt-2 space-y-1">
                  {features.data!
                    .filter((f) => f.module === g.id)
                    .map((f) => (
                      <li key={f.key} className="flex items-center justify-between gap-3 py-1">
                        <span className="min-w-0">
                          <span className={cn('block text-small', f.enabled ? 'text-ink' : 'text-ink-muted line-through')}>{f.label}</span>
                          {!f.enabled && f.disabled_message && <span className="block truncate text-micro text-ink-muted">“{f.disabled_message}”</span>}
                        </span>
                        <Toggle on={f.enabled} label={f.label} onClick={() => (f.enabled ? setPausing(f) : void resume(f))} />
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="plans" className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="plans" className="font-display text-heading text-ink">
              Plans
            </h2>
            <p className="mt-1 max-w-2xl text-small text-ink-soft">
              Ready-made sets to approve people with. The default is used for bulk approvals. Later, these become what people subscribe to.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> New plan
          </Button>
        </div>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {(plans.data ?? []).map((p) => (
            <li key={p.id} className="rounded-sheet border border-paper-edge bg-paper-raised p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lead text-ink">
                    {p.name} {p.is_default && <span className="ml-1 rounded-full bg-plum-100 px-2 py-0.5 align-middle text-micro font-medium text-plum-800">Default</span>}
                  </p>
                  {p.price_note && <p className="text-micro text-ink-muted">{p.price_note}</p>}
                </div>
                <Button size="sm" variant="quiet" onClick={() => setEditing(p)}>
                  Edit
                </Button>
              </div>
              <p className="mt-2 text-small text-ink-soft">{p.features.map(featureLabel).join(', ') || 'No features'}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-micro text-ink-muted">Editing a plan doesn’t change couples already on it. Change those from People or Couples.</p>
      </section>

      <PauseDialog
        feature={pausing}
        onClose={() => setPausing(null)}
        onDone={() => {
          setPausing(null);
          features.reload();
        }}
      />
      <PlanDialog
        plan={editing}
        onClose={() => setEditing(null)}
        onDone={() => {
          setEditing(null);
          plans.reload();
        }}
      />
    </>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'relative h-6 w-10 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
        on ? 'bg-sage-500' : 'bg-ink/20',
      )}
    >
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]', on ? 'left-[18px]' : 'left-0.5')} />
    </button>
  );
}

function PauseDialog({ feature, onClose, onDone }: { feature: FeatureSwitch | null; onClose: () => void; onDone: () => void }) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pause() {
    if (!feature) return;
    setBusy(true);
    try {
      await adminSetFeature(getSupabase(), feature.key, false, message);
      setMessage('');
      onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={!!feature} onOpenChange={(o) => !o && onClose()} title={`Pause ${feature?.label ?? ''} for everyone?`} description="It stops working straight away for every couple except yours.">
      <Field label="Message people will see (optional)" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={140} placeholder="Taking a short break. Back soon." />
      {error && <p className="mt-3 text-small text-rose-700" role="alert">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="quiet" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={busy} onClick={() => void pause()}>
          Pause
        </Button>
      </div>
    </Dialog>
  );
}

function PlanDialog({ plan, onClose, onDone }: { plan: Plan | 'new' | null; onClose: () => void; onDone: () => void }) {
  const existing = plan && plan !== 'new' ? plan : null;
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [features, setFeatures] = useState<FeatureKey[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastPlan, setLastPlan] = useState<typeof plan>(null);

  // Reset the form whenever a different plan is opened.
  if (plan !== lastPlan) {
    setLastPlan(plan);
    setName(existing?.name ?? '');
    setNote(existing?.price_note ?? '');
    setIsDefault(existing?.is_default ?? false);
    setFeatures(existing?.features ?? []);
    setError(null);
  }

  async function save() {
    setBusy('save');
    setError(null);
    try {
      const id = existing?.id ?? name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!id) throw new Error('Give the plan a name.');
      await adminSavePlan(getSupabase(), { id, name: name.trim(), features, is_default: isDefault, price_note: note });
      onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!existing) return;
    setBusy('delete');
    try {
      await adminDeletePlan(getSupabase(), existing.id);
      onDone();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog
      open={!!plan}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? `Edit ${existing.name}` : 'New plan'}
      className="sm:w-[min(92vw,640px)] max-h-[90dvh] overflow-y-auto"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <Field label="Price note (for later)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. ₹199 / month" />
      </div>
      <label className="mt-4 flex items-center gap-2 text-small text-ink">
        <input type="checkbox" className="h-4 w-4 accent-plum-700" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        Default plan for new approvals
      </label>
      <div className="mt-5">
        <FeaturePicker plans={[]} value={{ plan: null, features }} onChange={(v) => setFeatures(v.features)} />
      </div>
      {error && <p className="mt-4 text-small text-rose-700" role="alert">{error}</p>}
      <div className="mt-6 flex flex-wrap justify-between gap-2">
        {existing && !existing.is_default ? (
          <Button variant="quiet" loading={busy === 'delete'} onClick={() => void remove()}>
            Delete plan
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy === 'save'} disabled={!name.trim()} onClick={() => void save()}>
            Save plan
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
