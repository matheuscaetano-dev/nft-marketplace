import type { SessionResponse } from '../contracts/api';
import { clearStoredSession, getStoredSession, storeSession } from './session-storage';
import { authApi } from './resources';
import { isApiError } from './client';

export type SessionStatus = 'loading' | 'authenticated' | 'anonymous' | 'expired';

export interface SessionState {
  status: SessionStatus;
  session?: SessionResponse;
  error?: Error;
}

const listeners = new Set<() => void>();
let state: SessionState = { status: 'loading' };
let restorePromise: Promise<SessionState> | undefined;

function publish(nextState: SessionState): void {
  state = nextState;
  listeners.forEach((listener) => listener());
}

export function getSessionState(): SessionState {
  return state;
}

export function subscribeToSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function acceptSession(session: SessionResponse): void {
  storeSession(session);
  publish({ status: 'authenticated', session });
}

export function markAnonymous(error?: Error): void {
  clearStoredSession();
  publish({ status: 'anonymous', ...(error ? { error } : {}) });
}

export function markSessionExpired(error?: Error): void {
  clearStoredSession();
  publish({ status: 'expired', ...(error ? { error } : {}) });
}

export async function restoreSession(): Promise<SessionState> {
  if (state.status !== 'loading') return state;
  if (restorePromise) return restorePromise;
  const stored = getStoredSession();
  if (!stored) {
    publish({ status: 'anonymous' });
    return state;
  }
  if (stored.status === 'expired') {
    markSessionExpired();
    return state;
  }

  restorePromise = authApi.session()
    .then((session) => {
      acceptSession(session);
      return state;
    })
    .catch((error: unknown) => {
      if (isApiError(error) && (error.status === 401 || error.status === 403)) {
        markSessionExpired(error);
      } else {
        publish({
          status: 'anonymous',
          error: error instanceof Error ? error : new Error('Não foi possível recuperar a sessão.'),
        });
      }
      return state;
    })
    .finally(() => {
      restorePromise = undefined;
    });
  return restorePromise;
}

export function resetSessionStoreForTests(): void {
  restorePromise = undefined;
  publish({ status: 'loading' });
}
