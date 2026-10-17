import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'

import { routeTree } from './routeTree.gen' 
import { queryClient } from './api/query-client'
import { SessionProvider } from './api/session-provider'
import { getLoginRedirectUrl, setUnauthorizedHandler } from './api/client'
import { markSessionExpired } from './api/session-store'

const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
})

let authRedirecting = false
setUnauthorizedHandler((requestedUrl) => {
  markSessionExpired(new Error('Sua sessão expirou. Faça login novamente para continuar.'));
  if (authRedirecting || window.location.pathname === '/login' || window.location.pathname === '/register') return;
  authRedirecting = true
  window.location.replace(getLoginRedirectUrl(requestedUrl));
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

async function enableMocking() {
  const mocksEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_MOCKS === 'true'
  if (!mocksEnabled) {
    return
  }
  const { worker } = await import('./mocks/browser')
  return worker.start({ onUnhandledRequest: 'bypass' })
}

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RouterProvider router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
})