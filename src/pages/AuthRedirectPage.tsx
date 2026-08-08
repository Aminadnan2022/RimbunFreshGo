import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AuthRedirectPage() {
  const { loading, isAdmin, isSupplier, isRider, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;

  useEffect(() => {
    if (loading || role === null) return;
    if (isAdmin) {
      navigate('/admin/products', { replace: true });
    } else if (isSupplier) {
      navigate('/supplier', { replace: true });
    } else if (isRider) {
      navigate('/delivery', { replace: true });
    } else {
      navigate(returnTo ?? '/', { replace: true });
    }
  }, [loading, role, isAdmin, isSupplier, isRider, navigate, returnTo]);

  return (
    <main className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="animate-spin text-forest-500" size={32} />
    </main>
  );
}
