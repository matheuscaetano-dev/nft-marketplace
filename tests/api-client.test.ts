import { describe, expect, it } from 'vitest';
import {
  ApiError,
  getLoginRedirectUrl,
  isApiError,
  isApiErrorResponse,
  normalizeApiError,
} from '../src/api/client';
import { retryTransientRequest } from '../src/lib/api';

describe('typed Axios errors', () => {
  it('recognizes and normalizes the shared REST error contract', () => {
    const response = {
      code: 'VALIDATION_ERROR',
      message: 'Revise os campos.',
      fieldErrors: { email: ['Inválido.'] },
    };
    expect(isApiErrorResponse(response)).toBe(true);
    const error = normalizeApiError({
      isAxiosError: true,
      message: 'Request failed',
      response: { status: 422, data: response },
    });
    expect(isApiError(error)).toBe(true);
    expect(error).toMatchObject({
      name: 'ApiError',
      status: 422,
      code: 'VALIDATION_ERROR',
      fieldErrors: { email: ['Inválido.'] },
    });
  });

  it('converts network and malformed error responses into transient failures', () => {
    const network = normalizeApiError(new Error('offline'));
    const malformed = normalizeApiError({
      isAxiosError: true,
      message: 'Request failed',
      response: { status: 502, data: { message: 'missing code' } },
    });
    expect(network).toBeInstanceOf(ApiError);
    expect(network.code).toBe('TRANSIENT_FAILURE');
    expect(network.status).toBeUndefined();
    expect(malformed).toMatchObject({ status: 502, code: 'TRANSIENT_FAILURE' });
    expect(isApiErrorResponse({ code: 'BAD', message: 'x' })).toBe(false);
  });

  it('retries only network, throttling and server errors', () => {
    expect(retryTransientRequest(0, new ApiError('validation', {
      status: 422,
      code: 'VALIDATION_ERROR',
    }))).toBe(false);
    expect(retryTransientRequest(0, new ApiError('unauthorized', {
      status: 401,
      code: 'SESSION_INVALID',
    }))).toBe(false);
    expect(retryTransientRequest(0, new ApiError('throttled', {
      status: 429,
      code: 'TRANSIENT_FAILURE',
    }))).toBe(true);
    expect(retryTransientRequest(1, new ApiError('network', {
      code: 'TRANSIENT_FAILURE',
    }))).toBe(true);
    expect(retryTransientRequest(2, new ApiError('server', {
      status: 503,
      code: 'TRANSIENT_FAILURE',
    }))).toBe(false);
  });

  it('preserves checkout and nested route context in the login URL', () => {
    const location = getLoginRedirectUrl('/payment?step=review#summary');
    expect(new URL(location, 'http://localhost').searchParams.get('redirect'))
      .toBe('/payment?step=review#summary');
    expect(new URL(location, 'http://localhost').searchParams.get('context')).toBe('checkout');
    expect(new URL(getLoginRedirectUrl('/profile'), 'http://localhost').searchParams.get('context'))
      .toBeNull();
  });
});
