'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Start with "Also keep it in Memories" ticked. */
  toMemory?: boolean;
  onSave: (o: { title: string; toMemory: boolean }) => Promise<void>;
}

export function SaveDialog({ open, onOpenChange, toMemory = false, onSave }: Props) {
  const [title, setTitle] = useState('');
  const [memory, setMemory] = useState(toMemory);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) setMemory(toMemory);
      }}
      title="Save this drawing"
      description="It goes in Our drawings, where you can both watch it being drawn again."
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await onSave({ title: title.trim(), toMemory: memory });
            setTitle('');
            onOpenChange(false);
          } catch {
            setError('That didn’t save. Check your connection and try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-small font-semibold text-ink-soft">Name it (optional)</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Under the sun"
            className="h-12 w-full rounded-control border border-paper-edge bg-paper-sunken px-3.5 text-body text-ink placeholder:text-ink-muted focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-200"
          />
        </label>
        <label className="flex items-center gap-3 text-body text-ink">
          <input type="checkbox" checked={memory} onChange={(e) => setMemory(e.target.checked)} className="h-5 w-5 accent-rose-600" />
          Also keep it in Memories
        </label>
        {error ? <p role="alert" className="text-small text-rose-700">{error}</p> : null}
        <Button type="submit" block loading={busy}>
          Save drawing
        </Button>
      </form>
    </Dialog>
  );
}
