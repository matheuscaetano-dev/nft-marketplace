import { useCallback, useContext, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LoginRequest, RegisterRequest, RegisterResponse, SessionResponse } from '../contracts/api';
import { clearQueryClient } from './query-client';
import { authApi } from './resources';
import {
  acceptSession,
  getSessionState,
  markAnonymous,
  restoreSession,
  subscribeToSession,
} from './session-store';
import { clearStoredSession } from './session-storage';
import { SessionContext } from './session-context';
import { getOrCreateVisitorId } from './session-storage';

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession precisa ser usado dentro de SessionProvider.');
  const state = useSyncExternalStore(subscribeToSession, getSessionState, getSessionState);
  return {
    ...state,
    isLoading: state.status === 'loading',
    refresh: restoreSession,
  };
}

function useAcceptAuthenticatedSession() {
  const queryClient = useQueryClient();
  return useCallback(async (session: SessionResponse) => {
    const previousUserId = getSessionState().session?.user.id;
    if (previousUserId && previousUserId !== session.user.id) {
      await clearQueryClient(queryClient);
    }
    acceptSession(session);
    return session;
  }, [queryClient]);
}

export function useLogin() {
  const accept = useAcceptAuthenticatedSession();
  const login = useCallback(async (credentials: LoginRequest) => {
    const visitorId = credentials.visitorId ?? getOrCreateVisitorId();
    const session = await authApi.login({
      ...credentials,
      ...(visitorId ? { visitorId } : {}),
    });
    return accept(session);
  }, [accept]);
  return login;
}

export function useRegister() {
  const accept = useAcceptAuthenticatedSession();
  const register = useCallback(async (request: RegisterRequest): Promise<RegisterResponse> => {
    const visitorId = request.visitorId ?? getOrCreateVisitorId();
    const response = await authApi.register({
      ...request,
      ...(visitorId ? { visitorId } : {}),
    });
    await accept(response.session);
    return response;
  }, [accept]);
  return register;
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clearStoredSession();
      markAnonymous();
      await clearQueryClient(queryClient);
    }
  }, [queryClient]);
}
