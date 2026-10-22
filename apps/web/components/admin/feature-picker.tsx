'use client';

import { FEATURE_GROUPS, featuresIn, type FeatureKey, type Plan } from '@us/shared';
import { Check } from 'lucide-react';
import { Chip } from '@/components/ui/segmented';
import { cn } from '@/lib/cn';

/**
 * Pick a plan to start from, then tick features on or off, grouped by area.
 * A hand-edited set no longer matches the plan, so the plan shows as "Custom".
 */
export function FeaturePicker({
  plans,
  value,
  onChange,
}: {
  plans: Plan[];
  value: { plan: string | null; features: FeatureKey[] };
  onChange: (next: { plan: string | null; features: FeatureKey[] }) => void;
}) {
  const on = new Set(value.features);
  const toggle = (key: FeatureKey) => {
    const next = new Set(on);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange({ plan: null, features: [...next] });
  };
  const toggleGroup = (keys: FeatureKey[]) => {
    const all = keys.every((k) => on.has(k));
    const next = new Set(on);
    keys.forEach((k) => (all ? next.delete(k) : next.add(k)));
    onChange({ plan: null, features: [...next] });
  };

  return (
    <div className="space-y-5">
      {plans.length > 0 && (
      <div>
        <p className="mb-2 text-small font-medium text-ink">Start from a plan</p>
        <div className="flex flex-wrap gap-2">
          {plans.map((p) => (
            <Chip key={p.id} selected={value.plan === p.id} onClick={() => onChange({ plan: p.id, features: p.features })}>
              {p.name}
              {p.is_default ? <span className="text-ink-muted"> · default</span> : null}
            </Chip>
          ))}
          <Chip selected={value.plan === null}>Custom</Chip>
        </div>
      </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {FEATURE_GROUPS.map((g) => {
          const items = featuresIn(g.id);
          const keys = items.map((f) => f.key);
          return (
            <fieldset key={g.id} className="rounded-control border border-paper-edge p-3">
              <legend className="flex w-full items-center justify-between px-1">
                <span className="text-small font-medium text-ink">{g.title}</span>
              </legend>
              <button
                type="button"
                onClick={() => toggleGroup(keys)}
                className="mb-1 text-micro text-ink-muted underline-offset-2 hover:text-ink hover:underline"
              >
                {keys.every((k) => on.has(k)) ? 'Clear all' : 'Select all'}
              </button>
              <ul className="space-y-0.5">
                {items.map((f) => (
                  <li key={f.key}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-control px-1 py-1.5 text-small text-ink hover:bg-paper-sunken">
                      <input type="checkbox" className="peer sr-only" checked={on.has(f.key)} onChange={() => toggle(f.key)} />
                      <span
                        className={cn(
                          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors',
                          'peer-focus-visible:ring-2 peer-focus-visible:ring-gold-400',
                          on.has(f.key) ? 'border-plum-700 bg-plum-700 text-paper' : 'border-ink/25',
                        )}
                        aria-hidden
                      >
                        {on.has(f.key) && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      {f.label}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}

/** "Everything", "Starter", or "Custom · 7 features". */
export function planLabel(plans: Plan[], planId: string | null, features: FeatureKey[]) {
  const plan = plans.find((p) => p.id === planId);
  return plan ? plan.name : `Custom · ${features.length} feature${features.length === 1 ? '' : 's'}`;
}
