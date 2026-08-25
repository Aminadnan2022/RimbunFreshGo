import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { hasCurrentPrivacyConsent, PRIVACY_POLICY_VERSION } from '../lib/privacyConsent';
import { supabase } from '../lib/supabase';

function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

export default function PrivacyConsentPage() {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = safeReturnTo((location.state as { returnTo?: unknown } | null)?.returnTo);
  const [accepted, setAccepted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void hasCurrentPrivacyConsent()
      .then((complete) => {
        if (!cancelled && complete) navigate(returnTo, { replace: true });
      })
      .catch(() => {
        if (!cancelled) setError('We could not check your account details. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => { cancelled = true; };
  }, [user, navigate, returnTo]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accepted) return;
    setError(null);
    setSaving(true);
    const { error: consentError } = await supabase.rpc('record_customer_privacy_consents', {
      p_privacy_notice_accepted: true,
      p_marketing_opt_in: false,
      p_policy_version: PRIVACY_POLICY_VERSION,
      p_source: 'signup',
    });
    if (consentError) {
      setSaving(false);
      setError('We could not save your acceptance. Please try again.');
      return;
    }

    await supabase.auth.updateUser({ data: { freshgo_privacy_policy_version: PRIVACY_POLICY_VERSION } });
    navigate(returnTo, { replace: true });
  };

  if (authLoading) return <main className="min-h-[50vh] flex items-center justify-center"><Loader2 className="animate-spin text-forest-500" size={32} /></main>;
  if (!user) return <Navigate to="/" replace />;

  return (
    <main className="max-w-md mx-auto px-4 sm:px-6 py-14">
      <section className="bg-white rounded-3xl border border-cream-200 shadow-soft p-7 sm:p-8">
        <div className="w-11 h-11 rounded-2xl bg-forest-100 text-forest-700 flex items-center justify-center mb-5"><CheckCircle2 size={23} /></div>
        <h1 className="font-display font-bold text-forest-900 text-2xl">One more step</h1>
        <p className="text-gray-600 mt-2">Please review and accept our Privacy Notice to finish setting up your FreshGo account.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <label className="flex items-start gap-3 rounded-xl border border-cream-200 bg-cream-50 p-4 text-sm text-gray-700">
            <input type="checkbox" required checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5 h-4 w-4 accent-forest-700" />
            <span>I have read and understood the <Link to="/privacy" className="font-semibold text-forest-700 underline underline-offset-2">Privacy Notice</Link> and agree that FreshGo may process my personal data to create and manage my account.</span>
          </label>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-2.5">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={!accepted || saving || checking}>
            {saving ? 'Saving…' : 'Accept and continue'}
          </button>
        </form>
      </section>
    </main>
  );
}
