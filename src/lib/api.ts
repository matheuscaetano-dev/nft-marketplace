import { isApiError, normalizeApiError } from '../api/client';

export { apiClient as api } from '../api/client';

export function retryTransientRequest(failureCount: number, error: unknown): boolean {
  if (isApiError(error)) {
    return (error.status === undefined || error.status === 429 || error.status >= 500)
      && failureCount < 2;
  }
  return normalizeApiError(error).status === undefined && failureCount < 2;
}