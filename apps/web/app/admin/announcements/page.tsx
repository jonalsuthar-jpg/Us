'use client';

import { adminAnnounce, adminAnnouncements, adminEndAnnouncement, friendlyError } from '@us/shared';
import { useState, type FormEvent } from 'react';
import { AdminHeader, useAdminData } from '@/components/admin/admin-shell';
import { when } from '@/components/admin/person-panel';
import { Button } from '@/components/ui/button';
import { Field, TextAreaField } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Sheet } from '@/components/ui/sheet';
import { getSupabase } from '@/lib/supabase/client';

/** One line on everyone's Home: a new feature, planned downtime, a thank-you. */
export default function AnnouncementsPage() {
  const list = useAdminData(() => adminAnnouncements(getSupabase()));
  const [body, setBody] = useState('');
  const [tone, setTone] = useState<'note' | 'warning'>('note');
  const [ends, setEnds] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = Date.now();
  const live = (list.data ?? []).find((a) => Date.parse(a.starts_at) <= now && (!a.ends_at || Date.parse(a.ends_at) > now));

  async function post(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminAnnounce(getSupabase(), body, tone, ends ? new Date(ends).toISOString() : null);
      setBody('');
      setEnds('');
      list.reload();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AdminHeader title="Announcements" />
      {live && (
        <Sheet tone="note" accent={live.tone === 'warning' ? 'gold' : 'plum'} pad="md" className="mb-6">
          <p className="text-micro text-ink-muted">Showing now{live.ends_at ? ` · until ${when(live.ends_at)}` : ''}</p>
          <p className="mt-1 text-ink">{live.body}</p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={async () => {
              await adminEndAnnouncement(getSupabase(), live.id).catch((e) => setError(friendlyError(e)));
              list.reload();
            }}
          >
            Take it down
          </Button>
        </Sheet>
      )}

      <form onSubmit={post} className="space-y-4 rounded-sheet border border-paper-edge bg-paper-raised p-5">
        <TextAreaField label="Message" value={body} onChange={(e) => setBody(e.target.value)} maxLength={280} hint={`${body.length}/280 · shown at the top of Home on web and mobile`} />
        <div className="flex flex-wrap items-end gap-4">
          <Segmented
            label="Tone"
            size="sm"
            options={[
              { value: 'note', label: 'Note' },
              { value: 'warning', label: 'Heads up' },
            ]}
            value={tone}
            onChange={setTone}
          />
          <Field label="Ends (optional)" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} className="sm:w-60" />
          <Button type="submit" loading={busy} disabled={!body.trim()} className="sm:ml-auto">
            {live ? 'Replace current' : 'Post'}
          </Button>
        </div>
        {error && <p className="text-small text-rose-700" role="alert">{error}</p>}
      </form>

      <h2 className="mt-10 text-small font-medium text-ink">Earlier</h2>
      <ul className="mt-2 divide-y divide-paper-edge">
        {(list.data ?? [])
          .filter((a) => a !== live)
          .map((a) => (
            <li key={a.id} className="py-3">
              <p className="text-small text-ink">{a.body}</p>
              <p className="text-micro text-ink-muted">
                {when(a.starts_at)} – {when(a.ends_at)}
              </p>
            </li>
          ))}
      </ul>
    </>
  );
}
