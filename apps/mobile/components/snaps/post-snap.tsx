import { postSnap } from '@us/shared';
import { useCouple } from '@us/shared/react';
import * as ImagePicker from 'expo-image-picker';
import { Camera, ImageIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { ErrorNote } from '../module-screen';
import { Button } from '../ui/button';
import { Field } from '../ui/field';
import { FormSheet } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { Text } from '../ui/text';

type Picked = { uri: string; mimeType: string };

/** Take or choose a photo, add a caption, share it for 24 hours. */
export function PostSnap({ open, onClose, mutate }: { open: boolean; onClose: () => void; mutate: <R>(write: () => Promise<R>) => Promise<R> }) {
  const { sb, couple, me, partner } = useCouple();
  const c = usePalette();
  const [photo, setPhoto] = useState<Picked | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhoto(null);
    setCaption('');
    setError(null);
  }, [open]);

  async function pick(from: 'camera' | 'library') {
    setError(null);
    if (from === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setError('Us needs the camera for this. You can allow it in Settings, or choose a photo instead.');
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const res = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = res.canceled ? null : res.assets[0];
    if (asset) setPhoto({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
  }

  async function share() {
    if (!photo) return;
    setBusy(true);
    setError(null);
    try {
      const bytes = await (await fetch(photo.uri)).arrayBuffer();
      await mutate(() => postSnap(sb, couple.id, me.id, { body: bytes, contentType: photo.mimeType }, caption));
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormSheet open={open} title="Share a snap" onClose={() => !busy && onClose()}>
      <Text className="text-small text-ink-soft">
        {partner.display_name} can see it for the next 24 hours. Then it’s gone, unless one of you keeps it.
      </Text>
      {photo ? (
        <>
          <Image source={{ uri: photo.uri }} className="aspect-[3/4] w-full rounded-control bg-paper-sunken" resizeMode="contain" />
          <Field label="Caption (optional)" value={caption} maxLength={200} onChangeText={setCaption} placeholder="What’s happening?" />
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <Button onPress={() => void share()} loading={busy}>
            Share for 24 hours
          </Button>
          <Button variant="quiet" onPress={() => setPhoto(null)} disabled={busy}>
            Choose a different photo
          </Button>
        </>
      ) : (
        <View className="gap-3">
          <Button icon={<Camera size={18} color="#fff" />} onPress={() => void pick('camera')}>
            Take a photo
          </Button>
          <Button variant="secondary" icon={<ImageIcon size={18} color={c.ink} />} onPress={() => void pick('library')}>
            Choose from your photos
          </Button>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </View>
      )}
    </FormSheet>
  );
}
