import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { delay, http, HttpResponse } from 'msw';
import type { LoginRequest, OrderCreateRequest, OrderResponse, QuoteRequest, QuoteResponse } from '../src/contracts/api';
import { getDb, mutate, resetDb } from '../src/mocks/db';
import { handlers } from '../src/mocks/handlers';
import { clearMockScenario, setMockScenario } from '../src/mocks/scenarios';
import { createFavoriteMutationOptions, createOrderAttempt, createOrderMutationOptions } from '../src/api/hooks';
import { queryKeys } from '../src/api/keys';
import { authApi, quoteApi } from '../src/api/resources';
import { clearStoredSession, storeSession } from '../src/api/session-storage';
import { apiClient, setUnauthorizedHandler } from '../src/api/client';
import { acceptSession, resetSessionStoreForTests } from '../src/api/session-store';

const server = setupServer(...handlers);
const api = 'http://localhost';
const adaCredentials: LoginRequest = { email: 'ada@kurio.test', password: 'AdaDemo123!' };
const brunoCredentials: LoginRequest = { email: 'bruno@kurio.test', password: 'BrunoDemo123!' };
const line = { nftId: '1', editionId: 'default', quantity: 2 };

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

async function login(credentials: LoginRequest = adaCredentials): Promise<string> {
  const response = await fetch(`${api}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  expect(response.status).toBe(200);
  const result: unknown = await response.json();
  if (typeof result !== 'object' || result === null || !('token' in result)
    || typeof result.token !== 'string') {
    throw new Error('Login did not return a session token.');
  }
  return result.token;
}

async function createQuote(token: string, request: QuoteRequest = { items: [line] }): Promise<QuoteResponse> {
  const response = await fetch(`${api}/api/quotes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  expect(response.status).toBe(200);
  return await response.json() as QuoteResponse;
}

async function submitOrder(
  token: string,
  quote: QuoteResponse,
  idempotencyKey = 'test-order-key',
  requestLine = line,
): Promise<Response> {
  const order: OrderCreateRequest = {
    quoteId: quote.quoteId,
    items: [requestLine],
    walletId: 'wallet-ada-primary',
    network: 'Ethereum',
  };
  return fetch(`${api}/api/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(order),
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => resetDb());
afterEach(() => {
  server.resetHandlers();
  clearMockScenario();
  resetDb();
});
afterAll(() => server.close());

describe('MSW REST database', () => {
  it('authenticates fictitious users and isolates private data', async () => {
    const adaToken = await login();
    const brunoToken = await login(brunoCredentials);
    const adaFavorites = await fetch(`${api}/api/favorites`, {
      headers: { Authorization: `Bearer ${adaToken}` },
    });
    const brunoFavorites = await fetch(`${api}/api/favorites`, {
      headers: { Authorization: `Bearer ${brunoToken}` },
    });

    expect(await adaFavorites.json()).toEqual({ nftIds: ['7'] });
    expect(await brunoFavorites.json()).toEqual({ nftIds: ['2', '8'] });
  });

  it('expires sessions and protects authenticated endpoints', async () => {
    const token = await login();
    const expireResponse = await fetch(`${api}/api/auth/expire`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(expireResponse.status).toBe(200);
    const favorites = await fetch(`${api}/api/favorites`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(favorites.status).toBe(401);
  });

  it('enforces edition stock and calculates quotes with decimal precision', async () => {
    const token = await login();
    const tooMany = await fetch(`${api}/api/cart/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...line, quantity: 11 }),
    });
    expect(tooMany.status).toBe(409);

    const quote = await createQuote(token);
    expect(quote.subtotalEth).toBe('2.38');
    expect(quote.networkFeeEth).toBe('0.016');
    expect(quote.totalEth).toBe('2.396');
  });

  it('recovers idempotent orders and rejects reuse with different contents', async () => {
    const token = await login();
    const quote = await createQuote(token);
    const first = await submitOrder(token, quote);
    const created: OrderResponse = await first.json();
    const repeated = await submitOrder(token, quote);
    const recovered: OrderResponse = await repeated.json();
    expect(first.status).toBe(201);
    expect(repeated.status).toBe(200);
    expect(recovered.id).toBe(created.id);
    expect(recovered.receipt).toEqual(created.receipt);

    const conflicting = await submitOrder(token, quote, 'test-order-key', { ...line, quantity: 1 });
    expect(conflicting.status).toBe(409);
  });

  it('restores a deterministic complete seed and supports the empty catalog seed', async () => {
    const first = resetDb();
    const second = resetDb();
    expect(second).toEqual(first);
    expect(Object.keys(getDb().users)).toHaveLength(2);
    resetDb('empty');
    const response = await fetch(`${api}/api/nfts`);
    const payload: unknown = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ data: [], total: 0 });
  });

  it('restores persisted state from localStorage after a module reload', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    try {
      resetDb();
      mutate((draft) => {
        draft.favorites['user-ada'].push('1');
      });
      await vi.resetModules();
      const reloadedDatabase = await import('../src/mocks/db');
      expect(reloadedDatabase.getDb().favorites['user-ada']).toEqual(['7', '1']);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'localStorage');
      }
      await vi.resetModules();
    }
  });
});

describe('configurable MSW scenarios', () => {
  it.each([
    ['network-error', 'network'],
    ['http-4xx', '4xx'],
    ['http-5xx', '5xx'],
  ] as const)('simulates %s at the configured endpoint', async (scenario, expected) => {
    setMockScenario(scenario, '/api/nfts');
    try {
      const response = await fetch(`${api}/api/nfts`);
      if (expected === 'network') {
        throw new Error('Expected fetch to reject for the simulated network error.');
      }
      expect(response.status).toBe(expected === '4xx' ? 422 : 503);
    } catch (error) {
      if (expected !== 'network') throw error;
      expect(error).toBeInstanceOf(TypeError);
    }
  });

  describe('TanStack mutation behavior', () => {
    it('clears the stored session and reports the current URL after a 401', async () => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: new MemoryStorage(),
      });
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: { location: { pathname: '/payment', search: '?step=review', hash: '#summary' } },
      });
      const requestedUrls: string[] = [];
      setUnauthorizedHandler((url) => requestedUrls.push(url));
      try {
        storeSession({
          user: { id: 'user-ada', email: 'ada@kurio.test', displayName: 'Ada', username: 'ada' },
          token: 'expired-token',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        });
        await expect(apiClient.get('/favorites')).rejects.toMatchObject({
          status: 401,
          code: 'SESSION_INVALID',
        });
        expect(requestedUrls).toEqual(['/payment?step=review#summary']);
        expect(localStorage.getItem('kurio-marketplace-session-v1')).toBeNull();
      } finally {
        setUnauthorizedHandler(undefined);
        if (originalDescriptor) Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
        else Reflect.deleteProperty(globalThis, 'localStorage');
        if (originalWindowDescriptor) Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
        else Reflect.deleteProperty(globalThis, 'window');
      }
    });

    it('rolls back an optimistic favorite when the REST mutation fails', async () => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: new MemoryStorage(),
      });
      const queryClient = new QueryClient();
      try {
        const session = await authApi.login(adaCredentials);
        acceptSession(session);
        const queryKey = queryKeys.favorites(session.user.id);
        queryClient.setQueryData(queryKey, { nftIds: ['7'] });
        server.use(http.put('*/api/favorites/:nftId', async () => {
          await delay(100);
          return HttpResponse.json({
            code: 'TRANSIENT_FAILURE',
            message: 'Falha de teste.',
          }, { status: 503 });
        }));
        const observer = new MutationObserver(
          queryClient,
          createFavoriteMutationOptions(queryClient, session.user.id),
        );
        const result = observer.mutate({ action: 'add', nftId: '1' }).catch((error: unknown) => error);
        await vi.waitFor(() => {
          expect(queryClient.getQueryData(queryKey)).toEqual({ nftIds: ['7', '1'] });
        });
        expect(await result).toMatchObject({ status: 503, code: 'TRANSIENT_FAILURE' });
        expect(queryClient.getQueryData(queryKey)).toEqual({ nftIds: ['7'] });

        const emptyKey = queryKeys.favorites(session.user.id);
        queryClient.removeQueries({ queryKey: emptyKey, exact: true });
        const withoutSnapshot = new MutationObserver(
          queryClient,
          createFavoriteMutationOptions(queryClient, session.user.id),
        );
        const failedWithoutSnapshot = withoutSnapshot
          .mutate({ action: 'add', nftId: '2' })
          .catch((error: unknown) => error);
        await vi.waitFor(() => {
          expect(queryClient.getQueryData(emptyKey)).toEqual({ nftIds: ['2'] });
        });
        await failedWithoutSnapshot;
        expect(queryClient.getQueryData(emptyKey)).toBeUndefined();
      } finally {
        queryClient.clear();
        clearStoredSession();
        resetSessionStoreForTests();
        if (originalDescriptor) Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
        else Reflect.deleteProperty(globalThis, 'localStorage');
      }
    });

    it('reuses an order attempt idempotency key after a timeout', async () => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: new MemoryStorage(),
      });
      const queryClient = new QueryClient();
      try {
        const session = await authApi.login(adaCredentials);
        acceptSession(session);
        const quote = await quoteApi.create({ items: [line] });
        const attempt = createOrderAttempt({
          quoteId: quote.quoteId,
          items: [line],
          walletId: 'wallet-ada-primary',
          network: 'Ethereum',
        });
        setMockScenario('order-timeout-after-create', '/api/orders');
        const observer = new MutationObserver(
          queryClient,
          createOrderMutationOptions(queryClient, session.user.id),
        );
        const firstResult = observer.mutate(attempt).catch((error: unknown) => error);
        expect(await firstResult).toMatchObject({ code: 'TRANSIENT_FAILURE' });
        const recovered = await observer.mutate(attempt);
        expect(recovered.status).toBe('confirmed');
        expect(recovered.receipt?.orderId).toBe(recovered.id);
        expect(attempt.idempotencyKey).toMatch(/^[\da-f-]{36}$/i);
      } finally {
        queryClient.clear();
        clearStoredSession();
        resetSessionStoreForTests();
        if (originalDescriptor) Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
        else Reflect.deleteProperty(globalThis, 'localStorage');
      }
    });
  });

  it('applies deterministic empty, latency, and validation scenarios', async () => {
    setMockScenario('empty', '/api/nfts');
    const empty = await fetch(`${api}/api/nfts`);
    const emptyBody: unknown = await empty.json();
    expect(emptyBody).toMatchObject({ data: [], total: 0 });

    setMockScenario('slow', '/api/nfts');
    const slowStartedAt = Date.now();
    await fetch(`${api}/api/nfts`);
    expect(Date.now() - slowStartedAt).toBeGreaterThanOrEqual(1_400);

    setMockScenario('validation-error', '/api/auth/register');
    const registration = await fetch(`${api}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@kurio.test' }),
    });
    expect(registration.status).toBe(422);
  });

  it('returns out-of-order responses for the fixed variable-latency sequence', async () => {
    setMockScenario('variable-latency', '/api/nfts');
    const completed: string[] = [];
    await Promise.all([
      fetch(`${api}/api/nfts?request=first`).then(() => completed.push('first')),
      fetch(`${api}/api/nfts?request=second`).then(() => completed.push('second')),
    ]);
    expect(completed).toEqual(['second', 'first']);
  });

  it('exercises unauthorized, signup conflict, and coupon error scenarios', async () => {
    setMockScenario('unauthorized', '/api/favorites');
    const unauthorized = await fetch(`${api}/api/favorites`);
    expect(unauthorized.status).toBe(401);

    setMockScenario('signup-conflict', '/api/auth/register');
    const conflict = await fetch(`${api}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new@kurio.test',
        password: 'TestPass123!',
        displayName: 'New Collector',
        username: 'new-collector',
      }),
    });
    expect(conflict.status).toBe(409);

    const token = await login();
    setMockScenario('coupon-invalid', '/api/quotes');
    const invalidCoupon = await fetch(`${api}/api/quotes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [line], couponCode: 'UNKNOWN' }),
    });
    expect(invalidCoupon.status).toBe(422);
    expect((await invalidCoupon.json()).code).toBe('COUPON_INVALID');

    setMockScenario('coupon-expired', '/api/quotes');
    const expiredCoupon = await fetch(`${api}/api/quotes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [line], couponCode: 'EXPIRED' }),
    });
    expect(expiredCoupon.status).toBe(422);
    expect((await expiredCoupon.json()).code).toBe('COUPON_EXPIRED');
  });

  it('invalidates sessions for the expired-session scenario', async () => {
    const token = await login();
    setMockScenario('session-expired', '/api/favorites');
    const response = await fetch(`${api}/api/favorites`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(401);
    clearMockScenario();
    const subsequent = await fetch(`${api}/api/favorites`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(subsequent.status).toBe(401);
  });

  it('simulates changed price, sold out stock, and payment rejection', async () => {
    const token = await login();
    const quote = await createQuote(token);
    setMockScenario('price-changed', '/api/orders');
    const staleQuote = await submitOrder(token, quote, 'price-key');
    expect(staleQuote.status).toBe(409);
    expect((await staleQuote.json()).code).toBe('QUOTE_STALE');

    resetDb();
    const freshToken = await login();
    const freshQuote = await createQuote(freshToken);
    setMockScenario('sold-out', '/api/orders');
    const soldOut = await submitOrder(freshToken, freshQuote, 'sold-out-key');
    expect(soldOut.status).toBe(409);
    expect((await soldOut.json()).code).toBe('AVAILABILITY_CONFLICT');

    resetDb();
    const rejectedToken = await login();
    const rejectedQuote = await createQuote(rejectedToken);
    setMockScenario('payment-rejected', '/api/orders');
    const rejected = await submitOrder(rejectedToken, rejectedQuote, 'rejected-key');
    const order: OrderResponse = await rejected.json();
    expect(order.status).toBe('rejected');
    expect(order.receipt).toBeUndefined();
    expect(getDb().carts['user-ada'].items).toEqual([]);
  });

  it('recovers the created order after a simulated timeout using the same key', async () => {
    const token = await login();
    const quote = await createQuote(token);
    setMockScenario('order-timeout-after-create', '/api/orders');
    await expect(submitOrder(token, quote, 'timeout-key')).rejects.toThrow();

    const recovered = await submitOrder(token, quote, 'timeout-key');
    const order: OrderResponse = await recovered.json();
    expect(recovered.status).toBe(200);
    expect(order.status).toBe('confirmed');
    expect(order.receipt?.orderId).toBe(order.id);
  });

  it('confirms a payment in the explicit payment-confirmed scenario', async () => {
    const token = await login();
    const quote = await createQuote(token);
    setMockScenario('payment-confirmed', '/api/orders');
    const response = await submitOrder(token, quote, 'confirmed-key');
    const order: OrderResponse = await response.json();
    expect(response.status).toBe(201);
    expect(order.status).toBe('confirmed');
    expect(order.receipt?.transactionReference).toMatch(/^0xSIM/);
  });
});
