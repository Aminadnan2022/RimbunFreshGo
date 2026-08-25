import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { hasCurrentPrivacyConsent } from '../lib/privacyConsent';

export default function AuthRedirectPage() {
  const { loading, isAdmin, isSupplier, isRider, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const stateReturnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const queryReturnTo = new URLSearchParams(location.search).get('returnTo');
  const returnTo = [stateReturnTo, queryReturnTo].find((target): target is string =>
    typeof target === 'string' && target.startsWith('/') && !target.startsWith('//'),
  );

  useEffect(() => {
    if (loading || role === null) return;
    if (isAdmin) {
      navigate('/admin/products', { replace: true });
    } else if (isSupplier) {
      navigate('/supplier', { replace: true });
    } else if (isRider) {
      navigate('/delivery', { replace: true });
    } else {
      void hasCurrentPrivacyConsent()
        .then((complete) => {
          if (complete) navigate(returnTo ?? '/', { replace: true });
          else navigate('/privacy-consent', { replace: true, state: { returnTo: returnTo ?? '/' } });
        })
        .catch(() => navigate('/privacy-consent', { replace: true, state: { returnTo: returnTo ?? '/' } }));
    }
  }, [loading, role, isAdmin, isSupplier, isRider, navigate, returnTo]);

  return (
    <main className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="animate-spin text-forest-500" size={32} />
    </main>
  );
}
