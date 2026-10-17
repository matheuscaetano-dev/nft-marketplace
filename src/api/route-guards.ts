import { redirect } from '@tanstack/react-router';
import { getSessionState, restoreSession } from './session-store';

export async function requireAuthenticatedRoute(context: 'checkout' | 'account' | 'order') {
  await restoreSession();
  if (getSessionState().status === 'authenticated') return;

  const pathname = typeof window === 'undefined' ? '/' : window.location.pathname;
  const search = typeof window === 'undefined' ? '' : window.location.search;
  const params = new URLSearchParams({ redirect: `${pathname}${search}` });
  if (context === 'checkout') params.set('context', context);
  throw redirect({ href: `/login?${params.toString()}` });
}
