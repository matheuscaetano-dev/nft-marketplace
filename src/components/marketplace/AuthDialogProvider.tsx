import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { AuthModal } from './AuthModal';

const AuthDialogContext = createContext<(() => void) | null>(null);

export function AuthDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const openAuth = useCallback(() => setIsOpen(true), []);
  const closeAuth = useCallback(() => setIsOpen(false), []);

  return (
    <AuthDialogContext.Provider value={openAuth}>
      {children}
      {isOpen && <AuthModal onClose={closeAuth} onAuthenticated={closeAuth} />}
    </AuthDialogContext.Provider>
  );
}

export function useAuthDialog() {
  const openAuth = useContext(AuthDialogContext);

  if (!openAuth) {
    throw new Error('useAuthDialog precisa ser usado dentro de AuthDialogProvider.');
  }

  return openAuth;
}
