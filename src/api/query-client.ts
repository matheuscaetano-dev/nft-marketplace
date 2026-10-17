import { QueryClient } from '@tanstack/react-query';
import { retryTransientRequest } from '../lib/api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: retryTransientRequest,
      retryDelay: (failureCount) => Math.min(1_000 * 2 ** failureCount, 30_000),
    },
    mutations: {
      retry: false,
    },
  },
});

export async function clearQueryClient(client: QueryClient = queryClient): Promise<void> {
  await client.cancelQueries();
  client.clear();
}
