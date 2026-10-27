import type { ClaimStatus, ContactPreference, ItemStatus } from './types';

export const CATEGORY_LABELS: Record<string, string> = {
  electronics: 'Electronics',
  keys: 'Keys',
  wallets_ids: 'Wallets & ID cards',
  bags: 'Bags',
  clothing: 'Clothing',
  books_notes: 'Books & notes',
  bottles: 'Bottles & lunchboxes',
  accessories: 'Accessories',
  sports: 'Sports gear',
  other: 'Something else',
};

export const CONTACT_LABELS: Record<ContactPreference, { title: string; detail: string }> = {
  in_app: {
    title: 'Messages here only',
    detail: 'People explain in their claim why the item is theirs. Your email stays private.',
  },
  email_on_accept: {
    title: 'Share my email after I accept',
    detail: 'Only the person whose claim you accept sees your university email.',
  },
  security_desk: {
    title: 'Left at the security desk',
    detail: 'The item is waiting at campus security. Claimants collect it there.',
  },
};

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  open: 'Waiting for owner',
  claimed: 'Claim accepted',
  resolved: 'Returned',
};

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  pending: 'Waiting for reply',
  accepted: 'Accepted',
  rejected: 'Declined',
  cancelled: 'Withdrawn',
};

export const AUTH_ERRORS: Record<string, string> = {
  not_configured: 'Google sign-in is not set up on this server yet. Browsing still works.',
  cancelled: 'Sign-in was cancelled at Google. Nothing was changed.',
  expired: 'That sign-in attempt timed out. Start again from the Sign in button.',
  state_mismatch: 'That sign-in link was not started from this browser, so it was blocked. Try again.',
  missing_code: 'Google did not return a sign-in code. Try again.',
  google_rejected: 'Google could not confirm your sign-in. Try again in a minute.',
  email_unverified: 'Your Google account email is not verified, so it cannot be used here.',
  domain_not_allowed: 'Use your university Google account to sign in. Other accounts are not accepted.',
};

export function formatDate(value: string | null | undefined): string {
  if (!value) return 'Date not given';
  const date = value.length === 10 ? new Date(`${value}T12:00:00`) : new Date(value);
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function timeAgo(value: string): string {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month'], [Infinity, 'year'],
  ];
  let amount = seconds;
  for (const [size, unit] of units) {
    if (amount < size) return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(-Math.round(amount), unit);
    amount /= size;
  }
  return '';
}
