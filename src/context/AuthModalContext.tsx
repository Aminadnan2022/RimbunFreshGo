import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface AuthModalState {
  open: boolean;
  returnTo: string | null;
}

interface AuthModalContextValue {
  state: AuthModalState;
  openSignIn: (returnTo?: string) => void;
  closeSignIn: () => void;
}

const AuthModalContext = createContext<AuthModalContextValue>({
  state: { open: false, returnTo: null },
  openSignIn: () => {},
  closeSignIn: () => {},
});

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthModalState>({ open: false, returnTo: null });

  const openSignIn = useCallback((returnTo?: string) => {
    setState({ open: true, returnTo: returnTo ?? null });
  }, []);

  const closeSignIn = useCallback(() => {
    setState({ open: false, returnTo: null });
  }, []);

  return (
    <AuthModalContext.Provider value={{ state, openSignIn, closeSignIn }}>
      {children}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  return useContext(AuthModalContext);
}
