'use client';

import { draftMessage, tokens, type Message } from '@us/shared';
import { Mic, MicOff, MonitorUp, Phone, PhoneOff, Video } from 'lucide-react';
import { useState } from 'react';
import { Bubble } from '@/components/chat/bubble';
import { CallEntry } from '@/components/chat/call-entry';
import { TypingBubble } from '@/components/chat/typing-bubble';
import { Avatar, Seal } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { PrivacyBadge } from '@/components/ui/privacy';
import { Sheet } from '@/components/ui/sheet';

const SWATCHES: { name: string; role: string; hex: string; text?: boolean }[] = [
  { name: 'Deep plum', role: 'Ink · dark surfaces · calls', hex: tokens.colors.plum[800], text: true },
  { name: 'Paper', role: 'Light surface', hex: tokens.colors.paper.DEFAULT },
  { name: 'Rose clay', role: 'Primary · partner A', hex: tokens.colors.rose[400], text: true },
  { name: 'Dusty teal', role: 'Secondary · partner B', hex: tokens.colors.teal[500], text: true },
  { name: 'Warm gold', role: 'Highlights · memories', hex: tokens.colors.gold[400] },
  { name: 'Sage', role: 'Growth · wellbeing', hex: tokens.colors.sage[400], text: true },
];

const SAMPLE_AT = '2026-10-20T19:42:00.000Z';

function sample(id: string, sender: string, body: string, status: Message['status'], extra: Partial<Message> = {}): Message {
  // Fixed timestamps keep server and client renders identical.
  return { ...draftMessage('c', sender, body), id, status, pending: false, created_at: SAMPLE_AT, ...extra };
}

export default function DesignPage() {
  const [dialog, setDialog] = useState(false);
  const now = SAMPLE_AT;
  const call = {
    id: 'x',
    couple_id: 'c',
    caller_id: 'b',
    callee_id: 'a',
    media: 'video' as const,
    status: 'missed' as const,
    created_at: now,
    answered_at: null,
    ended_at: now,
  };

  return (
    <main className="mx-auto max-w-5xl space-y-20 px-5 py-12 sm:px-10 sm:py-20">
      <header className="flex items-end justify-between gap-6">
        <div>
          <Seal size={44} />
          <h1 className="mt-6 font-display text-[44px] leading-none text-ink sm:text-[64px]">The Us system</h1>
          <p className="mt-4 max-w-lg text-ink-soft">
            Tokens live in <code className="text-small">packages/shared/src/tokens.js</code> and feed both Tailwind (web)
            and NativeWind (mobile). Components mirror each other on both platforms.
          </p>
        </div>
      </header>

      <Section title="Colour">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {SWATCHES.map((s) => (
            <div key={s.name} className="overflow-hidden rounded-sheet border border-paper-edge">
              <div className="flex h-28 items-end p-4" style={{ background: s.hex }}>
                <span className={s.text ? 'font-display text-lead text-white' : 'font-display text-lead text-ink'}>Aa</span>
              </div>
              <div className="bg-paper-raised p-4">
                <p className="font-medium text-ink">{s.name}</p>
                <p className="text-micro text-ink-muted">
                  {s.role} · <span className="font-mono">{s.hex}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-small text-ink-muted">
          Brand anchors are used for large accents. Text and button fills use deeper stops (e.g. rose-600 #C41D55 —
          5.6:1 with white) so everything meets WCAG AA.
        </p>
      </Section>

      <Section title="Type">
        <div className="space-y-6">
          <p className="font-display text-hero font-light text-ink">
            The night we <em>missed</em> the last train.
          </p>
          <p className="font-display text-title text-ink">Fraunces, for feeling.</p>
          <p className="max-w-xl text-lead text-ink-soft">
            Work Sans, for doing — every label, button and message. The serif is reserved for names, moments and
            memories, so when it appears it means something.
          </p>
          <p className="text-small text-ink-muted">Small · 14/20 — metadata, hints</p>
        </div>
      </Section>

      <Section title="Actions">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="quiet">Quiet</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary" onClick={() => setDialog(true)}>
            Open dialog
          </Button>
        </div>
        <Sheet tone="night" pad="lg" className="mt-6 flex flex-wrap items-center justify-center gap-4">
          <IconButton label="Mute" tone="night" size="lg">
            <Mic className="h-6 w-6" />
          </IconButton>
          <IconButton label="Unmute" tone="nightOff" size="lg" pressed>
            <MicOff className="h-6 w-6" />
          </IconButton>
          <IconButton label="Share screen" tone="night" size="lg">
            <MonitorUp className="h-6 w-6" />
          </IconButton>
          <IconButton label="End call" tone="end" size="lg" className="w-20">
            <PhoneOff className="h-6 w-6" />
          </IconButton>
          <IconButton label="Accept" tone="accept" size="xl">
            <Video className="h-7 w-7" />
          </IconButton>
        </Sheet>
      </Section>

      <Section title="Inputs">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="What should they call you?" placeholder="Sam" hint="Shown only to your partner." />
          <Field label="Invite code" defaultValue="ABCD-EFG" error="That code doesn't match an open invite." />
        </div>
      </Section>

      <Section title="Surfaces">
        <div className="grid gap-5 sm:grid-cols-2">
          <Sheet>
            <p className="font-display text-heading">Paper</p>
            <p className="mt-1 text-small text-ink-soft">A sheet lifted off the page.</p>
          </Sheet>
          <Sheet tone="inset">
            <p className="font-display text-heading">Inset</p>
            <p className="mt-1 text-small text-ink-soft">A recessed well for grouped controls.</p>
          </Sheet>
          <Sheet tone="note" accent="gold">
            <p className="font-display text-heading">Note</p>
            <p className="mt-1 text-small text-ink-soft">A single rule in a module colour. Memories use gold.</p>
          </Sheet>
          <Sheet tone="night">
            <p className="font-display text-heading">Night</p>
            <p className="mt-1 text-small text-plum-200">Plum, for calls and focused moments.</p>
          </Sheet>
        </div>
      </Section>

      <Section title="People & privacy">
        <div className="flex flex-wrap items-center gap-6">
          <Avatar name="Rosa" slot="a" size="lg" online />
          <Avatar name="Theo" slot="b" size="lg" online={false} />
          <Seal size={64} />
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <PrivacyBadge privacy="shared" partnerName="Theo" />
          <PrivacyBadge privacy="private" partnerName="Theo" />
          <PrivacyBadge privacy="private-until-reveal" partnerName="Theo" />
        </div>
      </Section>

      <Section title="Conversation">
        <Sheet tone="inset" pad="lg" className="mx-auto max-w-xl">
          <ol>
            <Bubble message={sample('1', 'b', 'Are we still on for tonight?', 'read')} mine={false} slot="b" authorName="Theo" first last={false} />
            <Bubble message={sample('2', 'b', 'I found the place with the lanterns', 'read')} mine={false} slot="b" authorName="Theo" first={false} last />
            <Bubble message={sample('3', 'a', 'Yes!! 8pm?', 'read')} mine slot="a" authorName="Rosa" first last={false} />
            <Bubble message={sample('4', 'a', 'Bringing the umbrella this time', 'delivered')} mine slot="a" authorName="Rosa" first={false} last={false} />
            <Bubble message={sample('5', 'a', 'Sent, not yet delivered', 'sent')} mine slot="a" authorName="Rosa" first={false} last={false} />
            <Bubble message={sample('6', 'a', 'Sending…', 'sent', { pending: true })} mine slot="a" authorName="Rosa" first={false} last={false} />
            <Bubble message={sample('7', 'a', 'This one failed', 'sent', { failed: true })} mine slot="a" authorName="Rosa" first={false} last onRetry={() => {}} />
            <CallEntry message={sample('8', 'b', '', 'read', { kind: 'call', body: null, call })} myId="a" onCallBack={() => {}} />
            <Bubble
              message={sample('9', 'b', 'Perfect, see you there', 'read', { reply_to: '3', reactions: { a: '❤️', b: '❤️' } })}
              quote={{ id: '3', author: 'You', text: 'Yes!! 8pm?' }}
              mine={false}
              slot="b"
              authorName="Theo"
              myId="a"
              first
              last
            />
            <Bubble
              message={sample('10', 'a', 'Don’t forget the tickets', 'read', { pinned_at: SAMPLE_AT, reactions: { b: '👍' } })}
              mine
              slot="a"
              authorName="Rosa"
              myId="a"
              first
              last={false}
              active
            />
            <Bubble
              message={sample('11', 'a', '', 'delivered', { body: null, media_kind: 'audio', media_meta: { duration_ms: 14_000 } })}
              mine
              slot="a"
              authorName="Rosa"
              myId="a"
              first={false}
              last
            />
          </ol>
          <TypingBubble visible name="Theo" slot="b" />
        </Sheet>
        <p className="mt-4 text-small text-ink-muted">
          Ticks: clock = sending · one = sent · two = delivered · two gold = read.
        </p>
      </Section>

      <Dialog
        open={dialog}
        onOpenChange={setDialog}
        title="Share from your computer"
        description="Screen sharing works best from the Us web app on a laptop or desktop."
      >
        <Button block onClick={() => setDialog(false)}>
          <Phone className="h-4 w-4" /> Got it
        </Button>
      </Dialog>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={title}>
      <h2 id={title} className="mb-6 border-b border-paper-edge pb-3 font-display text-heading italic text-ink-soft">
        {title}
      </h2>
      {children}
    </section>
  );
}
