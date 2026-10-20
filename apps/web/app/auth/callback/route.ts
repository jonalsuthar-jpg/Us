import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabase } from '@/lib/supabase/server';

/** Email confirmation + magic-link landing: swap the code for a session. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next') ?? '/home';
  // Only allow same-site relative redirects.
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/home';

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL('/sign-in?error=link', url.origin));
}
