import { delay, HttpResponse } from 'msw';
import type { ApiErrorResponse } from '../../contracts/api';
import { sumEth } from '../../lib/money';
import { getDb, mutate, updateNftListing } from '../db';
import type { MockScenarioSeed } from '../db/types';

export const mockScenarioNames = [
  'success',
  'empty',
  'slow',
  'variable-latency',
  'network-error',
  'http-4xx',
  'http-5xx',
  'session-expired',
  'unauthorized',
  'signup-conflict',
  'validation-error',
  'coupon-invalid',
  'coupon-expired',
  'price-changed',
  'sold-out',
  'order-timeout-after-create',
  'order-pending',
  'payment-confirmed',
  'payment-rejected',
] as const;

export type MockScenarioName = typeof mockScenarioNames[number];

interface ScenarioSelection {
  name: MockScenarioName;
  endpoint?: string;
}

const SCENARIO_STORAGE_KEY = 'kurio-marketplace-mock-scenario-v1';

function loadScenarioSelection(): ScenarioSelection | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  const stored = localStorage.getItem(SCENARIO_STORAGE_KEY);
  if (!stored) return undefined;
  try {
    const value: unknown = JSON.parse(stored);
    if (typeof value !== 'object' || value === null || !('name' in value)
      || typeof value.name !== 'string' || !isMockScenarioName(value.name)) {
      localStorage.removeItem(SCENARIO_STORAGE_KEY);
      return undefined;
    }
    const endpoint = 'endpoint' in value && typeof value.endpoint === 'string'
      && value.endpoint.startsWith('/api/')
      ? value.endpoint
      : undefined;
    return { name: value.name, ...(endpoint ? { endpoint } : {}) };
  } catch {
    localStorage.removeItem(SCENARIO_STORAGE_KEY);
    return undefined;
  }
}

let runtimeSelection: ScenarioSelection | undefined = loadScenarioSelection();
const consumedMutations = new Set<string>();
const latencyCounts = new Map<string, number>();
const variableLatencySequence = [640, 45, 330, 90] as const;

export function isMockScenarioName(value: string | undefined): value is MockScenarioName {
  return value !== undefined && mockScenarioNames.some((name) => name === value);
}

export function setMockScenario(name: MockScenarioName, endpoint?: string) {
  const selection = { name, ...(endpoint ? { endpoint } : {}) };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(selection));
  }
  runtimeSelection = selection;
  consumedMutations.clear();
  latencyCounts.clear();
}

export function clearMockScenario() {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(SCENARIO_STORAGE_KEY);
  runtimeSelection = undefined;
  consumedMutations.clear();
  latencyCounts.clear();
}

export function getMockScenarioSelection(): ScenarioSelection | undefined {
  return runtimeSelection ? { ...runtimeSelection } : undefined;
}

export function scenarioSeed(name: MockScenarioName): MockScenarioSeed {
  return name === 'empty' ? 'empty' : 'default';
}

function selectScenario(request: Request, endpoint: string): MockScenarioName {
  if (runtimeSelection && (!runtimeSelection.endpoint || endpoint.includes(runtimeSelection.endpoint))) {
    return runtimeSelection.name;
  }

  const queryName = new URL(request.url).searchParams.get('scenario') ?? undefined;
  if (isMockScenarioName(queryName)) return queryName;

  const envName = import.meta.env.VITE_MOCK_SCENARIO;
  return isMockScenarioName(envName) ? envName : 'success';
}

function errorResponse(
  status: number,
  code: ApiErrorResponse['code'],
  message: string,
): Response {
  const body: ApiErrorResponse = { code, message };
  return HttpResponse.json(body, { status });
}

function consumeOnce(scenario: MockScenarioName, endpoint: string): boolean {
  const key = `${scenario}:${endpoint}`;
  if (consumedMutations.has(key)) return false;
  consumedMutations.add(key);
  return true;
}

async function readOrderNftId(request: Request): Promise<string | undefined> {
  try {
    const body: unknown = await request.clone().json();
    if (typeof body !== 'object' || body === null || !('items' in body) || !Array.isArray(body.items)) {
      return undefined;
    }
    const firstItem: unknown = body.items[0];
    if (typeof firstItem === 'object' && firstItem !== null
      && 'nftId' in firstItem && typeof firstItem.nftId === 'string') {
      return firstItem.nftId;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export async function applyScenarioBeforeHandler(
  request: Request,
  endpoint: string,
): Promise<Response | undefined> {
  const scenario = selectScenario(request, endpoint);
  const method = request.method.toUpperCase();

  if (scenario === 'success' || scenario === 'payment-confirmed' || scenario === 'payment-rejected'
    || scenario === 'order-timeout-after-create') {
    return undefined;
  }

  if (scenario === 'empty' && method === 'GET' && endpoint === '/api/nfts') {
    return HttpResponse.json({ data: [], total: 0, page: 1, limit: 9 });
  }
  if (scenario === 'slow') {
    await delay(1_500);
    return undefined;
  }
  if (scenario === 'variable-latency') {
    const count = latencyCounts.get(endpoint) ?? 0;
    latencyCounts.set(endpoint, count + 1);
    await delay(variableLatencySequence[count % variableLatencySequence.length]);
    return undefined;
  }
  if (scenario === 'network-error') return HttpResponse.error();
  if (scenario === 'http-4xx') return errorResponse(422, 'VALIDATION_ERROR', 'Falha HTTP 4xx simulada.');
  if (scenario === 'http-5xx') return errorResponse(503, 'TRANSIENT_FAILURE', 'Falha HTTP 5xx simulada.');
  if (scenario === 'session-expired') {
    const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (token) {
      mutate((draft) => {
        delete draft.sessions[token];
      });
    }
    return errorResponse(401, 'SESSION_EXPIRED', 'Sua sessão expirou (cenário simulado).');
  }
  if (scenario === 'unauthorized') {
    return errorResponse(401, 'SESSION_INVALID', 'Acesso não autorizado (cenário simulado).');
  }
  if (scenario === 'signup-conflict' && endpoint === '/api/auth/register') {
    return errorResponse(409, 'ACCOUNT_CONFLICT', 'Conflito de cadastro simulado.');
  }
  if (scenario === 'validation-error' && (
    endpoint === '/api/auth/register' || endpoint.startsWith('/api/profile') || endpoint.startsWith('/api/wallets')
  )) {
    return HttpResponse.json({
      code: 'VALIDATION_ERROR',
      message: 'Erro de validação simulado.',
      fieldErrors: { email: ['E-mail de teste inválido.'] },
    } satisfies ApiErrorResponse, { status: 422 });
  }
  if (scenario === 'coupon-invalid' && endpoint === '/api/quotes') {
    return errorResponse(422, 'COUPON_INVALID', 'Cupom inválido (cenário simulado).');
  }
  if (scenario === 'coupon-expired' && endpoint === '/api/quotes') {
    return errorResponse(422, 'COUPON_EXPIRED', 'Cupom expirado (cenário simulado).');
  }
  if ((scenario === 'price-changed' || scenario === 'sold-out') && endpoint === '/api/orders'
    && consumeOnce(scenario, endpoint)) {
    const nftId = await readOrderNftId(request) ?? '1';
    const current = getDb().nfts[nftId];
    const edition = current?.editions[0];
    if (edition) {
      updateNftListing(nftId, scenario === 'price-changed'
        ? { editionId: edition.id, priceEth: sumEth(edition.priceEth, '0.01') }
        : { editionId: edition.id, availableQuantity: 0 });
    }
  }

  return undefined;
}

export function getOrderScenario(request: Request): MockScenarioName {
  return selectScenario(request, '/api/orders');
}

export function consumeOrderTimeout(request: Request): boolean {
  return getOrderScenario(request) === 'order-timeout-after-create'
    && consumeOnce('order-timeout-after-create', '/api/orders');
}

export function isPaymentRejectedScenario(request: Request): boolean {
  return getOrderScenario(request) === 'payment-rejected';
}

export function isPaymentPendingScenario(request: Request): boolean {
  return getOrderScenario(request) === 'order-pending';
}
