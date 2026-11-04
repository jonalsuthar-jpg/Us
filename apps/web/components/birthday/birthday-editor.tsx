'use client';

import { uploadBirthdayFile, type BirthdayContent, type BirthdayMoment, type BirthdayRoom, type BirthdaySection } from '@us/shared';
import { useCouple } from '@us/shared/react';
import { Plus, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, TextAreaField } from '@/components/ui/field';
import { shrinkPhoto } from '@/lib/image';
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
    <Dialog
      open={!!section}
      onOpenChange={(o) => !o && onClose()}
      title={section ? SECTION_TITLES[section] : ''}
      description={`${room.name} can’t see any of this until midnight on her birthday.`}
      className="sm:w-[min(92vw,560px)]"
    >
      {section ? <Form key={section} room={room} section={section} urls={urls} onSave={onSave} onClose={onClose} /> : null}
    </Dialog>
  );
}

function Form({ room, section, urls, onSave, onClose }: { room: BirthdayRoom; section: BirthdaySection; urls: Record<string, string>; onSave: Save; onClose: () => void }) {
  const { sb } = useCouple();
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
  const [local, setLocal] = useState<Record<string, string>>({});
  const photoFor = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

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

  const save = () =>
    run(async () => {
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

  const recorded = (blob: Blob, ms: number) =>
    run(async () => {
      const path = await uploadBirthdayFile(sb, room, blob, blob.type);
      setSong((s) => ({ ...s, audio_path: path, duration_ms: Math.round(ms) }));
      setLocal((p) => ({ ...p, [path]: URL.createObjectURL(blob) }));
    });

  const photo = (file: File) =>
    run(async () => {
      const { blob, type } = await shrinkPhoto(file);
      const path = await uploadBirthdayFile(sb, room, blob, type);
      const i = photoFor.current;
      setLocal((p) => ({ ...p, [path]: URL.createObjectURL(blob) }));
      setMoments((ms) => ms.map((m, j) => (j === i ? { ...m, photo_path: path } : m)));
    });

  const src = (path: string | null) => (path ? (local[path] ?? urls[path]) : undefined);

  return (
    <div className="max-h-[65dvh] space-y-4 overflow-y-auto pr-1">
      {section === 'wish' || section === 'cake' || section === 'card' || section === 'ending' ? (
        <TextAreaField label="What it says" value={line} onChange={(e) => setLine(e.target.value)} rows={3} maxLength={300} />
      ) : null}

      {section === 'song' ? (
        <>
          <p className="text-small text-ink-soft">Sing “Happy Birthday” (badly is fine). It plays right after she blows out the candles.</p>
          {song.audio_path && src(song.audio_path) ? (
            <div className="rounded-[22px] bg-plum-900 py-5">
              <SongPlayer key={song.audio_path} url={src(song.audio_path)!} />
            </div>
          ) : null}
          <VoiceRecorder onDone={(b, ms) => void recorded(b, ms)} />
          <Field label="A line under it" value={line} onChange={(e) => setLine(e.target.value)} maxLength={160} />
        </>
      ) : null}

      {section === 'notes' ? (
        <>
          <p className="text-small text-ink-soft">5–7 small, true things. One shows at a time.</p>
          {notes.map((n, i) => (
            <Row key={i} onRemove={notes.length > 1 ? () => setNotes(notes.filter((_, j) => j !== i)) : undefined}>
              <TextAreaField label={`Note ${i + 1}`} value={n} onChange={(e) => setNotes(notes.map((x, j) => (j === i ? e.target.value : x)))} rows={2} maxLength={220} />
            </Row>
          ))}
          {notes.length < 8 ? <Add onClick={() => setNotes([...notes, ''])}>Add a note</Add> : null}
        </>
      ) : null}

      {section === 'moments' ? (
        <>
          <p className="text-small text-ink-soft">3–4 small moments: your first call, an inside joke. A photo is optional.</p>
          {moments.map((m, i) => (
            <div key={i} className="space-y-2 rounded-[22px] border border-paper-edge p-3">
              <Row onRemove={moments.length > 1 ? () => setMoments(moments.filter((_, j) => j !== i)) : undefined}>
                <TextAreaField label={`Moment ${i + 1}`} value={m.text} onChange={(e) => setMoments(moments.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} rows={2} maxLength={220} />
              </Row>
              <Field label="Date (optional)" type="date" value={m.date ?? ''} onChange={(e) => setMoments(moments.map((x, j) => (j === i ? { ...x, date: e.target.value || null } : x)))} />
              {m.photo_path && src(m.photo_path) ? (
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src(m.photo_path)} alt="" className="aspect-[4/3] w-full rounded-[16px] object-cover" />
                  <button type="button" onClick={() => setMoments(moments.map((x, j) => (j === i ? { ...x, photo_path: null } : x)))} className="mt-1 text-small text-rose-600 underline">
                    Remove photo
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    photoFor.current = i;
                    fileInput.current?.click();
                  }}
                >
                  Add a photo
                </Button>
              )}
            </div>
          ))}
          {moments.length < 6 ? <Add onClick={() => setMoments([...moments, { text: '', date: null, photo_path: null }])}>Add a moment</Add> : null}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void photo(f);
            }}
          />
        </>
      ) : null}

      {section === 'quiz' ? (
        <>
          <p className="text-small text-ink-soft">Questions about her, with your answers. She reveals each and marks you right or wrong.</p>
          {quiz.map((x, i) => (
            <div key={i} className="space-y-2 rounded-[22px] border border-paper-edge p-3">
              <Row onRemove={quiz.length > 1 ? () => setQuiz(quiz.filter((_, j) => j !== i)) : undefined}>
                <Field label={`Question ${i + 1}`} value={x.q} onChange={(e) => setQuiz(quiz.map((y, j) => (j === i ? { ...y, q: e.target.value } : y)))} maxLength={120} />
              </Row>
              <Field label="Your answer" value={x.a} onChange={(e) => setQuiz(quiz.map((y, j) => (j === i ? { ...y, a: e.target.value } : y)))} maxLength={120} />
            </div>
          ))}
          {quiz.length < 10 ? <Add onClick={() => setQuiz([...quiz, { q: '', a: '' }])}>Add a question</Add> : null}
        </>
      ) : null}

      {section === 'gift' ? (
        <>
          <p className="text-small text-ink-soft">A coupon, or a hint about a real gift (“Your actual gift arrives at 6 pm 👀”).</p>
          <Field label="Title" value={gift.title} onChange={(e) => setGift({ ...gift, title: e.target.value })} maxLength={80} />
          <TextAreaField label="Details" value={gift.body} onChange={(e) => setGift({ ...gift, body: e.target.value })} rows={3} maxLength={240} />
        </>
      ) : null}

      {error ? <p className="text-small text-rose-600">{error}</p> : null}
      <Button type="button" block loading={busy} onClick={() => void save()}>
        Save
      </Button>
    </div>
  );
}

function Row({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">{children}</div>
      {onRemove ? (
        <button type="button" aria-label="Remove" onClick={onRemove} className="mb-1 rounded-full p-2.5 text-ink-muted hover:bg-paper-sunken hover:text-ink">
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

function Add({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onClick}>
      <Plus className="h-4 w-4" />
      {children}
    </Button>
  );
}
