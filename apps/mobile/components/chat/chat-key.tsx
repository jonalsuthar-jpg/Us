import { fromBase64, MIN_PIN_LENGTH, shortCode } from '@us/shared';
import { useChatKey } from '@us/shared/react';
import { Lock } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { FormSheet } from '@/components/ui/form-sheet';
import { usePalette } from '@/components/ui/palette';
import { Text } from '@/components/ui/text';

const PIN_ERRORS: Record<string, string> = {
  wrong_pin: 'That isn’t your chat PIN.',
  no_backup: 'You haven’t set a chat PIN yet. Allow this phone from another device you’re signed in on.',
  pin_too_short: `Use at least ${MIN_PIN_LENGTH} characters.`,
};

/** Set (`mode: 'set'`) or enter (`'unlock'`) the chat PIN. */
export function PinSheet({ mode, open, onClose }: { mode: 'set' | 'unlock'; open: boolean; onClose: () => void }) {
  const { setPin, unlockWithPin } = useChatKey();
  const c = usePalette();
  const [pin, setPinText] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (mode === 'set' && pin.length < MIN_PIN_LENGTH) return setError(PIN_ERRORS.pin_too_short!);
    if (mode === 'set' && pin !== again) return setError('The two don’t match.');
    setBusy(true);
    try {
      await (mode === 'set' ? setPin(pin) : unlockWithPin(pin));
      setPinText('');
      setAgain('');
      onClose();
    } catch (e) {
      setError(PIN_ERRORS[(e as Error).message] ?? 'That didn’t work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const input = 'h-12 rounded-control border border-paper-edge bg-paper px-4 font-sans text-body text-ink';
  return (
    <FormSheet open={open} title={mode === 'set' ? 'Set a chat PIN' : 'Enter your chat PIN'} onClose={onClose}>
      <View className="gap-3">
        <Text className="text-small text-ink-soft">
          {mode === 'set'
            ? `Your chat is end-to-end encrypted. This PIN lets a new phone or browser read it when none of your other devices is around. Use at least ${MIN_PIN_LENGTH} characters; we can’t reset it for you.`
            : 'Your chat PIN opens your encrypted messages on this device.'}
        </Text>
        <TextInput
          autoFocus
          secureTextEntry
          value={pin}
          onChangeText={setPinText}
          placeholder="Chat PIN"
          placeholderTextColor={c.placeholder}
          accessibilityLabel="Chat PIN"
          className={input}
        />
        {mode === 'set' ? (
          <TextInput
            secureTextEntry
            value={again}
            onChangeText={setAgain}
            placeholder="Once more"
            placeholderTextColor={c.placeholder}
            accessibilityLabel="Chat PIN again"
            className={input}
          />
        ) : null}
        {error ? <Text className="text-small text-rose-700">{error}</Text> : null}
        <Button loading={busy} onPress={() => void submit()}>
          {mode === 'set' ? 'Save PIN' : 'Unlock'}
        </Button>
        {busy && mode === 'unlock' ? <Text className="text-micro text-ink-soft">Checking… this takes a few seconds.</Text> : null}
      </View>
    </FormSheet>
  );
}

/**
 * Over the thread: this phone is waiting for the chat key, or it should have
 * a PIN backup and doesn't yet. Old messages being encrypted shows here too.
 */
export function ChatKeyBanner() {
  const { status, myCode, hasBackup, migrating, partnerReady } = useChatKey();
  const c = usePalette();
  const [sheet, setSheet] = useState<'set' | 'unlock' | null>(null);

  let banner: { text: string; action?: string; mode?: 'set' | 'unlock' } | null = null;
  if (status === 'waiting') {
    banner = {
      text: `Open Us on another device you’re signed in on and allow this phone. Code ${myCode ?? ''}.`,
      action: 'Use chat PIN',
      mode: 'unlock',
    };
  } else if (status === 'ready' && partnerReady && !hasBackup) {
    banner = { text: 'Your chat is end-to-end encrypted. Set a PIN so you can read it on a new device.', action: 'Set PIN', mode: 'set' };
  } else if (migrating) {
    banner = { text: 'Encrypting your earlier messages…' };
  }

  return (
    <>
      {banner ? (
        <View className="flex-row items-center gap-3 border-b border-paper-edge bg-paper-sunken px-4 py-2">
          <Lock size={15} color={c.ink} />
          <Text className="flex-1 text-small">{banner.text}</Text>
          {banner.action ? (
            <Pressable accessibilityRole="button" onPress={() => setSheet(banner!.mode!)} hitSlop={8}>
              <Text className="font-sans-medium text-small text-rose-700">{banner.action}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <PinSheet mode={sheet ?? 'set'} open={sheet !== null} onClose={() => setSheet(null)} />
    </>
  );
}

/** Anywhere in the app: another of my devices is asking for the chat key. */
export function ChatKeyApproval() {
  const { pending, approve, dismiss } = useChatKey();
  const [busy, setBusy] = useState(false);
  const next = pending[0];
  if (!next) return null;
  return (
    <FormSheet open title="Allow a new device?" onClose={() => dismiss(next.device.id)}>
      <View className="gap-3">
        <Text className="text-body">
          {`${next.device.label} wants to read your encrypted chat. Allow it only if it’s yours and it shows this code:`}
        </Text>
        <Text className="text-center font-sans-medium text-title tracking-widest">{next.code}</Text>
        <Button
          loading={busy}
          onPress={() => {
            setBusy(true);
            void approve(next.device.id).finally(() => setBusy(false));
          }}
        >
          Allow
        </Button>
        <Button variant="secondary" onPress={() => dismiss(next.device.id)}>
          Not now
        </Button>
      </View>
    </FormSheet>
  );
}

/**
 * Settings: our devices that can read the chat, each with its code (the same
 * code on that device means nobody slipped in a key of their own), my PIN,
 * and signing a device of mine out of the chat.
 */
export function ChatSecurity({ meId, partnerName }: { meId: string; partnerName: string }) {
  const { status, devices, myDeviceId, hasBackup, revoke } = useChatKey();
  const [sheet, setSheet] = useState<'set' | 'unlock' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const mine = devices.filter((d) => d.user_id === meId);
  const theirs = devices.filter((d) => d.user_id !== meId);
  const row = (d: (typeof devices)[number], canRevoke: boolean) => (
    <View key={d.id} className="flex-row items-center justify-between gap-3 py-2">
      <View className="flex-1">
        <Text className="text-body">{`${d.label}${d.id === myDeviceId ? ' · this phone' : ''}`}</Text>
        <Text className="text-small tracking-wider text-ink-soft">{shortCode(fromBase64(d.public_key))}</Text>
      </View>
      {canRevoke && d.id !== myDeviceId ? (
        <Button
          size="sm"
          variant="secondary"
          loading={busy === d.id}
          onPress={() => {
            setBusy(d.id);
            void revoke(d.id).finally(() => setBusy(null));
          }}
        >
          Sign out
        </Button>
      ) : null}
    </View>
  );
  return (
    <View className="gap-3">
      <Text className="text-small text-ink-soft">
        {status === 'ready'
          ? `Messages, photos, voice notes and reactions are encrypted on your devices. Only you and ${partnerName} can read them; not even we can. Each device has a code: if it shows the same code on that device, it’s really yours.`
          : status === 'waiting'
            ? 'This phone can’t read your encrypted chat yet. Allow it from another device, or use your chat PIN.'
            : 'Checking your chat keys…'}
      </Text>
      <View>
        <Text className="font-sans-medium text-small">Your devices</Text>
        {mine.map((d) => row(d, true))}
      </View>
      {theirs.length ? (
        <View>
          <Text className="font-sans-medium text-small">{`${partnerName}’s devices`}</Text>
          {theirs.map((d) => row(d, false))}
        </View>
      ) : null}
      {status === 'ready' ? (
        <Button variant="secondary" onPress={() => setSheet('set')}>
          {hasBackup ? 'Change chat PIN' : 'Set chat PIN'}
        </Button>
      ) : status === 'waiting' ? (
        <Button variant="secondary" onPress={() => setSheet('unlock')}>
          Use chat PIN
        </Button>
      ) : null}
      <PinSheet mode={sheet ?? 'set'} open={sheet !== null} onClose={() => setSheet(null)} />
    </View>
  );
}
