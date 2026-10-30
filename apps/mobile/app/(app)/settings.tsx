import { clearMyPhoto, deleteAccount, friendlyError, setMyPhoto, unpair, updateMyProfile } from '@us/shared';
import { COUPLE_ENDED_TOPIC, useCouple } from '@us/shared/react';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Camera, ChevronLeft } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, AppState, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/avatar';
import { Button, IconButton } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Sheet } from '@/components/ui/sheet';
import { Display, Text } from '@/components/ui/text';
import { env } from '@/lib/env';
import { hasPushPermission, logoutPush, requestPushPermission } from '@/lib/push';
import { canRingFullScreen, openFullScreenSettings } from '@/modules/us-call';
import { playChime } from '@/lib/sounds';
import { usePalette, useThemePref } from '@/components/ui/palette';
import { Segmented } from '@/components/ui/segmented';
import { StatusScrim } from '@/components/ui/status-scrim';

export default function Settings() {
  const insets = useSafeAreaInsets();
  const c = usePalette();
  const theme = useThemePref();
  const { sb, me, partner, mySlot, partnerSlot, couple, channel, myPhotoPath, photosChanged } = useCouple();
  const [name, setName] = useState(me.display_name);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [push, setPush] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [leaving, setLeaving] = useState<'unpair' | 'delete' | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Android 14+ can switch off full-screen ringing; re-checked on return from its settings page.
  const [fullScreen, setFullScreen] = useState(canRingFullScreen);
  useEffect(() => {
    const checkPush = () => void hasPushPermission().then(setPush).catch(() => {});
    checkPush();
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      setFullScreen(canRingFullScreen());
      checkPush();
    });
    return () => sub.remove();
  }, []);

  async function changePhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      const bytes = await (await fetch(asset.uri)).arrayBuffer();
      await setMyPhoto(sb, { id: me.id, avatar_url: myPhotoPath }, couple.id, bytes, asset.mimeType ?? 'image/jpeg');
      photosChanged();
    } catch (e) {
      setPhotoError(friendlyError(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoBusy(true);
    setPhotoError(null);
    try {
      await clearMyPhoto(sb, { id: me.id, avatar_url: myPhotoPath });
      photosChanged();
    } catch (e) {
      setPhotoError(friendlyError(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-paper">
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 40 }} contentContainerClassName="gap-10 px-5">
      <View className="flex-row items-center gap-2">
        <IconButton label="Back" size="sm" onPress={() => router.back()}>
          <ChevronLeft size={22} color={c.ink} />
        </IconButton>
        <Display className="text-title">Settings</Display>
      </View>

      <View className="gap-3">
        <Display className="text-heading">You</Display>
        <View className="flex-row items-center gap-4">
          <Avatar name={me.display_name} slot={mySlot} size="lg" />
          <View className="flex-1 gap-2">
            <Button variant="secondary" size="sm" className="self-start" loading={photoBusy} icon={<Camera size={16} color={c.ink} />} onPress={() => void changePhoto()}>
              {myPhotoPath ? 'Change photo' : 'Add a profile photo'}
            </Button>
            {myPhotoPath ? (
              <Button variant="quiet" size="sm" className="self-start" disabled={photoBusy} onPress={() => void removePhoto()}>
                Remove photo
              </Button>
            ) : (
              <Text className="text-small text-ink-muted">Only {partner.display_name} can see it.</Text>
            )}
          </View>
        </View>
        {photoError ? <Text className="text-small text-rose-700">{photoError}</Text> : null}
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
        {fullScreen ? null : (
          <>
            <Text className="text-small text-ink-soft">Calls can’t show on your lock screen yet. Allow full-screen notifications for Us.</Text>
            <Button variant="secondary" className="self-start" onPress={openFullScreenSettings}>
              Show calls on the lock screen
            </Button>
          </>
        )}
        <Button variant="quiet" className="self-start px-0" onPress={() => void playChime()}>
          Hear the chime
        </Button>
      </View>

      <View className="gap-3">
        <Display className="text-heading">Leaving</Display>
        <Text className="text-small text-ink-soft">
          Unpairing deletes everything you and {partner.display_name} share, for both of you: messages, plans, memories and their photos, and
          your daily answers. Deleting your account removes all of it, and you.
        </Text>
        {leaveError ? <Text className="text-small text-rose-700">{leaveError}</Text> : null}
        <Button
          variant="secondary"
          className="self-start"
          loading={leaving === 'unpair'}
          disabled={!!leaving}
          onPress={() =>
            Alert.alert(`Unpair from ${partner.display_name}?`, 'Everything you share is deleted for both of you. This can’t be undone.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Unpair',
                style: 'destructive',
                onPress: async () => {
                  setLeaveError(null);
                  setLeaving('unpair');
                  try {
                    channel.sendChanged(COUPLE_ENDED_TOPIC);
                    await unpair(sb, couple.id);
                    router.replace('/pair');
                  } catch (e) {
                    setLeaveError(friendlyError(e));
                    setLeaving(null);
                  }
                },
              },
            ])
          }
        >
          Unpair
        </Button>
        <Button
          variant="quiet"
          className="self-start px-0"
          disabled={!!leaving}
          loading={leaving === 'delete'}
          onPress={() =>
            Alert.alert('Delete your account?', 'Your account and everything you share are deleted for good. This can’t be undone.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  setLeaveError(null);
                  setLeaving('delete');
                  try {
                    channel.sendChanged(COUPLE_ENDED_TOPIC);
                    await deleteAccount(sb);
                    logoutPush();
                    await sb.auth.signOut().catch(() => {});
                    router.replace('/sign-up');
                  } catch (e) {
                    setLeaveError(friendlyError(e));
                    setLeaving(null);
                  }
                },
              },
            ])
          }
        >
          Delete my account
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
    <StatusScrim />
    </View>
  );
}
