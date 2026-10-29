import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const APP_ROUTES = ['/home', '/talk', '/connect', '/plan', '/memory', '/settings', '/pair', '/waiting', '/admin'];
const AUTH_ROUTES = ['/sign-in', '/sign-up'];

/**
 * Refreshes the Supabase session cookie on every request and keeps signed-out
 * visitors out of the app (and signed-in people out of the auth screens).
 * Approval and pairing are checked client-side in the (app) layout; /admin
 * checks for an admin itself.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const inApp = APP_ROUTES.some((r) => path === r || path.startsWith(`${r}/`));
  const inAuth = AUTH_ROUTES.includes(path);

  if (!user && inApp) {
    const to = request.nextUrl.clone();
    to.pathname = '/sign-in';
    to.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(to);
  }
  if (user && inAuth) {
    const to = request.nextUrl.clone();
    to.pathname = '/home';
    to.search = '';
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|sounds/|OneSignalSDK|design|dev/).*)'],
};
