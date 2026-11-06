import { BIRTHDAY_SONG_MAX_BYTES, songType, uploadBirthdayFile, type BirthdayContent, type BirthdayMoment, type BirthdayRoom, type BirthdaySection } from '@us/shared';
import { useCouple } from '@us/shared/react';
import { File as DeviceFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Music, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Button, IconButton } from '../ui/button';
import { Field } from '../ui/field';
import { FormSheet } from '../ui/form-sheet';
import { usePalette } from '../ui/palette';
import { Text } from '../ui/text';
import { SongPlayer, VoiceRecorder } from './audio';

export const SECTION_TITLES: Record<BirthdaySection, string> = {
  wish: 'Make a wish',
  song: 'Your song',
  notes: 'Things I’ve noticed',
  moments: 'Us, so far: moments',
  quiz: 'How well do I know you?',
  gift: 'The gift box',
  cake: 'Cut the cake together',
  card: 'Sign the card',
  ending: 'The ending',
};

type Save = <K extends BirthdaySection>(section: K, value: BirthdayContent[K]) => Promise<void>;

/** The maker rewrites one part of the story. Saved straight to the room; she sees it from midnight. */
export function BirthdayEditor({
  room,
  section,
  urls,
  onSave,
  onClose,
}: {
  room: BirthdayRoom;
  section: BirthdaySection | null;
  urls: Record<string, string>;
  onSave: Save;
  onClose: () => void;
}) {
  return (
    <FormSheet open={!!section} title={section ? SECTION_TITLES[section] : ''} onClose={onClose}>
      {section ? <Form key={section} room={room} section={section} urls={urls} onSave={onSave} onClose={onClose} /> : null}
    </FormSheet>
  );
}

function Form({ room, section, urls, onSave, onClose }: { room: BirthdayRoom; section: BirthdaySection; urls: Record<string, string>; onSave: Save; onClose: () => void }) {
  const { sb } = useCouple();
  const c = usePalette();
  const content = room.content;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [line, setLine] = useState(
    section === 'wish' || section === 'cake' || section === 'card' || section === 'ending' ? content[section].line : section === 'song' ? content.song.caption : '',
  );
  const [notes, setNotes] = useState<string[]>(content.notes.length ? content.notes : ['']);
  const [moments, setMoments] = useState<BirthdayMoment[]>(content.moments.length ? content.moments : [{ text: '', date: null, photo_path: null }]);
  const [quiz, setQuiz] = useState(content.quiz.length ? content.quiz : [{ q: '', a: '' }]);
  const [gift, setGift] = useState(content.gift);
  const [song, setSong] = useState(content.song);
  const [localPhotos, setLocalPhotos] = useState<Record<string, string>>({});

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message || 'Couldn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    await run(async () => {
      switch (section) {
        case 'wish':
        case 'cake':
        case 'card':
        case 'ending':
          await onSave(section, { line: line.trim() });
          break;
        case 'song':
          await onSave('song', { ...song, caption: line.trim() });
          break;
        case 'notes':
          await onSave('notes', notes.map((n) => n.trim()).filter(Boolean));
          break;
        case 'moments':
          await onSave(
            'moments',
            moments.filter((m) => m.text.trim()).map((m) => ({ ...m, text: m.text.trim(), date: /^\d{4}-\d{2}-\d{2}$/.test(m.date ?? '') ? m.date : null })),
          );
          break;
        case 'quiz':
          await onSave('quiz', quiz.map((x) => ({ q: x.q.trim(), a: x.a.trim() })).filter((x) => x.q && x.a));
          break;
        case 'gift':
          await onSave('gift', { title: gift.title.trim(), body: gift.body.trim() });
          break;
      }
      onClose();
    });
  }

  async function recorded(uri: string, ms: number) {
    await run(async () => {
      const bytes = await (await fetch(uri)).arrayBuffer();
      const path = await uploadBirthdayFile(sb, room, bytes, 'audio/mp4');
      setSong((s) => ({ ...s, audio_path: path, duration_ms: Math.round(ms) }));
      setLocalPhotos((p) => ({ ...p, [path]: uri }));
    });
  }

  /** A song already on the phone: any audio file from Files, Downloads, WhatsApp… */
  async function pickSong() {
    let picked: InstanceType<typeof DeviceFile> | null = null;
    try {
      const res = await DeviceFile.pickFileAsync({ mimeTypes: ['audio/*'] });
      picked = res.canceled ? null : res.result;
    } catch {
      return setError('Couldn’t open your files. Try again.');
    }
    if (!picked) return;
    const file = picked;
    const type = songType(file.name, file.type);
    if (!type) return setError('That isn’t an audio file. Pick an MP3, M4A or similar.');
    if (file.size > BIRTHDAY_SONG_MAX_BYTES) return setError('That file is over 30 MB. Pick a shorter or smaller one.');
    await run(async () => {
      const path = await uploadBirthdayFile(sb, room, await file.bytes(), type);
      setSong((s) => ({ ...s, audio_path: path, duration_ms: null }));
      setLocalPhotos((p) => ({ ...p, [path]: file.uri }));
    });
  }

  async function pickPhoto(i: number) {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.7 });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    await run(async () => {
      const bytes = await (await fetch(asset.uri)).arrayBuffer();
      const path = await uploadBirthdayFile(sb, room, bytes, asset.mimeType ?? 'image/jpeg');
      setLocalPhotos((p) => ({ ...p, [path]: asset.uri }));
      setMoments((ms) => ms.map((m, j) => (j === i ? { ...m, photo_path: path } : m)));
    });
  }

  const src = (path: string | null) => (path ? (localPhotos[path] ?? urls[path]) : undefined);

  return (
    <View className="gap-4">
      {section === 'wish' || section === 'cake' || section === 'card' || section === 'ending' ? (
        <Field label="What it says" value={line} onChangeText={setLine} multiline inputClassName="h-auto min-h-[96px] py-3" textAlignVertical="top" maxLength={300} />
      ) : null}

      {section === 'song' ? (
        <>
          <Text className="text-small text-ink-soft">Sing “Happy Birthday” (badly is fine), or upload a recording or song you already have. It plays right after she blows out the candles.</Text>
          {song.audio_path && src(song.audio_path) ? (
            <View className="items-center rounded-[22px] bg-plum-900 py-5">
              <SongPlayer key={song.audio_path} url={src(song.audio_path)!} />
            </View>
          ) : null}
          <VoiceRecorder onDone={(uri, ms) => void recorded(uri, ms)} />
          <Button variant="secondary" icon={<Music size={18} color={c.ink} />} loading={busy} onPress={() => void pickSong()}>
            {song.audio_path ? 'Upload a different audio file' : 'Upload an audio file'}
          </Button>
          <Field label="A line under it" value={line} onChangeText={setLine} maxLength={160} />
        </>
      ) : null}

      {section === 'notes' ? (
        <>
          <Text className="text-small text-ink-soft">5–7 small, true things. One shows at a time.</Text>
          {notes.map((n, i) => (
            <Row key={i} onRemove={notes.length > 1 ? () => setNotes(notes.filter((_, j) => j !== i)) : undefined}>
              <Field label={`Note ${i + 1}`} value={n} onChangeText={(t) => setNotes(notes.map((x, j) => (j === i ? t : x)))} multiline inputClassName="h-auto min-h-[72px] py-3" textAlignVertical="top" maxLength={220} />
            </Row>
          ))}
          {notes.length < 8 ? <AddButton label="Add a note" onPress={() => setNotes([...notes, ''])} /> : null}
        </>
      ) : null}

      {section === 'moments' ? (
        <>
          <Text className="text-small text-ink-soft">3–4 small moments: your first call, an inside joke. A photo is optional.</Text>
          {moments.map((m, i) => (
            <View key={i} className="gap-2 rounded-[22px] border border-paper-edge p-3">
              <Row onRemove={moments.length > 1 ? () => setMoments(moments.filter((_, j) => j !== i)) : undefined}>
                <Field label={`Moment ${i + 1}`} value={m.text} onChangeText={(t) => setMoments(moments.map((x, j) => (j === i ? { ...x, text: t } : x)))} multiline inputClassName="h-auto min-h-[72px] py-3" textAlignVertical="top" maxLength={220} />
              </Row>
              <Field label="Date (optional)" placeholder="2026-09-12" value={m.date ?? ''} onChangeText={(t) => setMoments(moments.map((x, j) => (j === i ? { ...x, date: t } : x)))} maxLength={10} />
              {m.photo_path && src(m.photo_path) ? (
                <View>
                  <Image source={{ uri: src(m.photo_path) }} className="aspect-[4/3] w-full rounded-[16px]" resizeMode="cover" />
                  <Pressable accessibilityRole="button" onPress={() => setMoments(moments.map((x, j) => (j === i ? { ...x, photo_path: null } : x)))} className="mt-1 self-start">
                    <Text className="text-small text-rose-600 underline">Remove photo</Text>
                  </Pressable>
                </View>
              ) : (
                <Button variant="secondary" size="sm" onPress={() => void pickPhoto(i)}>
                  Add a photo
                </Button>
              )}
            </View>
          ))}
          {moments.length < 6 ? <AddButton label="Add a moment" onPress={() => setMoments([...moments, { text: '', date: null, photo_path: null }])} /> : null}
        </>
      ) : null}

      {section === 'quiz' ? (
        <>
          <Text className="text-small text-ink-soft">Questions about her, with your answers. She reveals each and marks you right or wrong.</Text>
          {quiz.map((x, i) => (
            <View key={i} className="gap-2 rounded-[22px] border border-paper-edge p-3">
              <Row onRemove={quiz.length > 1 ? () => setQuiz(quiz.filter((_, j) => j !== i)) : undefined}>
                <Field label={`Question ${i + 1}`} value={x.q} onChangeText={(t) => setQuiz(quiz.map((y, j) => (j === i ? { ...y, q: t } : y)))} maxLength={120} />
              </Row>
              <Field label="Your answer" value={x.a} onChangeText={(t) => setQuiz(quiz.map((y, j) => (j === i ? { ...y, a: t } : y)))} maxLength={120} />
            </View>
          ))}
          {quiz.length < 10 ? <AddButton label="Add a question" onPress={() => setQuiz([...quiz, { q: '', a: '' }])} /> : null}
        </>
      ) : null}

      {section === 'gift' ? (
        <>
          <Text className="text-small text-ink-soft">A coupon, or a hint about a real gift (“Your actual gift arrives at 6 pm 👀”).</Text>
          <Field label="Title" value={gift.title} onChangeText={(t) => setGift({ ...gift, title: t })} maxLength={80} />
          <Field label="Details" value={gift.body} onChangeText={(t) => setGift({ ...gift, body: t })} multiline inputClassName="h-auto min-h-[72px] py-3" textAlignVertical="top" maxLength={240} />
        </>
      ) : null}

      {error ? <Text className="text-small text-rose-600">{error}</Text> : null}
      <Button onPress={() => void save()} loading={busy}>
        Save
      </Button>
      <Text className="text-micro text-ink-muted">{`${room.name} can’t see any of this until midnight on her birthday.`}</Text>
    </View>
  );
}

function Row({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  const c = usePalette();
  return (
    <View className="flex-row items-end gap-2">
      <View className="flex-1">{children}</View>
      {onRemove ? (
        <IconButton label="Remove" size="sm" onPress={onRemove}>
          <Trash2 size={18} color={c.inkMuted} />
        </IconButton>
      ) : null}
    </View>
  );
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Button variant="secondary" size="sm" icon={<Plus size={16} />} onPress={onPress}>
      {label}
    </Button>
  );
}
