import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { SessionContext } from './session-context';
import { getSessionState, restoreSession, subscribeToSession } from './session-store';
import { handleUnauthorized } from './client';
import { useQueryClient } from '@tanstack/react-query';
import { synchronizeRealtimeSession } from './realtime-socket';

export function SessionProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribeToSession, getSessionState, getSessionState);
  const queryClient = useQueryClient();

  useEffect(() => {
    void restoreSession();
  }, []);

  useEffect(() => {
    synchronizeRealtimeSession(state, queryClient);
  }, [queryClient, state]);

  useEffect(() => () => {
    synchronizeRealtimeSession({ status: 'anonymous' }, queryClient);
  }, [queryClient]);

  useEffect(() => {
    if (state.status !== 'authenticated' || !state.session) return undefined;
    const remainingMs = Date.parse(state.session.expiresAt) - Date.now();
    if (remainingMs <= 0) {
      const requestedUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      handleUnauthorized(requestedUrl);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      const requestedUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      handleUnauthorized(requestedUrl);
    }, Math.min(remainingMs, 2_147_000_000));
    return () => window.clearTimeout(timer);
  }, [state]);

  const value = useMemo(() => ({ ready: state.status !== 'loading' }), [state.status]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
