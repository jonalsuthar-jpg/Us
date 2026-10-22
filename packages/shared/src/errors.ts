/** Friendly copy for the error codes raised by our Postgres functions. */
const MESSAGES: Record<string, string> = {
  invite_invalid: "That code doesn't match an open invite. Check it with your partner?",
  invite_used: 'That invite has already been used.',
  invite_own: "That's your own invite — send it to your partner instead.",
  already_paired: "You're already paired. Us is for exactly two people.",
  not_paired: 'Pair with your partner first.',
  not_approved: 'Your account is waiting for approval.',
  not_admin: 'Only an admin can do that.',
  protected: 'This account is protected and can’t be changed.',
  not_yourself: 'You can’t do that to your own account.',
  plan_is_default: 'Pick another default plan before deleting this one.',
  unknown_plan: 'That plan no longer exists.',
  not_authenticated: 'Please sign in again.',
  call_not_found: 'That call is no longer available.',
  no_options: 'Add a few options to this list first.',
  ends_after_start: 'The end needs to be after the start.',
  too_many_snaps: 'You have 10 snaps up already. Let one expire, or delete one, first.',
  snap_not_found: 'That snap has expired.',
  'Invalid login credentials': "That email and password don't match.",
  'User already registered': 'An account with that email already exists. Try signing in.',
};

export function friendlyError(error: unknown): string {
  const raw =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : '';
  for (const [key, copy] of Object.entries(MESSAGES)) {
    if (raw.includes(key)) return copy;
  }
  return raw || 'Something went wrong. Please try again.';
}
