import AsyncStorage from '@react-native-async-storage/async-storage';
import { firstRunCountdowns, friendlyError, offerFirstRun, parseTypedDate, saveFirstRun, setupDoneKey } from '@us/shared';
import { useCouple } from '@us/shared/react';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { hasPushPermission, requestPushPermission } from '@/lib/push';
import { Button } from '../ui/button';
import { Field } from '../ui/field';
import { FormSheet } from '../ui/form-sheet';
import { Text } from '../ui/text';

type Step = 'dates' | 'photo' | 'notify';

/**
 * A short welcome for a new couple: the dates that matter become countdowns
 * on Home, a photo of the two of you, and notifications. Every step saves on
 * its own and can be skipped; it's offered once per person on this phone.
 */
export function FirstRunSetup({ hasPhoto, onPhoto, onSaved }: { hasPhoto: boolean; onPhoto: () => Promise<void>; onSaved: () => void }) {
  const { sb, couple, me, partner, channel } = useCouple();
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('dates');
  const [dates, setDates] = useState({ anniversary: '', myBirthday: '', theirBirthday: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushOn, setPushOn] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(setupDoneKey(me.id))
      .then((done) => {
        if (!done && (welcome === '1' || offerFirstRun(couple.paired_at))) setOpen(true);
      })
      .catch(() => {});
    void hasPushPermission().then(setPushOn).catch(() => {});
  }, [me.id, couple.paired_at, welcome]);

  const finish = () => {
    void AsyncStorage.setItem(setupDoneKey(me.id), '1').catch(() => {});
    setOpen(false);
  };
  const next = () => {
    setError(null);
    if (step === 'dates') setStep(hasPhoto ? 'notify' : 'photo');
    else if (step === 'photo') setStep('notify');
    else finish();
  };

  async function saveDates() {
    const typed = { anniversary: dates.anniversary, myBirthday: dates.myBirthday, theirBirthday: dates.theirBirthday };
    const parsed = Object.fromEntries(Object.entries(typed).map(([k, v]) => [k, v.trim() ? parseTypedDate(v) : '']));
    if (Object.values(parsed).some((v) => v === null)) return setError('Type dates like 14/08/1995.');
    const rows = firstRunCountdowns(parsed as Record<string, string>, { me: me.display_name, partner: partner.display_name });
    if (!rows.length) return next();
    setBusy(true);
    try {
      await saveFirstRun(sb, { coupleId: couple.id, meId: me.id }, rows);
      channel.sendChanged('home');
      onSaved();
      next();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  const title = step === 'dates' ? 'The days that matter' : step === 'photo' ? 'A photo of you two' : 'Know when they reach out';
  return (
    <FormSheet open={open} title={title} onClose={finish}>
      {step === 'dates' ? (
        <View className="gap-4">
          <Text className="text-ink-soft">Home counts down to each one. Add what you know; you can change them any time.</Text>
          <Field label="When did you get together?" placeholder="Like 14/02/2024" value={dates.anniversary} onChangeText={(t) => setDates({ ...dates, anniversary: t })} keyboardType="numbers-and-punctuation" />
          <Field label="Your birthday" placeholder="Like 14/08/1995" value={dates.myBirthday} onChangeText={(t) => setDates({ ...dates, myBirthday: t })} keyboardType="numbers-and-punctuation" />
          <Field label={`${partner.display_name}’s birthday`} placeholder="Like 03/09/1996" value={dates.theirBirthday} onChangeText={(t) => setDates({ ...dates, theirBirthday: t })} keyboardType="numbers-and-punctuation" />
          {error ? <Text className="text-small text-rose-700">{error}</Text> : null}
          <Button loading={busy} onPress={() => void saveDates()}>
            Save and continue
          </Button>
          <Button variant="quiet" onPress={next}>
            Skip
          </Button>
        </View>
      ) : null}

      {step === 'photo' ? (
        <View className="gap-4">
          <Text className="text-ink-soft">It sits at the top of Home for both of you.</Text>
          <Button
            loading={busy}
            onPress={async () => {
              setBusy(true);
              try {
                await onPhoto();
                next();
              } finally {
                setBusy(false);
              }
            }}
          >
            Choose a photo
          </Button>
          <Button variant="quiet" onPress={next}>
            Later
          </Button>
        </View>
      ) : null}

      {step === 'notify' ? (
        <View className="gap-4">
          <Text className="text-ink-soft">{`So you hear when ${partner.display_name} messages, calls or thinks of you.`}</Text>
          <Button
            disabled={pushOn}
            onPress={async () => {
              await requestPushPermission().catch(() => false);
              finish();
            }}
          >
            {pushOn ? 'Notifications are on' : 'Turn on notifications'}
          </Button>
          <Button variant="quiet" onPress={finish}>
            {pushOn ? 'Done' : 'Not now'}
          </Button>
        </View>
      ) : null}
    </FormSheet>
  );
}
