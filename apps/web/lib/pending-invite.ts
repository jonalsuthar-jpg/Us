'use client';

import { inviteCodeFrom } from '@us/shared';

/**
 * An invite link's code, kept in this browser while its new owner signs in,
 * signs up or waits for approval, so /pair can still fill it in afterwards.
 */
const KEY = 'us:invite-code';

/** Note the code in a URL or `next=` path (like "/pair?code=ABCD-EFGH"), if it has one. */
export function rememberInvite(pathOrUrl: string | null | undefined) {
  if (!pathOrUrl) return;
  try {
    const code = inviteCodeFrom(new URL(pathOrUrl, location.origin).searchParams.get('code'));
    if (code) localStorage.setItem(KEY, code);
  } catch {
    // not a URL, or no storage: nothing to keep
  }
}

export function pendingInvite(): string {
  try {
    return inviteCodeFrom(localStorage.getItem(KEY));
  } catch {
    return '';
  }
}

export function forgetInvite() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
