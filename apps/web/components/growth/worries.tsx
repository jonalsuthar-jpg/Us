'use client';

import { addWorry, deleteWorry, listWorries, setWorryShared } from '@us/shared';
import { useCouple, useCoupleData } from '@us/shared/react';
import { useState, type FormEvent } from 'react';
import { EmptyNote, ErrorNote } from '@/components/app/module-header';
import { Button } from '@/components/ui/button';
import { TextAreaField } from '@/components/ui/field';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Sheet } from '@/components/ui/sheet';

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export function GrowthWorries() {
  const { sb, me, partner } = useCouple();
  // Shared worries matter to my partner too, so share/unshare pings this topic.
  const worries = useCoupleData('growth:worries', () => listWorries(sb), [sb]);
  const all = worries.data ?? [];
  const mine = all.filter((w) => w.owner_id === me.id);
  const fromPartner = all.filter((w) => w.owner_id !== me.id);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fail = (e: Error) => setError(e.message);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);
    try {
      await worries.mutate(() => addWorry(sb, { owner_id: me.id, body: body.trim() }));
      setBody('');
    } catch (err) {
      fail(err as Error);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        <Sheet pad="md">
          <form onSubmit={add} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-heading text-ink">Set it down here</h2>
              <PrivacyBadge privacy="private" partnerName={partner.display_name} />
            </div>
            <TextAreaField
              label="What’s worrying you?"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={5000}
              hint={`Private by default. You can choose to share one with ${partner.display_name} later — or never.`}
            />
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" disabled={!body.trim()}>
              Keep it here
            </Button>
          </form>
        </Sheet>

        <section aria-labelledby="my-worries" className="space-y-3">
          <h3 id="my-worries" className="font-display text-lead text-ink">
            Yours
          </h3>
          {mine.length === 0 ? (
            <EmptyNote title="Nothing here">That’s allowed too.</EmptyNote>
          ) : (
            <ul className="space-y-3">
              {mine.map((w) => (
                <li key={w.id}>
                  <Sheet tone={w.shared_at ? 'note' : 'inset'} accent={w.shared_at ? 'teal' : 'none'} pad="sm" className="space-y-3">
                    <p className="whitespace-pre-wrap text-ink">{w.body}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-micro text-ink-muted">
                        {day(w.created_at)}
                        {w.shared_at ? ` · shared with ${partner.display_name} ${day(w.shared_at)}` : ' · only you'}
                      </span>
                      <span className="flex gap-1">
                        <Button
                          size="sm"
                          variant="quiet"
                          onClick={() => {
                            if (!w.shared_at && !window.confirm(`Share this with ${partner.display_name}? They’ll be able to read it.`)) return;
                            void worries.mutate(() => setWorryShared(sb, w.id, !w.shared_at)).catch(fail);
                          }}
                        >
                          {w.shared_at ? 'Make private' : `Share with ${partner.display_name}`}
                        </Button>
                        <Button size="sm" variant="quiet" onClick={() => window.confirm('Delete this for good?') && void worries.mutate(() => deleteWorry(sb, w.id)).catch(fail)}>
                          Delete
                        </Button>
                      </span>
                    </div>
                  </Sheet>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="partner-worries" className="space-y-3">
        <h3 id="partner-worries" className="font-display text-lead text-ink">
          {partner.display_name} shared with you
        </h3>
        {fromPartner.length === 0 ? (
          <EmptyNote title="Nothing shared">When {partner.display_name} chooses to share a worry, it appears here. Gently.</EmptyNote>
        ) : (
          <ul className="space-y-3">
            {fromPartner.map((w) => (
              <li key={w.id}>
                <Sheet tone="note" accent="teal" pad="sm">
                  <p className="whitespace-pre-wrap text-ink">{w.body}</p>
                  <p className="mt-2 text-micro text-ink-muted">Shared {day(w.shared_at ?? w.created_at)}</p>
                </Sheet>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
