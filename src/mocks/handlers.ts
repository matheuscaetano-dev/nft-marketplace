import { http, HttpResponse } from 'msw';
import { compareEth, formatEth, parseEth } from '../lib/money';
import type {
  ExpireSessionResponse,
  LoginRequest,
  LogoutResponse,
  MarketplaceEvent,
  RegisterRequest,
  RegisterResponse,
  SessionResponse,
} from '../contracts/api';
import type { NFT, PaginatedResponse } from '../types';
import type { MockNftRecord } from './db/types';
import { getDb, mutate, resetDb, updateNftListing } from './db';
import {
  accountSummary,
  apiError,
  createSession,
  getUserByEmail,
  hashPassword,
  invalidateSession,
  isAuthFailure,
  newPasswordSalt,
  readJson,
  registerUser,
  requireAuth,
  validateCredentials,
  verifyPassword,
} from './auth';
import { mergeVisitorCart, resourceHandlers, resolvePendingOrder } from './resourceHandlers';
import { publishMarketplaceEvent } from './eventBus';
import { disconnectMockSockets, mockSocketConnectionCount } from './socket-io';
import {
  applyScenarioBeforeHandler,
  clearMockScenario,
  getMockScenarioSelection,
  isMockScenarioName,
  scenarioSeed,
  setMockScenario,
} from './scenarios';

function asNft(record: MockNftRecord): NFT {
  return record;
}

function readPriceCents(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function toEthFromCents(cents: number): string {
  return formatEth(parseEth(String(cents)).dividedBy(100), 2);
}

function parseInjectedEvent(value: unknown): MarketplaceEvent | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const event = value as Record<string, unknown>;
  if (typeof event.eventId !== 'string' || !Number.isSafeInteger(event.version)
    || typeof event.resource !== 'object' || event.resource === null || Array.isArray(event.resource)) {
    return undefined;
  }
  const resource = event.resource as Record<string, unknown>;
  if (event.type === 'nft.updated' && typeof resource.nftId === 'string') {
    if ((resource.priceEth !== undefined && typeof resource.priceEth !== 'string')
      || (resource.availableQuantity !== undefined
        && (!Number.isSafeInteger(resource.availableQuantity) || Number(resource.availableQuantity) < 0))
      || (resource.editionAvailableQuantity !== undefined
        && (!Number.isSafeInteger(resource.editionAvailableQuantity)
          || Number(resource.editionAvailableQuantity) < 0))
      || (resource.editionId !== undefined && typeof resource.editionId !== 'string')) return undefined;
    return {
      eventId: event.eventId,
      type: 'nft.updated',
      version: Number(event.version),
      resource: {
        nftId: resource.nftId,
        ...(typeof resource.editionId === 'string' ? { editionId: resource.editionId } : {}),
        ...(typeof resource.priceEth === 'string' ? { priceEth: resource.priceEth } : {}),
        ...(typeof resource.availableQuantity === 'number'
          ? { availableQuantity: resource.availableQuantity } : {}),
        ...(typeof resource.editionAvailableQuantity === 'number'
          ? { editionAvailableQuantity: resource.editionAvailableQuantity } : {}),
      },
    };
  }
  if (event.type === 'order.updated' && typeof resource.orderId === 'string'
    && (resource.status === 'pending' || resource.status === 'confirmed' || resource.status === 'rejected')
    && (resource.rejectionReason === undefined || typeof resource.rejectionReason === 'string')) {
    return {
      eventId: event.eventId,
      type: 'order.updated',
      version: Number(event.version),
      resource: {
        orderId: resource.orderId,
        status: resource.status,
        ...(typeof resource.rejectionReason === 'string'
          ? { rejectionReason: resource.rejectionReason } : {}),
      },
    };
  }
  return undefined;
}

export const handlers = [
  http.all('*/api/*', async ({ request }) => {
    const response = await applyScenarioBeforeHandler(request, new URL(request.url).pathname);
    return response;
  }),

  http.post('*/__mocks/reset', async ({ request }) => {
    const body = await readJson(request);
    const scenarioName = typeof body?.scenario === 'string' ? body.scenario : undefined;
    const validScenario = isMockScenarioName(scenarioName) ? scenarioName : undefined;
    const selectedScenario = validScenario ? scenarioSeed(validScenario) : undefined;
    const seed = body?.seed === 'empty' || selectedScenario === 'empty' ? 'empty' : 'default';
    resetDb(seed);
    disconnectMockSockets();
    if (validScenario) setMockScenario(validScenario);
    else clearMockScenario();
    return HttpResponse.json({ reset: true, seed, scenario: validScenario ?? 'success' });
  }),

  http.post('*/__mocks/scenario', async ({ request }) => {
    const body = await readJson(request);
    const name = typeof body?.scenario === 'string' ? body.scenario : undefined;
    if (!isMockScenarioName(name)) {
      return apiError(422, 'VALIDATION_ERROR', 'Informe um cenário conhecido.');
    }
    const endpoint = typeof body?.endpoint === 'string' && body.endpoint.startsWith('/api/')
      ? body.endpoint
      : undefined;
    setMockScenario(name, endpoint);
    return HttpResponse.json({ scenario: name, endpoint: endpoint ?? null });
  }),

  http.get('*/__mocks/scenario', () => HttpResponse.json({
    selection: getMockScenarioSelection() ?? null,
  })),

  http.patch('*/__mocks/realtime/nfts/:id', async ({ params, request }) => {
    const body = await readJson(request);
    const nftId = String(params.id);
    const nft = getDb().nfts[nftId];
    if (!nft) return apiError(404, 'NOT_FOUND', 'NFT não encontrado.');
    const editionId = typeof body?.editionId === 'string' ? body.editionId : undefined;
    const edition = editionId
      ? nft.editions.find((entry) => entry.id === editionId)
      : nft.editions[0];
    if (!edition) return apiError(404, 'NOT_FOUND', 'Edição não encontrada.');
    const priceEth = body?.priceEth;
    const availableQuantity = body?.availableQuantity;
    if ((priceEth !== undefined
      && (typeof priceEth !== 'string' || !/^\d+(\.\d+)?$/.test(priceEth)))
      || (availableQuantity !== undefined
        && (!Number.isSafeInteger(availableQuantity) || Number(availableQuantity) < 0))) {
      return apiError(422, 'VALIDATION_ERROR', 'Informe preço e disponibilidade válidos.');
    }
    const updates = {
      editionId: edition.id,
      ...(typeof priceEth === 'string' ? { priceEth } : {}),
      ...(typeof availableQuantity === 'number' ? { availableQuantity } : {}),
    };
    if (!Object.keys(updates).some((key) => key !== 'editionId')) {
      return apiError(422, 'VALIDATION_ERROR', 'Informe ao menos um campo para atualizar.');
    }
    return HttpResponse.json(updateNftListing(nftId, updates));
  }),

  http.patch('*/__mocks/realtime/orders/:id', async ({ params, request }) => {
    const body = await readJson(request);
    if (body?.status !== 'confirmed' && body?.status !== 'rejected') {
      return apiError(422, 'VALIDATION_ERROR', 'Informe confirmed ou rejected.');
    }
    const result = resolvePendingOrder(String(params.id), body.status);
    if ('code' in result) return apiError(result.status, result.code, result.message);
    return HttpResponse.json(result);
  }),

  http.post('*/__mocks/realtime/emit', async ({ request }) => {
    const body = await readJson(request);
    const event = parseInjectedEvent(body?.event);
    const duplicates = body?.duplicates === undefined ? 1 : body.duplicates;
    if (!event || !Number.isSafeInteger(duplicates) || Number(duplicates) < 1 || Number(duplicates) > 5) {
      return apiError(422, 'VALIDATION_ERROR', 'Informe evento válido e de uma a cinco entregas.');
    }
    for (let index = 0; index < Number(duplicates); index += 1) {
      publishMarketplaceEvent(event);
    }
    return HttpResponse.json({ emitted: Number(duplicates), eventId: event.eventId });
  }),

  http.post('*/__mocks/realtime/disconnect', () => {
    disconnectMockSockets();
    return HttpResponse.json({ disconnected: true });
  }),

  http.get('*/__mocks/realtime/status', () => HttpResponse.json({
    connections: mockSocketConnectionCount(),
    orders: Object.keys(getDb().orders).length,
  })),

  http.get('*/api/nfts/:id', ({ params }) => {
    const nft = getDb().nfts[String(params.id)];
    if (!nft) {
      return apiError(404, 'NOT_FOUND', 'NFT não encontrado.');
    }
    return HttpResponse.json<NFT>(asNft(nft));
  }),

  http.get('*/api/nfts', ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get('q')?.trim().toLocaleLowerCase() ?? '';
    const collection = url.searchParams.get('collection');
    const network = url.searchParams.get('network');
    const minPriceCents = readPriceCents(url.searchParams.get('minPrice'), 0);
    const maxPriceCents = readPriceCents(url.searchParams.get('maxPrice'), Number.MAX_SAFE_INTEGER);
    const minPriceEth = toEthFromCents(minPriceCents);
    const maxPriceEth = maxPriceCents === Number.MAX_SAFE_INTEGER
      ? undefined
      : toEthFromCents(maxPriceCents);
    const sort = url.searchParams.get('sort') ?? 'recent';
    const requestedPage = Number(url.searchParams.get('page') ?? 1);
    const requestedLimit = Number(url.searchParams.get('limit') ?? 9);

    let filteredData: NFT[] = Object.values(getDb().nfts).map(asNft);
    if (search) {
      filteredData = filteredData.filter((nft) => (
        `${nft.name} ${nft.collection} ${nft.collectionName ?? ''} ${nft.description}`
          .toLocaleLowerCase()
          .includes(search)
      ));
    }
    if (collection) filteredData = filteredData.filter((nft) => nft.collection === collection);
    if (network) filteredData = filteredData.filter((nft) => nft.network === network);
    filteredData = filteredData.filter((nft) => compareEth(nft.priceEth, minPriceEth) >= 0);
    if (maxPriceEth) {
      filteredData = filteredData.filter((nft) => compareEth(nft.priceEth, maxPriceEth) <= 0);
    }

    if (sort === 'price-low') {
      filteredData = [...filteredData].sort((a, b) => compareEth(a.priceEth, b.priceEth));
    } else if (sort === 'price-high') {
      filteredData = [...filteredData].sort((a, b) => compareEth(b.priceEth, a.priceEth));
    } else if (sort === 'newest') {
      filteredData = [...filteredData].reverse();
    } else if (sort === 'trending') {
      filteredData = [...filteredData].sort((a, b) => b.availableQuantity - a.availableQuantity);
    }

    const total = filteredData.length;
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 24)
      : 9;
    const pageCount = Math.max(1, Math.ceil(total / limit));
    const page = Number.isFinite(requestedPage)
      ? Math.min(Math.max(Math.trunc(requestedPage), 1), pageCount)
      : 1;

    return HttpResponse.json<PaginatedResponse<NFT>>({
      data: filteredData.slice((page - 1) * limit, page * limit),
      total,
      page,
      limit,
    });
  }),

  http.post('*/api/auth/register', async ({ request }) => {
    const body = await readJson(request);
    const email = typeof body?.email === 'string' ? body.email.trim().toLocaleLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const fieldErrors: Record<string, string[]> = {};

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fieldErrors.email = ['Informe um e-mail válido.'];
    }
    if (password.length < 8) {
      fieldErrors.password = ['A senha deve ter pelo menos 8 caracteres.'];
    }
    if (displayName.length < 2) {
      fieldErrors.displayName = ['Informe um nome com pelo menos 2 caracteres.'];
    }
    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) {
      fieldErrors.username = ['Use de 3 a 24 letras, números, hífens ou sublinhados.'];
    }
    if (Object.keys(fieldErrors).length) {
      return apiError(422, 'VALIDATION_ERROR', 'Revise os campos informados.', fieldErrors);
    }
    if (getUserByEmail(email)) {
      return apiError(409, 'ACCOUNT_CONFLICT', 'Já existe uma conta com este e-mail.', {
        email: ['Este e-mail já está cadastrado.'],
      });
    }

    const passwordSalt = newPasswordSalt();
    const passwordHash = await hashPassword(password, passwordSalt);
    const registration: RegisterRequest = { email, password, displayName, username };
    const user = registerUser({
      email: registration.email,
      displayName: registration.displayName,
      username: registration.username,
      passwordSalt,
      passwordHash,
      ...(typeof body?.visitorId === 'string' ? { visitorId: body.visitorId } : {}),
    });
    if (!user) {
      return apiError(409, 'ACCOUNT_CONFLICT', 'Já existe uma conta com este e-mail.', {
        email: ['Este e-mail já está cadastrado.'],
      });
    }

    const session = createSession(user.id);
    const response: RegisterResponse = { user: accountSummary(user), session };
    return HttpResponse.json(response, { status: 201 });
  }),

  http.post('*/api/auth/login', async ({ request }) => {
    const body = await readJson(request);
    const credentials: LoginRequest | undefined = body ? validateCredentials(body) : undefined;
    if (!credentials) {
      return apiError(422, 'VALIDATION_ERROR', 'Informe e-mail e senha.', {
        email: ['Informe um e-mail válido.'],
        password: ['Informe sua senha.'],
      });
    }

    const user = getUserByEmail(credentials.email);
    if (!user || !(await verifyPassword(user, credentials.password))) {
      return apiError(401, 'SESSION_INVALID', 'E-mail ou senha incorretos.');
    }
    if (credentials.visitorId) {
      const merged = mergeVisitorCart(user.id, credentials.visitorId);
      if (merged instanceof Response) return merged;
    }
    return HttpResponse.json<SessionResponse>(createSession(user.id));
  }),

  http.get('*/api/auth/session', ({ request }) => {
    const authenticated = requireAuth(request);
    if (isAuthFailure(authenticated)) return authenticated.response;

    const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return apiError(401, 'SESSION_INVALID', 'Sessão inválida.');
    const session = getDb().sessions[token];
    if (!session) return apiError(401, 'SESSION_INVALID', 'Sessão inválida.');
    return HttpResponse.json<SessionResponse>({
      user: accountSummary(authenticated),
      token,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
  }),

  http.post('*/api/auth/logout', ({ request }) => {
    const response = invalidateSession(request);
    if (response) return response;
    return HttpResponse.json<LogoutResponse>({ loggedOut: true });
  }),

  http.post('*/api/auth/expire', ({ request }) => {
    const authenticated = requireAuth(request);
    if (isAuthFailure(authenticated)) return authenticated.response;
    const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return apiError(401, 'SESSION_INVALID', 'Sessão inválida.');
    mutate((draft) => {
      delete draft.sessions[token];
    });
    return HttpResponse.json<ExpireSessionResponse>({ expired: true });
  }),
  ...resourceHandlers,
];
