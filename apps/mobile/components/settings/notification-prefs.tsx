import { DEFAULT_PREFS, formatMinutes, getNotificationPrefs, NOTIFY_GROUPS, parseMinutes, saveNotificationPrefs, type FeatureKey, type NotificationPrefs } from '@us/shared';
import { useCouple, useFeatures } from '@us/shared/react';
import { useEffect, useRef, useState } from 'react';
import { Switch, TextInput, View } from 'react-native';
import { cn } from '../ui/cn';
import { usePalette } from '../ui/palette';
import { Text } from '../ui/text';

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

  if (!prefs) return <View className="h-40 rounded-[20px] bg-paper-sunken" accessibilityLabel="Loading notification settings" />;
  const quiet = prefs.quiet_start != null && prefs.quiet_end != null;
  const groups = NOTIFY_GROUPS.filter((g) => !g.feature || has(g.feature as FeatureKey));

  return (
    <View className="gap-4">
      <View className="gap-2">
        <Text className="font-sans-bold text-micro uppercase tracking-[0.6px] text-ink-muted">{`From ${partner.display_name}`}</Text>
        <View className="overflow-hidden rounded-[20px] border border-paper-edge bg-paper-raised">
          <Row first label="Calls" detail="Always ring, even in quiet hours" value disabled onChange={() => {}} />
          {groups.map((g) => (
            <Row
              key={g.key}
              label={g.label}
              detail={g.detail}
              value={!prefs.off.includes(g.key)}
              onChange={(on) => change({ off: on ? prefs.off.filter((k) => k !== g.key) : [...prefs.off, g.key] })}
            />
          ))}
        </View>
      </View>

      <View className="gap-2">
        <Text className="font-sans-bold text-micro uppercase tracking-[0.6px] text-ink-muted">Privacy and quiet</Text>
        <View className="overflow-hidden rounded-[20px] border border-paper-edge bg-paper-raised">
          <Row
            first
            label="Quiet hours"
            detail={quiet ? 'No sound or buzz. Calls and “got home” still come through.' : 'Off'}
            value={quiet}
            onChange={(on) => change(on ? { quiet_start: 22 * 60, quiet_end: 7 * 60 } : { quiet_start: null, quiet_end: null })}
          />
          {quiet ? (
            <View className="flex-row gap-4 border-t border-paper-edge px-4 py-3">
              <TimeField label="From" value={prefs.quiet_start!} onChange={(m) => change({ quiet_start: m })} />
              <TimeField label="Until" value={prefs.quiet_end!} onChange={(m) => change({ quiet_end: m })} />
            </View>
          ) : null}
          <Row label="Hide what it’s about" detail="The lock screen shows only “Us”" value={prefs.hide_preview} onChange={(on) => change({ hide_preview: on })} />
        </View>
      </View>
      {error ? <Text className="text-small text-rose-700">{error}</Text> : null}
    </View>
  );
}

function Row({ label, detail, value, disabled, first, onChange }: { label: string; detail?: string; value: boolean; disabled?: boolean; first?: boolean; onChange: (on: boolean) => void }) {
  const c = usePalette();
  return (
    <View className={cn('min-h-[58px] flex-row items-center gap-3 px-4 py-2.5', !first && 'border-t border-paper-edge')}>
      <View className="flex-1">
        <Text className="text-body">{label}</Text>
        {detail ? <Text className="text-small text-ink-muted">{detail}</Text> : null}
      </View>
      <Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: c.rose }} accessibilityLabel={label} />
    </View>
  );
}

/** Typed like "22:30"; saved once it reads as a time. */
function TimeField({ label, value, onChange }: { label: string; value: number; onChange: (m: number) => void }) {
  const [text, setText] = useState(formatMinutes(value));
  useEffect(() => setText(formatMinutes(value)), [value]);
  return (
    <View className="flex-1 gap-1">
      <Text className="text-small text-ink-soft">{label}</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        onEndEditing={() => {
          const m = parseMinutes(text);
          if (m == null) setText(formatMinutes(value));
          else onChange(m);
        }}
        keyboardType="numbers-and-punctuation"
        accessibilityLabel={`Quiet hours ${label.toLowerCase()}`}
        placeholder="Like 22:30"
        className="rounded-[12px] border border-paper-edge bg-paper px-3 py-2.5 font-sans text-body text-ink"
      />
    </View>
  );
}
