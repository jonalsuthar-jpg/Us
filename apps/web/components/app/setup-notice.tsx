import Link from 'next/link';
import { Seal } from '@/components/ui/avatar';
import { Sheet } from '@/components/ui/sheet';

/** Shown instead of the app when Supabase env vars are missing. */
export function SetupNotice() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 px-6 py-16">
      <Seal size={56} />
      <h1 className="font-display text-title text-ink">Almost ready.</h1>
      <Sheet tone="note" accent="gold" pad="md" className="space-y-3 text-ink-soft">
        <p>
          Us needs a Supabase project. Copy <code className="font-mono text-small">apps/web/.env.example</code> to{' '}
          <code className="font-mono text-small">apps/web/.env.local</code>, fill in your project URL and anon key, and
          restart the dev server.
        </p>
        <p>The README walks through creating the project, applying migrations and deploying the Edge Functions.</p>
      </Sheet>
      <Link href="/design" className="text-small text-rose-700 underline underline-offset-4">
        Meanwhile, browse the design system →
      </Link>
    </main>
  );
}
