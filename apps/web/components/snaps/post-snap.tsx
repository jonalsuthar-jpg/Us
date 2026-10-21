'use client';

import { postSnap } from '@us/shared';
import { useCouple } from '@us/shared/react';
import { useEffect, useState, type FormEvent } from 'react';
import { ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { shrinkPhoto } from '@/lib/image';

/** Preview the chosen photo, add a caption, share it for 24 hours. */
export function PostSnap({ file, onClose, mutate }: { file: File | null; onClose: () => void; mutate: <R>(write: () => Promise<R>) => Promise<R> }) {
  const { sb, couple, me, partner } = useCouple();
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    setCaption('');
    setError(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, type } = await shrinkPhoto(file);
      await mutate(() => postSnap(sb, couple.id, me.id, { body: blob, contentType: type }, caption));
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={!!file}
      onOpenChange={(o) => !o && !busy && onClose()}
      title="Share a snap"
      description={`${partner.display_name} can see it for the next 24 hours. Then it’s gone, unless one of you keeps it.`}
    >
      <form onSubmit={submit} className="space-y-4">
        {preview ? <img src={preview} alt="Your snap" className="mx-auto max-h-[45dvh] w-auto max-w-full rounded-control object-contain" /> : null}
        <Field label="Caption (optional)" value={caption} maxLength={200} onChange={(e) => setCaption(e.target.value)} placeholder="What’s happening?" />
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button type="submit" block loading={busy}>
          Share for 24 hours
        </Button>
      </form>
    </Dialog>
  );
}
