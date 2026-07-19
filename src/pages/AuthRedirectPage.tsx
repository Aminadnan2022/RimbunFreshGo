import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AuthRedirectPage() {
  const { loading, isAdmin, isSupplier } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;

  useEffect(() => {
    if (loading) return;
    if (isAdmin) {
      navigate('/admin/products', { replace: true });
    } else if (isSupplier) {
      navigate('/supplier', { replace: true });
    } else {
      navigate(returnTo ?? '/profile', { replace: true });
    }
  }, [loading, isAdmin, isSupplier, navigate, returnTo]);

  return (
    <main className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="animate-spin text-forest-500" size={32} />
    </main>
  );
}
