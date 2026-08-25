import { supabase } from './supabase';

export const PRIVACY_POLICY_VERSION = '2026-08-25';

export async function hasCurrentPrivacyConsent(): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_current_customer_privacy_consent');
  if (error) throw error;
  return data === true;
}
