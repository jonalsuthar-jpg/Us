'use client';

import { DEFAULT_PREFS, formatMinutes, getNotificationPrefs, NOTIFY_GROUPS, parseMinutes, saveNotificationPrefs, type FeatureKey, type NotificationPrefs } from '@us/shared';
import { useCouple, useFeatures } from '@us/shared/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/** Which pushes I get, my quiet hours, and a private lock screen. Saved as I change them. */
export function NotificationPrefsForm() {
  const { sb, me, partner } = useCouple();
  const has = useFeatures();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    getNotificationPrefs(sb, me.id).then(setPrefs, () => setPrefs(DEFAULT_PREFS));
  }, [sb, me.id]);

  const change = (patch: Partial<NotificationPrefs>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setError(null);
    // One save after another, so the last change always wins.
    saving.current = saving.current.then(() => saveNotificationPrefs(sb, me.id, next)).catch(() => setError('That didn’t save. Check your connection and try again.'));
  };

  if (!prefs) return <div className="h-40 animate-pulse rounded-sheet bg-paper-sunken" aria-label="Loading notification settings" />;
  const quiet = prefs.quiet_start != null && prefs.quiet_end != null;
  const groups = NOTIFY_GROUPS.filter((g) => !g.feature || has(g.feature as FeatureKey));

  return (
    <div className="space-y-5">
      <fieldset className="space-y-1">
        <legend className="mb-2 text-micro font-semibold uppercase tracking-wide text-ink-muted">From {partner.display_name}</legend>
        <div className="divide-y divide-paper-edge rounded-sheet border border-paper-edge bg-paper-raised">
          <Row label="Calls" detail="Always ring, even in quiet hours" checked disabled onChange={() => {}} />
          {groups.map((g) => (
            <Row
              key={g.key}
              label={g.label}
              detail={g.detail}
              checked={!prefs.off.includes(g.key)}
              onChange={(on) => change({ off: on ? prefs.off.filter((k) => k !== g.key) : [...prefs.off, g.key] })}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className="mb-2 text-micro font-semibold uppercase tracking-wide text-ink-muted">Privacy and quiet</legend>
        <div className="divide-y divide-paper-edge rounded-sheet border border-paper-edge bg-paper-raised">
          <Row
            label="Quiet hours"
            detail={quiet ? 'No sound or buzz. Calls and “got home” still come through.' : 'Off'}
            checked={quiet}
            onChange={(on) => change(on ? { quiet_start: 22 * 60, quiet_end: 7 * 60 } : { quiet_start: null, quiet_end: null })}
          />
          {quiet ? (
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-small">
              <TimeInput label="From" value={prefs.quiet_start!} onChange={(m) => change({ quiet_start: m })} />
              <TimeInput label="Until" value={prefs.quiet_end!} onChange={(m) => change({ quiet_end: m })} />
            </div>
          ) : null}
          <Row
            label="Hide what it’s about"
            detail="The lock screen shows only “Us”"
            checked={prefs.hide_preview}
            onChange={(on) => change({ hide_preview: on })}
          />
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="text-small text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Row({ label, detail, checked, disabled, onChange }: { label: string; detail?: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={cn('flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-2.5', disabled && 'cursor-default')}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body text-ink">{label}</span>
        {detail ? <span className="text-small text-ink-muted">{detail}</span> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-rose-600 disabled:opacity-60"
      />
    </label>
  );
}

function TimeInput({ label, value, onChange }: { label: string; value: number; onChange: (m: number) => void }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-ink-soft">{label}</span>
      <input
        type="time"
        value={formatMinutes(value)}
        onChange={(e) => {
          const m = parseMinutes(e.target.value);
          if (m != null) onChange(m);
        }}
        className="rounded-control border border-paper-edge bg-paper px-2 py-1.5 text-ink"
      />
    </label>
  );
}
