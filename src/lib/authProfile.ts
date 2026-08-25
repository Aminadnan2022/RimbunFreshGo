import type { User } from '@supabase/supabase-js';

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

/** Keep provider-specific name fallbacks consistent across customer screens. */
export function getUserDisplayName(user: User | null | undefined): string {
  if (!user) return '';

  const metadata = user.user_metadata ?? {};
  const identityData = user.identities?.find((identity) => identity.provider === 'google')?.identity_data ?? {};
  const candidates = [
    metadata.full_name,
    metadata.name,
    metadata.preferred_username,
    metadata.given_name,
    identityData.full_name,
    identityData.name,
    identityData.given_name,
    user.email,
  ];

  return candidates.map(text).find(Boolean) ?? '';
}

export function isUnverifiedEmailError(error: { code?: string; message?: string }): boolean {
  return error.code === 'email_not_confirmed' || /email not confirmed|email.*confirm/i.test(error.message ?? '');
}
