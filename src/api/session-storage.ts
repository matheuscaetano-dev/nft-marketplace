import type { SessionResponse } from '../contracts/api';

export const SESSION_STORAGE_KEY = 'kurio-marketplace-session-v1';

export interface StoredSession extends SessionResponse {
  status: 'authenticated' | 'expired';
}

export function getStoredSession(): StoredSession | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  const value = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || !('token' in parsed)
      || typeof parsed.token !== 'string' || !('expiresAt' in parsed)
      || typeof parsed.expiresAt !== 'string' || !('user' in parsed)) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return undefined;
    }
    const session = parsed as SessionResponse;
    return {
      ...session,
      status: Date.parse(session.expiresAt) <= Date.now() ? 'expired' : 'authenticated',
    };
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return undefined;
  }
}

export function storeSession(session: SessionResponse): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
    ...session,
    status: Date.parse(session.expiresAt) <= Date.now() ? 'expired' : 'authenticated',
  } satisfies StoredSession));
}

export function clearStoredSession(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function getAccessToken(): string | undefined {
  const session = getStoredSession();
  return session?.status === 'authenticated' ? session.token : undefined;
}

export function getOrCreateVisitorId(): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  const existing = localStorage.getItem('kurio-marketplace-visitor-v1');
  if (existing) return existing;
  const visitorId = crypto.randomUUID();
  localStorage.setItem('kurio-marketplace-visitor-v1', visitorId);
  return visitorId;
}
