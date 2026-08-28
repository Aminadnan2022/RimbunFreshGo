import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { signOutWithRecovery } from '../lib/authSignOut';
import { clearSupabaseAuthStorage, supabase } from '../lib/supabase';

type UserRole = 'admin' | 'supplier' | 'delivery_rider' | 'customer' | null;

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isSupplier: boolean;
  isRider: boolean;
  role: UserRole;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  isSupplier: false,
  isRider: false,
  role: null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>(null);

  const checkRole = async (userId: string | undefined) => {
    if (!userId) {
      setRole(null);
      return;
    }
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (data?.role === 'admin' || data?.role === 'supplier' || data?.role === 'delivery_rider') {
      setRole(data.role as UserRole);
    } else {
      setRole('customer');
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      checkRole(data.session?.user?.id).then(() => setLoading(false));
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        setSession(newSession);
        await checkRole(newSession?.user?.id);
        setLoading(false);
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const outcome = await signOutWithRecovery(supabase.auth, clearSupabaseAuthStorage);

    // auth-js emits SIGNED_OUT for its normal paths. Its stale-session
    // fallback cannot emit that internal event, so clear React's auth and role
    // state directly to prevent any protected UI from remaining visible.
    if (outcome === 'recovered-stale-session') {
      setSession(null);
      setRole(null);
      setLoading(false);
    }
  };

  const isAdmin = role === 'admin';
  const isSupplier = role === 'supplier';
  const isRider = role === 'delivery_rider';

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, loading, isAdmin, isSupplier, isRider, role, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
