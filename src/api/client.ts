import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import type { ApiErrorCode, ApiErrorResponse } from '../contracts/api';
import { clearStoredSession, getAccessToken } from './session-storage';

export class ApiError extends Error {
  readonly status?: number;
  readonly code: ApiErrorCode;
  readonly fieldErrors?: Record<string, string[]>;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      status?: number;
      code: ApiErrorCode;
      fieldErrors?: Record<string, string[]>;
      details?: Record<string, unknown>;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.fieldErrors = options.fieldErrors;
    this.details = options.details;
  }
}

const apiErrorCodes: readonly ApiErrorCode[] = [
  'VALIDATION_ERROR',
  'SESSION_INVALID',
  'SESSION_EXPIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'AVAILABILITY_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'ACCOUNT_CONFLICT',
  'QUOTE_STALE',
  'COUPON_INVALID',
  'COUPON_EXPIRED',
  'TRANSIENT_FAILURE',
  'PAYMENT_REJECTED',
];

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (typeof value !== 'object' || value === null || !('code' in value)
    || typeof value.code !== 'string' || !apiErrorCodes.includes(value.code as ApiErrorCode)
    || !('message' in value) || typeof value.message !== 'string') return false;
  if ('fieldErrors' in value && value.fieldErrors !== undefined) {
    if (typeof value.fieldErrors !== 'object' || value.fieldErrors === null) return false;
    if (!Object.values(value.fieldErrors).every((errors) => (
      Array.isArray(errors) && errors.every((error) => typeof error === 'string')
    ))) return false;
  }
  if ('details' in value && value.details !== undefined
    && (typeof value.details !== 'object' || value.details === null)) return false;
  return true;
}

export function normalizeApiError(error: unknown): ApiError {
  if (isApiError(error)) return error;
  if (!axios.isAxiosError<unknown>(error)) {
    return new ApiError(error instanceof Error ? error.message : 'Erro inesperado na requisição.', {
      code: 'TRANSIENT_FAILURE',
      cause: error,
    });
  }

  const response = error.response;
  const data: unknown = response?.data;
  if (isApiErrorResponse(data)) {
    return new ApiError(data.message, {
      status: response?.status,
      code: data.code,
      ...(data.fieldErrors ? { fieldErrors: data.fieldErrors } : {}),
      ...(data.details ? { details: data.details } : {}),
      cause: error,
    });
  }

  return new ApiError(error.message || 'Falha na comunicação com o servidor.', {
    ...(response ? { status: response.status } : {}),
    code: response && response.status >= 400 && response.status < 500
      ? 'VALIDATION_ERROR'
      : 'TRANSIENT_FAILURE',
    cause: error,
  });
}

type UnauthorizedHandler = (requestedUrl: string) => void;
let unauthorizedHandler: UnauthorizedHandler | undefined;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | undefined): void {
  unauthorizedHandler = handler;
}

export function handleUnauthorized(requestedUrl: string): void {
  clearStoredSession();
  unauthorizedHandler?.(requestedUrl);
}

export function getLoginRedirectUrl(requestedUrl: string): string {
  const pathname = requestedUrl.split(/[?#]/, 1)[0];
  const params = new URLSearchParams({ redirect: requestedUrl });
  if (pathname === '/payment' || pathname.startsWith('/payment/')
    || pathname === '/cart' || pathname.startsWith('/cart/')) {
    params.set('context', 'checkout');
  }
  params.set('reason', 'session-expired');
  return `/login?${params.toString()}`;
}

function isAuthenticationSubmission(config: AxiosRequestConfig): boolean {
  return /\/auth\/(login|register)(?:\?|$)/.test(config.url ?? '');
}

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const defaultBaseUrl = typeof window === 'undefined' ? 'http://localhost/api' : '/api';

export const apiClient = axios.create({
  baseURL: configuredBaseUrl || defaultBaseUrl,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (cause: AxiosError<unknown>) => {
    const error = normalizeApiError(cause);
    if (error.status === 401 && !isAuthenticationSubmission(cause.config ?? {})) {
      const requestedUrl = typeof window === 'undefined'
        ? '/'
        : `${window.location.pathname}${window.location.search}${window.location.hash}`;
      handleUnauthorized(requestedUrl);
    }
    return Promise.reject(error);
  },
);

export const api = apiClient;
