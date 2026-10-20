import { friendlyError, updateMyProfile } from '@us/shared';
import { useCouple } from '@us/shared/react';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Sheet } from '@/components/ui/sheet';
import { Display, Text } from '@/components/ui/text';
import { env } from '@/lib/env';
import { logoutPush, requestPushPermission } from '@/lib/push';
import { playChime } from '@/lib/sounds';
import { usePalette, useThemePref } from '@/components/ui/palette';
import { Segmented } from '@/components/ui/segmented';

export default function Settings() {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const theme = useThemePref();
  const { sb, me, partner, mySlot, partnerSlot, couple } = useCouple();
  const [name, setName] = useState(me.display_name);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [push, setPush] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 }} contentContainerClassName="gap-10 px-5">
      <View className="flex-row items-center gap-2">
        <IconButton label="Back" size="sm" onPress={() => router.back()}>
          <ChevronLeft size={22} color={c.ink} />
        </IconButton>
        <Display className="text-title">Settings</Display>
      </View>

      <View className="gap-3">
        <Display className="text-heading">You</Display>
        <Field label="Your name" value={name} maxLength={60} onChangeText={setName} error={error} />
        <Button
          variant="secondary"
          className="self-start"
          disabled={!name.trim() || name === me.display_name}
          onPress={async () => {
            try {
              await updateMyProfile(sb, me.id, { display_name: name.trim() });
              setSaved(true);
            } catch (e) {
              setError(friendlyError(e));
            }
          }}
        >
          {saved ? 'Saved' : 'Save'}
        </Button>
      </View>

      <View className="gap-3">
        <Display className="text-heading">Password</Display>
        <Field
          label="New password"
          secureTextEntry
          autoComplete="new-password"
          value={newPassword}
          onChangeText={setNewPassword}
          hint="At least 8 characters."
          error={passwordMsg && !passwordMsg.ok ? passwordMsg.text : null}
        />
        {passwordMsg?.ok ? <Text className="text-small text-sage-700">{passwordMsg.text}</Text> : null}
        <Button
          variant="secondary"
          className="self-start"
          disabled={newPassword.length < 8}
          onPress={async () => {
            setPasswordMsg(null);
            const { error: err } = await sb.auth.updateUser({ password: newPassword });
            if (err) setPasswordMsg({ ok: false, text: friendlyError(err) });
            else {
              setPasswordMsg({ ok: true, text: 'Password updated.' });
              setNewPassword('');
            }
          }}
        >
          Update password
        </Button>
      </View>

      <View className="gap-3">
        <Display className="text-heading">The two of you</Display>
        <Sheet className="flex-row items-center gap-4">
          <View className="flex-row">
            <Avatar name={me.display_name} slot={mySlot} />
            <Avatar name={partner.display_name} slot={partnerSlot} className="-ml-3" />
          </View>
          <Text className="flex-1 text-small text-ink-soft">
            Paired with {partner.display_name} since {new Date(couple.paired_at).toLocaleDateString()}.
          </Text>
        </Sheet>
        <View className="flex-row flex-wrap gap-2">
          <PrivacyBadge privacy="shared" partnerName={partner.display_name} />
          <PrivacyBadge privacy="private" partnerName={partner.display_name} />
          <PrivacyBadge privacy="private-until-reveal" partnerName={partner.display_name} />
        </View>
      </View>

      <View className="gap-3">
        <Display className="text-heading">Appearance</Display>
        <Segmented
          label="Theme"
          options={[
            { value: 'system', label: 'Match device' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={theme.pref}
          onChange={theme.setPref}
        />
        <Text className="text-small text-ink-muted">Saved on this device. Calls always use the night palette.</Text>
      </View>

      <View className="gap-3">
        <Display className="text-heading">Notifications</Display>
        {env.oneSignalAppId ? (
          <Button className="self-start" disabled={push} onPress={async () => setPush(await requestPushPermission())}>
            {push ? 'Notifications on' : 'Turn on notifications'}
          </Button>
        ) : (
          <Text className="text-small text-ink-muted">Push isn’t configured (EXPO_PUBLIC_ONESIGNAL_APP_ID).</Text>
        )}
        <Button variant="quiet" className="self-start px-0" onPress={() => void playChime()}>
          Hear the chime
        </Button>
      </View>

      <Button
        variant="secondary"
        onPress={async () => {
          logoutPush();
          await sb.auth.signOut();
          router.replace('/sign-in');
        }}
      >
        Sign out
      </Button>
    </ScrollView>
  );
}
