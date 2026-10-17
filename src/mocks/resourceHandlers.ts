import { http, HttpResponse } from 'msw';
import {
  applyBasisPoints,
  compareEth,
  multiplyEthByInteger,
  subtractEth,
  sumEth,
} from '../lib/money';
import type {
  CartLineRequest,
  CartResponse,
  ChangePasswordRequest,
  ChangePasswordResponse,
  FavoritesResponse,
  OrderCreateRequest,
  OrderResponse,
  ProfileResponse,
  QuoteItemAvailability,
  QuoteRequest,
  QuoteResponse,
  ReceiptItemSnapshot,
  UpdateProfileRequest,
  WalletRequest,
  WalletResponse,
  WalletsResponse,
} from '../contracts/api';
import { apiError, hashPassword, isAuthFailure, newPasswordSalt, readJson, requireAuth, verifyPassword } from './auth';
import { getDb, mutate } from './db';
import type { MockDatabaseState, MockNftEdition, MockNftRecord, StoredOrder } from './db/types';
import { createNftUpdatedEvent, createOrderUpdatedEvent, publishMarketplaceEvent } from './eventBus';
import { consumeOrderTimeout, isPaymentPendingScenario, isPaymentRejectedScenario } from './scenarios';

interface HandlerError {
  status: number;
  code: Parameters<typeof apiError>[1];
  message: string;
  fieldErrors?: Record<string, string[] | undefined>;
  details?: Record<string, unknown>;
}

type CartMergeResult = CartResponse | HandlerError;
type OrderMutationResult = HandlerError | { response: OrderResponse; created: boolean };

function errorResult(error: HandlerError) {
  const fieldErrors = error.fieldErrors
    ? Object.fromEntries(
      Object.entries(error.fieldErrors).filter((entry): entry is [string, string[]] => Array.isArray(entry[1])),
    )
    : undefined;
  return apiError(error.status, error.code, error.message, fieldErrors, error.details);
}

function isHandlerError(value: unknown): value is HandlerError {
  return typeof value === 'object' && value !== null && 'status' in value && 'code' in value;
}

function parseCartLines(value: unknown): CartLineRequest[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const lines: CartLineRequest[] = [];
  for (const item of value) {
    if (
      typeof item !== 'object' || item === null
      || !('nftId' in item) || typeof item.nftId !== 'string'
      || !('editionId' in item) || typeof item.editionId !== 'string'
      || !('quantity' in item) || !Number.isSafeInteger(item.quantity)
      || item.quantity < 1
    ) {
      return undefined;
    }
    lines.push({ nftId: item.nftId, editionId: item.editionId, quantity: item.quantity });
  }
  return lines;
}

function parseCartLine(value: unknown): CartLineRequest | undefined {
  const lines = parseCartLines([value]);
  return lines?.[0];
}

function getEdition(
  state: MockDatabaseState,
  line: Pick<CartLineRequest, 'nftId' | 'editionId'>,
): { nft: MockNftRecord; edition: MockNftEdition } | undefined {
  const nft = state.nfts[line.nftId];
  const edition = nft?.editions.find((candidate) => candidate.id === line.editionId);
  return nft && edition ? { nft, edition } : undefined;
}

function getCartResponse(state: MockDatabaseState, userId: string): CartResponse {
  const cart = state.carts[userId] ?? { items: [], version: 1 };
  return {
    version: cart.version,
    items: cart.items.flatMap((line) => {
      const current = getEdition(state, line);
      return current
        ? [{
          ...line,
          nft: current.nft,
          availableQuantity: current.edition.availableQuantity,
        }]
        : [];
    }),
  };
}

function getCartResponseForVisitorFromState(state: MockDatabaseState, visitorId: string): CartResponse {
  const cart = state.visitorCarts[visitorId] ?? { items: [], version: 1 };
  return {
    version: cart.version,
    items: cart.items.flatMap((line) => {
      const current = getEdition(state, line);
      return current
        ? [{
          ...line,
          nft: current.nft,
          availableQuantity: current.edition.availableQuantity,
        }]
        : [];
    }),
  };
}

function getCartResponseForVisitor(visitorId: string): CartResponse {
  return getCartResponseForVisitorFromState(getDb(), visitorId);
}

function normalizedLines(lines: CartLineRequest[]): CartLineRequest[] {
  const combined = new Map<string, CartLineRequest>();
  for (const line of lines) {
    const key = `${line.nftId}:${line.editionId}`;
    const existing = combined.get(key);
    combined.set(key, existing
      ? { ...existing, quantity: existing.quantity + line.quantity }
      : { ...line });
  }
  return [...combined.values()]
    .sort((a, b) => a.nftId.localeCompare(b.nftId) || a.editionId.localeCompare(b.editionId));
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value);
}

function orderResponse(order: StoredOrder): OrderResponse {
  return {
    id: order.id,
    status: order.status,
    version: order.version,
    createdAt: order.createdAt,
    ...(order.receipt ? { receipt: order.receipt } : {}),
    ...(order.rejectionReason ? { rejectionReason: order.rejectionReason } : {}),
  };
}

function publishOrderMutation(order: StoredOrder): void {
  publishMarketplaceEvent(createOrderUpdatedEvent({
    resource: {
      orderId: order.id,
      status: order.status,
      ...(order.rejectionReason ? { rejectionReason: order.rejectionReason } : {}),
    },
    version: order.version,
  }));
  if (order.status !== 'confirmed' || !order.request) return;
  for (const line of order.request.items) {
    const nft = getDb().nfts[line.nftId];
    const edition = nft?.editions.find((entry) => entry.id === line.editionId);
    if (!nft || !edition) continue;
    publishMarketplaceEvent(createNftUpdatedEvent({
      resource: {
        nftId: nft.id,
        editionId: edition.id,
        priceEth: edition.priceEth,
        availableQuantity: nft.availableQuantity,
        editionAvailableQuantity: edition.availableQuantity,
      },
      version: nft.version,
    }));
  }
}

export function resolvePendingOrder(
  orderId: string,
  status: 'confirmed' | 'rejected',
): OrderResponse | HandlerError {
  const result = mutate<OrderMutationResult>((draft): OrderMutationResult => {
    const order = draft.orders[orderId];
    if (!order) return {
      status: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado.',
    } satisfies HandlerError;
    if (order.status !== 'pending') return {
      status: 409, code: 'VALIDATION_ERROR', message: 'O pedido já está em estado terminal.',
    } satisfies HandlerError;
    const orderRequest = order.request;
    if (!orderRequest) return {
      status: 409, code: 'QUOTE_STALE', message: 'O pedido não contém dados recuperáveis.',
    } satisfies HandlerError;
    if (status === 'confirmed') {
      const quote = draft.quotes[orderRequest.quoteId];
      if (!quote || quote.userId !== order.userId) return {
        status: 409, code: 'QUOTE_STALE', message: 'A cotação do pedido não pode mais ser recuperada.',
      } satisfies HandlerError;
      for (const quotedItem of quote.response.items) {
        const current = getEdition(draft, quotedItem);
        const line = orderRequest.items.find((item) => (
          item.nftId === quotedItem.nftId && item.editionId === quotedItem.editionId
        ));
        if (!current || !line || current.edition.availableQuantity < line.quantity) return {
          status: 409, code: 'AVAILABILITY_CONFLICT', message: 'A quantidade não está mais disponível.',
        } satisfies HandlerError;
        if (current.nft.version !== quotedItem.nftVersion
          || compareEth(current.edition.priceEth, quotedItem.unitPriceEth) !== 0) return {
          status: 409, code: 'QUOTE_STALE', message: 'Preço ou disponibilidade mudou desde a cotação.',
        } satisfies HandlerError;
      }
      const items: ReceiptItemSnapshot[] = orderRequest.items.map((line) => {
        const current = getEdition(draft, line);
        if (!current) throw new Error('Pending order NFT disappeared during confirmation.');
        return {
          nftId: line.nftId,
          editionId: line.editionId,
          name: current.nft.name,
          imageUrl: current.nft.imageUrl,
          quantity: line.quantity,
          unitPriceEth: current.edition.priceEth,
          totalPriceEth: multiplyEthByInteger(current.edition.priceEth, line.quantity),
        };
      });
      const transactionId = `0xSIM${String(draft.nextId).padStart(12, '0')}`;
      order.receipt = {
        orderId,
        transactionReference: transactionId,
        explorerUrl: `https://explorer.kurio.test/tx/${transactionId}`,
        items,
        subtotalEth: quote.response.subtotalEth,
        discountEth: quote.response.discountEth,
        networkFeeEth: quote.response.networkFeeEth,
        totalEth: quote.response.totalEth,
        network: orderRequest.network,
        createdAt: new Date(Date.now()).toISOString(),
      };
      for (const line of orderRequest.items) {
        const current = getEdition(draft, line);
        if (!current) throw new Error('Pending order NFT disappeared during stock reservation.');
        current.edition.availableQuantity -= line.quantity;
        current.nft.availableQuantity = current.nft.editions
          .reduce((total, edition) => total + edition.availableQuantity, 0);
        current.nft.version += 1;
      }
      const cart = draft.carts[order.userId] ?? { items: [], version: 1 };
      cart.items = cart.items.flatMap((cartItem) => {
        const purchased = orderRequest.items.find((line) => (
          line.nftId === cartItem.nftId && line.editionId === cartItem.editionId
        ));
        if (!purchased) return [cartItem];
        const remaining = cartItem.quantity - purchased.quantity;
        return remaining > 0 ? [{ ...cartItem, quantity: remaining }] : [];
      });
      cart.version += 1;
      draft.carts[order.userId] = cart;
      if (quote.couponCode) {
        const coupon = draft.coupons[quote.couponCode];
        if (coupon) coupon.redemptionCount += 1;
      }
    } else {
      order.rejectionReason = 'Pagamento recusado (cenário simulado).';
    }
    order.status = status;
    order.version += 1;
    return { response: orderResponse(order), created: true };
  });
  if ('status' in result) return result;
  const updated = getDb().orders[orderId];
  if (!updated) throw new Error('Updated order is missing from the mock database.');
  publishOrderMutation(updated);
  return result.response;
}

function findCouponStatus(
  state: MockDatabaseState,
  code: string | undefined,
): QuoteResponse['couponStatus'] {
  if (!code) return 'not-applied';
  const coupon = state.coupons[code.trim().toLocaleUpperCase()];
  if (!coupon) return 'invalid';
  if (Date.parse(coupon.expiresAt) <= Date.now() || coupon.redemptionCount >= coupon.redemptionLimit) {
    return 'expired';
  }
  return 'applied';
}

function buildQuoteItems(
  state: MockDatabaseState,
  lines: CartLineRequest[],
): QuoteItemAvailability[] | HandlerError {
  const result: QuoteItemAvailability[] = [];
  for (const line of lines) {
    const current = getEdition(state, line);
    if (!current) {
      return {
        status: 404,
        code: 'NOT_FOUND',
        message: 'NFT ou edição não encontrada.',
      };
    }
    result.push({
      nftId: line.nftId,
      editionId: line.editionId,
      requestedQuantity: line.quantity,
      availableQuantity: current.edition.availableQuantity,
      available: line.quantity <= current.edition.availableQuantity,
      unitPriceEth: current.edition.priceEth,
      nftVersion: current.nft.version,
    });
  }
  return result;
}

function quoteTotals(
  state: MockDatabaseState,
  lines: CartLineRequest[],
  availability: QuoteItemAvailability[],
  couponCode: string | undefined,
): Pick<QuoteResponse, 'subtotalEth' | 'discountEth' | 'networkFeeEth' | 'totalEth' | 'couponStatus' | 'couponCode'> {
  const subtotalEth = sumEth(...availability.map((item) => (
    multiplyEthByInteger(item.unitPriceEth, item.requestedQuantity)
  )));
  const couponStatus = findCouponStatus(state, couponCode);
  const canonicalCouponCode = couponStatus === 'applied' ? couponCode?.trim().toLocaleUpperCase() : undefined;
  const coupon = canonicalCouponCode ? state.coupons[canonicalCouponCode] : undefined;
  const discountEth = coupon ? applyBasisPoints(subtotalEth, coupon.discountBasisPoints) : '0';
  const networkFeeEth = lines.length ? '0.016' : '0';
  const totalEth = sumEth(subtractEth(subtotalEth, discountEth), networkFeeEth);
  return {
    subtotalEth,
    discountEth,
    networkFeeEth,
    totalEth,
    couponStatus,
    ...(canonicalCouponCode ? { couponCode: canonicalCouponCode } : {}),
  };
}

function requireUser(request: Request) {
  const user = requireAuth(request);
  return isAuthFailure(user) ? user.response : user;
}

export function mergeVisitorCart(userId: string, visitorId: string): CartResponse | Response {
  const result = mutate<CartMergeResult>((draft): CartMergeResult => {
    const guestItems = draft.visitorCarts[visitorId]?.items ?? [];
    if (!guestItems.length) return getCartResponse(draft, userId);
    const combined = new Map<string, CartLineRequest>();
    for (const line of [...(draft.carts[userId]?.items ?? []), ...guestItems]) {
      const key = `${line.nftId}:${line.editionId}`;
      const current = combined.get(key);
      combined.set(key, current ? { ...current, quantity: current.quantity + line.quantity } : line);
    }
    for (const line of combined.values()) {
      const current = getEdition(draft, line);
      if (!current) return {
        status: 404, code: 'NOT_FOUND', message: 'NFT ou edição não encontrada.',
      } satisfies HandlerError;
      if (line.quantity > current.edition.availableQuantity) return {
        status: 409,
        code: 'AVAILABILITY_CONFLICT',
        message: 'O carrinho de visitante excede o estoque atual.',
        details: { nftId: line.nftId, availableQuantity: current.edition.availableQuantity },
      } satisfies HandlerError;
    }
    const cart = draft.carts[userId] ?? { items: [], version: 1 };
    cart.items = [...combined.values()];
    cart.version += 1;
    draft.carts[userId] = cart;
    delete draft.visitorCarts[visitorId];
    return getCartResponse(draft, userId);
  });
  if (isHandlerError(result)) return errorResult(result);
  return result;
}

export const resourceHandlers = [
  http.get('*/api/favorites', ({ request }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    const response: FavoritesResponse = { nftIds: getDb().favorites[user.id] ?? [] };
    return HttpResponse.json(response);
  }),

  http.put('*/api/favorites/:nftId', ({ request, params }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    const nftId = String(params.nftId);
    if (!getDb().nfts[nftId]) return apiError(404, 'NOT_FOUND', 'NFT não encontrado.');
    const response = mutate((draft) => {
      const nftIds = draft.favorites[user.id] ?? [];
      if (!nftIds.includes(nftId)) nftIds.push(nftId);
      draft.favorites[user.id] = nftIds;
      return { nftIds };
    });
    return HttpResponse.json<FavoritesResponse>(response);
  }),

  http.delete('*/api/favorites/:nftId', ({ request, params }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    const nftId = String(params.nftId);
    const response = mutate((draft) => {
      const nftIds = (draft.favorites[user.id] ?? []).filter((item) => item !== nftId);
      draft.favorites[user.id] = nftIds;
      return { nftIds };
    });
    return HttpResponse.json<FavoritesResponse>(response);
  }),

  http.get('*/api/cart', ({ request }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    return HttpResponse.json(getCartResponse(getDb(), user.id));
  }),

  http.get('*/api/cart/visitor/:visitorId', ({ params }) => {
    const visitorId = String(params.visitorId);
    return HttpResponse.json(getCartResponseForVisitor(visitorId));
  }),

  http.post('*/api/cart/visitor/:visitorId/items', async ({ request, params }) => {
    const visitorId = String(params.visitorId);
    const body = await readJson(request);
    const line = parseCartLine(body);
    if (!line) {
      return apiError(422, 'VALIDATION_ERROR', 'Informe um NFT, edição e quantidade válidos.', {
        quantity: ['A quantidade deve ser um inteiro positivo.'],
      });
    }
    const result = mutate((draft) => {
      const current = getEdition(draft, line);
      if (!current) return {
        status: 404, code: 'NOT_FOUND', message: 'NFT ou edição não encontrada.',
      } satisfies HandlerError;
      const cart = draft.visitorCarts[visitorId] ?? { items: [], version: 1 };
      const existing = cart.items.find((item) => item.nftId === line.nftId && item.editionId === line.editionId);
      const quantity = (existing?.quantity ?? 0) + line.quantity;
      if (quantity > current.edition.availableQuantity) return {
        status: 409,
        code: 'AVAILABILITY_CONFLICT',
        message: 'A quantidade solicitada excede o estoque disponível.',
        details: { availableQuantity: current.edition.availableQuantity },
      } satisfies HandlerError;
      if (existing) existing.quantity = quantity;
      else cart.items.push(line);
      cart.version += 1;
      draft.visitorCarts[visitorId] = cart;
      return getCartResponseForVisitorFromState(draft, visitorId);
    });
    if (isHandlerError(result)) return errorResult(result);
    return HttpResponse.json(result);
  }),

  http.patch('*/api/cart/visitor/:visitorId/items/:nftId/:editionId', async ({ request, params }) => {
    const body = await readJson(request);
    const quantity = body?.quantity;
    if (!Number.isSafeInteger(quantity) || Number(quantity) < 1) {
      return apiError(422, 'VALIDATION_ERROR', 'A quantidade deve ser um inteiro positivo.', {
        quantity: ['A quantidade deve ser um inteiro positivo.'],
      });
    }
    const visitorId = String(params.visitorId);
    const line: CartLineRequest = {
      nftId: String(params.nftId),
      editionId: String(params.editionId),
      quantity: Number(quantity),
    };
    const result = mutate((draft) => {
      const current = getEdition(draft, line);
      if (!current) return {
        status: 404, code: 'NOT_FOUND', message: 'NFT ou edição não encontrada.',
      } satisfies HandlerError;
      if (line.quantity > current.edition.availableQuantity) return {
        status: 409,
        code: 'AVAILABILITY_CONFLICT',
        message: 'A quantidade solicitada excede o estoque disponível.',
        details: { availableQuantity: current.edition.availableQuantity },
      } satisfies HandlerError;
      const cart = draft.visitorCarts[visitorId] ?? { items: [], version: 1 };
      const existing = cart.items.find((item) => item.nftId === line.nftId && item.editionId === line.editionId);
      if (!existing) return {
        status: 404, code: 'NOT_FOUND', message: 'Item não encontrado no carrinho.',
      } satisfies HandlerError;
      existing.quantity = line.quantity;
      cart.version += 1;
      draft.visitorCarts[visitorId] = cart;
      return getCartResponseForVisitorFromState(draft, visitorId);
    });
    return isHandlerError(result) ? errorResult(result) : HttpResponse.json(result);
  }),

  http.delete('*/api/cart/visitor/:visitorId/items/:nftId/:editionId', ({ params }) => {
    const visitorId = String(params.visitorId);
    const response = mutate((draft) => {
      const cart = draft.visitorCarts[visitorId] ?? { items: [], version: 1 };
      cart.items = cart.items.filter((item) => (
        item.nftId !== String(params.nftId) || item.editionId !== String(params.editionId)
      ));
      cart.version += 1;
      draft.visitorCarts[visitorId] = cart;
      return getCartResponseForVisitorFromState(draft, visitorId);
    });
    return HttpResponse.json(response);
  }),

  http.post('*/api/cart/items', async ({ request }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    const body = await readJson(request);
    const line = parseCartLine(body);
    if (!line) {
      return apiError(422, 'VALIDATION_ERROR', 'Informe um NFT, edição e quantidade válidos.', {
        quantity: ['A quantidade deve ser um inteiro positivo.'],
      });
    }

    const result = mutate((draft) => {
      const current = getEdition(draft, line);
      if (!current) return {
        status: 404, code: 'NOT_FOUND', message: 'NFT ou edição não encontrada.',
      } satisfies HandlerError;
      const cart = draft.carts[user.id] ?? { items: [], version: 1 };
      const existing = cart.items.find((item) => item.nftId === line.nftId && item.editionId === line.editionId);
      const nextQuantity = (existing?.quantity ?? 0) + line.quantity;
      if (nextQuantity > current.edition.availableQuantity) return {
        status: 409,
        code: 'AVAILABILITY_CONFLICT',
        message: 'A quantidade solicitada excede o estoque disponível.',
        details: { availableQuantity: current.edition.availableQuantity },
      } satisfies HandlerError;
      if (existing) existing.quantity = nextQuantity;
      else cart.items.push(line);
      cart.version += 1;
      draft.carts[user.id] = cart;
      return getCartResponse(draft, user.id);
    });
    return isHandlerError(result) ? errorResult(result) : HttpResponse.json(result);
  }),

  http.patch('*/api/cart/items/:nftId/:editionId', async ({ request, params }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    const body = await readJson(request);
    const quantity = body?.quantity;
    if (!Number.isSafeInteger(quantity) || Number(quantity) < 1) {
      return apiError(422, 'VALIDATION_ERROR', 'A quantidade deve ser um inteiro positivo.', {
        quantity: ['A quantidade deve ser um inteiro positivo.'],
      });
    }
    const line: CartLineRequest = {
      nftId: String(params.nftId),
      editionId: String(params.editionId),
      quantity: Number(quantity),
    };
    const result = mutate((draft) => {
      const current = getEdition(draft, line);
      if (!current) return {
        status: 404, code: 'NOT_FOUND', message: 'NFT ou edição não encontrada.',
      } satisfies HandlerError;
      if (line.quantity > current.edition.availableQuantity) return {
        status: 409,
        code: 'AVAILABILITY_CONFLICT',
        message: 'A quantidade solicitada excede o estoque disponível.',
        details: { availableQuantity: current.edition.availableQuantity },
      } satisfies HandlerError;
      const cart = draft.carts[user.id] ?? { items: [], version: 1 };
      const existing = cart.items.find((item) => item.nftId === line.nftId && item.editionId === line.editionId);
      if (!existing) return {
        status: 404, code: 'NOT_FOUND', message: 'Item não encontrado no carrinho.',
      } satisfies HandlerError;
      existing.quantity = line.quantity;
      cart.version += 1;
      draft.carts[user.id] = cart;
      return getCartResponse(draft, user.id);
    });
    return isHandlerError(result) ? errorResult(result) : HttpResponse.json(result);
  }),

  http.delete('*/api/cart/items/:nftId/:editionId', ({ request, params }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    const response = mutate((draft) => {
      const cart = draft.carts[user.id] ?? { items: [], version: 1 };
      cart.items = cart.items.filter((item) => (
        item.nftId !== String(params.nftId) || item.editionId !== String(params.editionId)
      ));
      cart.version += 1;
      draft.carts[user.id] = cart;
      return getCartResponse(draft, user.id);
    });
    return HttpResponse.json(response);
  }),

  http.post('*/api/cart/merge', async ({ request }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    const body = await readJson(request);
    const incoming = parseCartLines(body?.items);
    const visitorId = typeof body?.visitorId === 'string' ? body.visitorId : '';
    if (!incoming || !visitorId) {
      return apiError(422, 'VALIDATION_ERROR', 'Informe um carrinho de visitante válido.', {
        items: ['Os itens do carrinho são inválidos.'],
      });
    }

    const result = mutate((draft) => {
      const guest = draft.visitorCarts[visitorId]?.items ?? incoming;
      const merged = normalizedLines([...(draft.carts[user.id]?.items ?? []), ...guest]);
      const combined = new Map<string, CartLineRequest>();
      for (const line of merged) {
        const key = `${line.nftId}:${line.editionId}`;
        const current = combined.get(key);
        combined.set(key, current ? { ...current, quantity: current.quantity + line.quantity } : line);
      }
      for (const line of combined.values()) {
        const current = getEdition(draft, line);
        if (!current) return {
          status: 404, code: 'NOT_FOUND', message: 'NFT ou edição não encontrada.',
        } satisfies HandlerError;
        if (line.quantity > current.edition.availableQuantity) return {
          status: 409,
          code: 'AVAILABILITY_CONFLICT',
          message: 'O carrinho de visitante excede o estoque atual.',
          details: { nftId: line.nftId, availableQuantity: current.edition.availableQuantity },
        } satisfies HandlerError;
      }
      const cart = draft.carts[user.id] ?? { items: [], version: 1 };
      cart.items = [...combined.values()];
      cart.version += 1;
      draft.carts[user.id] = cart;
      delete draft.visitorCarts[visitorId];
      return getCartResponse(draft, user.id);
    });
    return isHandlerError(result) ? errorResult(result) : HttpResponse.json(result);
  }),

  http.post('*/api/quotes', async ({ request }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    const body = await readJson(request);
      const items = parseCartLines(body?.items);
    const couponCode = typeof body?.couponCode === 'string' ? body.couponCode : undefined;
    if (!items || items.length === 0) {
      return apiError(422, 'VALIDATION_ERROR', 'A cotação precisa de ao menos um item.', {
        items: ['Informe itens válidos para cotação.'],
      });
    }
    const quoteRequest: QuoteRequest = {
      items: normalizedLines(items),
      ...(couponCode ? { couponCode } : {}),
    };

    const result = mutate((draft) => {
      const availability = buildQuoteItems(draft, quoteRequest.items);
      if (isHandlerError(availability)) return availability;
      const quoteId = `quote-${draft.nextId}`;
      draft.nextId += 1;
      const version = Object.values(draft.quotes)
        .reduce((highest, quote) => Math.max(highest, quote.response.version), 0) + 1;
      const totals = quoteTotals(draft, quoteRequest.items, availability, quoteRequest.couponCode);
      const response: QuoteResponse = {
        quoteId,
        version,
        items: availability,
        ...totals,
        validUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      };
      draft.quotes[quoteId] = {
        userId: user.id,
        request: normalizedLines(quoteRequest.items),
        response,
        ...(totals.couponCode ? { couponCode: totals.couponCode } : {}),
      };
      return response;
    });
    return isHandlerError(result)
      ? errorResult(result)
      : HttpResponse.json<QuoteResponse>(result);
  }),

  http.post('*/api/orders', async ({ request }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    const body = await readJson(request);
    const items = parseCartLines(body?.items);
    const quoteId = typeof body?.quoteId === 'string' ? body.quoteId : '';
    const walletId = typeof body?.walletId === 'string' ? body.walletId : '';
    const network = typeof body?.network === 'string' ? body.network : '';
    const idempotencyKey = request.headers.get('Idempotency-Key')?.trim() ?? '';
    if (!items || !items.length || !quoteId || !walletId || !network || !idempotencyKey) {
      return apiError(422, 'VALIDATION_ERROR', 'Informe os dados válidos para criar o pedido.', {
        order: ['Cotação, itens, carteira, rede e Idempotency-Key são obrigatórios.'],
      });
    }
    const orderItems = normalizedLines(items);
    const createRequest: OrderCreateRequest = { quoteId, items: orderItems, walletId, network };
    const requestFingerprint = fingerprint({
      ...createRequest,
      items: orderItems,
    });
    const idempotencyScope = `${user.id}:${idempotencyKey}`;

    const result = mutate<OrderMutationResult>((draft): OrderMutationResult => {
      const previousKey = draft.idempotency[idempotencyScope];
      if (previousKey) {
        if (previousKey.fingerprint !== requestFingerprint) return {
          status: 409,
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'A chave de idempotência já foi usada com outro conteúdo.',
        } satisfies HandlerError;
        const previousOrder = draft.orders[previousKey.orderId];
        return previousOrder ? { response: orderResponse(previousOrder), created: false } : {
          status: 503, code: 'TRANSIENT_FAILURE', message: 'O pedido idempotente não pode ser recuperado.',
        } satisfies HandlerError;
      }

      const quote = draft.quotes[quoteId];
      if (!quote || quote.userId !== user.id) return {
        status: 404, code: 'NOT_FOUND', message: 'Cotação não encontrada.',
      } satisfies HandlerError;
      if (Date.parse(quote.response.validUntil) <= Date.now()) return {
        status: 409, code: 'QUOTE_STALE', message: 'A cotação expirou. Solicite uma nova cotação.',
      } satisfies HandlerError;
      if (fingerprint(orderItems) !== fingerprint(quote.request)) return {
        status: 409, code: 'QUOTE_STALE', message: 'Os itens diferem da cotação validada.',
      } satisfies HandlerError;
      if (quote.response.items.some((item) => !item.available)) return {
        status: 409, code: 'AVAILABILITY_CONFLICT', message: 'Um ou mais itens estão esgotados.',
      } satisfies HandlerError;
      for (const quotedItem of quote.response.items) {
        const current = getEdition(draft, quotedItem);
        const line = orderItems.find((item) => (
          item.nftId === quotedItem.nftId && item.editionId === quotedItem.editionId
        ));
        if (!current || !line || line.quantity > current.edition.availableQuantity) return {
          status: 409,
          code: 'AVAILABILITY_CONFLICT',
          message: 'A quantidade não está mais disponível.',
          details: { nftId: quotedItem.nftId, availableQuantity: current?.edition.availableQuantity ?? 0 },
        } satisfies HandlerError;
        if (current.nft.version !== quotedItem.nftVersion
          || compareEth(current.edition.priceEth, quotedItem.unitPriceEth) !== 0) {
          return {
            status: 409, code: 'QUOTE_STALE', message: 'Preço ou disponibilidade mudou desde a cotação.',
          } satisfies HandlerError;
        }
      }
      const wallet = (draft.wallets[user.id] ?? []).find((entry) => entry.id === walletId);
      if (!wallet) return {
        status: 404, code: 'NOT_FOUND', message: 'Carteira não encontrada.',
      } satisfies HandlerError;
      if (wallet.network !== network) return {
        status: 422,
        code: 'VALIDATION_ERROR',
        message: 'A rede selecionada não corresponde à carteira.',
        fieldErrors: { network: ['Selecione a rede da carteira escolhida.'] },
      } satisfies HandlerError;

      const orderId = `order-${draft.nextId}`;
      draft.nextId += 1;
      const createdAt = new Date(Date.now()).toISOString();
      const receiptItems: ReceiptItemSnapshot[] = orderItems.map((line) => {
        const current = getEdition(draft, line);
        if (!current) throw new Error('Quoted NFT disappeared during atomic order creation.');
        return {
          nftId: line.nftId,
          editionId: line.editionId,
          name: current.nft.name,
          imageUrl: current.nft.imageUrl,
          quantity: line.quantity,
          unitPriceEth: current.edition.priceEth,
          totalPriceEth: multiplyEthByInteger(current.edition.priceEth, line.quantity),
        };
      });
      const receipt = {
        orderId,
        transactionReference: `0xSIM${String(draft.nextId).padStart(12, '0')}`,
        explorerUrl: `https://explorer.kurio.test/tx/0xSIM${String(draft.nextId).padStart(12, '0')}`,
        items: receiptItems,
        subtotalEth: quote.response.subtotalEth,
        discountEth: quote.response.discountEth,
        networkFeeEth: quote.response.networkFeeEth,
        totalEth: quote.response.totalEth,
        network,
        createdAt,
      };
      const status = isPaymentPendingScenario(request)
        ? 'pending'
        : isPaymentRejectedScenario(request) ? 'rejected' : 'confirmed';
      const order: StoredOrder = {
        id: orderId,
        userId: user.id,
        idempotencyKey,
        requestFingerprint,
        request: createRequest,
        status,
        version: 1,
        createdAt,
        ...(status === 'rejected'
          ? { rejectionReason: 'Pagamento recusado (cenário simulado).' }
          : status === 'confirmed' ? { receipt } : {}),
      };
      if (order.status === 'confirmed') {
        for (const line of orderItems) {
          const current = getEdition(draft, line);
          if (!current) throw new Error('Quoted NFT disappeared during stock reservation.');
          current.edition.availableQuantity -= line.quantity;
          current.nft.availableQuantity = current.nft.editions
            .reduce((total, edition) => total + edition.availableQuantity, 0);
          current.nft.version += 1;
        }
        const cart = draft.carts[user.id] ?? { items: [], version: 1 };
        cart.items = cart.items.flatMap((cartItem) => {
          const purchased = orderItems.find((item) => (
            item.nftId === cartItem.nftId && item.editionId === cartItem.editionId
          ));
          if (!purchased) return [cartItem];
          const remaining = cartItem.quantity - purchased.quantity;
          return remaining > 0 ? [{ ...cartItem, quantity: remaining }] : [];
        });
        cart.version += 1;
        draft.carts[user.id] = cart;
      }
      if (order.status === 'confirmed' && quote.couponCode) {
        const coupon = draft.coupons[quote.couponCode];
        if (coupon) coupon.redemptionCount += 1;
      }
      draft.orders[orderId] = order;
      draft.idempotency[idempotencyScope] = {
        userId: user.id,
        fingerprint: requestFingerprint,
        orderId,
      };
      return { response: orderResponse(order), created: true };
    });
    if ('status' in result) return errorResult(result);
    if (result.created) {
      const order = getDb().orders[result.response.id];
      if (!order) throw new Error('Created order is missing from the mock database.');
      publishOrderMutation(order);
    }
    if (result.created && consumeOrderTimeout(request)) return HttpResponse.error();
    return HttpResponse.json<OrderResponse>(result.response, { status: result.created ? 201 : 200 });
  }),

  http.get('*/api/orders/:orderId', ({ request, params }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    const order = getDb().orders[String(params.orderId)];
    if (!order || order.userId !== user.id) return apiError(404, 'NOT_FOUND', 'Pedido não encontrado.');
    return HttpResponse.json<OrderResponse>(orderResponse(order));
  }),

  http.get('*/api/profile', ({ request }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    const profile = getDb().profiles[user.id];
    if (!profile) return apiError(404, 'NOT_FOUND', 'Perfil não encontrado.');
    return HttpResponse.json<ProfileResponse>(profile);
  }),

  http.patch('*/api/profile', async ({ request }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    const body = await readJson(request);
    if (!body) return apiError(422, 'VALIDATION_ERROR', 'Informe dados de perfil válidos.');
    const updates: UpdateProfileRequest = {};
    const fieldErrors: Record<string, string[]> = {};
    if ('displayName' in body) {
      if (typeof body.displayName !== 'string' || body.displayName.trim().length < 2) {
        fieldErrors.displayName = ['Informe um nome com pelo menos 2 caracteres.'];
      } else updates.displayName = body.displayName.trim();
    }
    if ('username' in body) {
      if (typeof body.username !== 'string' || !/^[a-zA-Z0-9_-]{3,24}$/.test(body.username)) {
        fieldErrors.username = ['Informe um nome de usuário válido.'];
      } else updates.username = body.username;
    }
    if ('email' in body) {
      if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
        fieldErrors.email = ['Informe um e-mail válido.'];
      } else updates.email = body.email.trim().toLocaleLowerCase();
    }
    if ('ensName' in body) {
      if (typeof body.ensName !== 'string') fieldErrors.ensName = ['Informe um nome ENS válido.'];
      else updates.ensName = body.ensName.trim();
    }
    if ('avatarDataUrl' in body) {
      if (body.avatarDataUrl !== null && (typeof body.avatarDataUrl !== 'string' || body.avatarDataUrl.length > 1_500_000
        || !/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(body.avatarDataUrl))) {
        fieldErrors.avatarDataUrl = ['Envie uma imagem válida de até 1 MB.'];
      } else updates.avatarDataUrl = body.avatarDataUrl;
    }
    if (Object.keys(fieldErrors).length) {
      return apiError(422, 'VALIDATION_ERROR', 'Revise os campos informados.', fieldErrors);
    }

    const result = mutate((draft) => {
      const otherUsers = Object.values(draft.users).filter((candidate) => candidate.id !== user.id);
      const emailConflict = Boolean(updates.email && otherUsers.some((candidate) => (
        candidate.email.toLocaleLowerCase() === updates.email
      )));
      const usernameConflict = Boolean(updates.username && otherUsers.some((candidate) => (
        candidate.username === updates.username
      )));
      if (emailConflict || usernameConflict) return {
        status: 409,
        code: 'ACCOUNT_CONFLICT',
        message: 'O e-mail ou nome de usuário já está em uso.',
        fieldErrors: {
          ...(emailConflict ? { email: ['Este e-mail já está cadastrado.'] } : {}),
          ...(usernameConflict ? { username: ['Este nome de usuário já está em uso.'] } : {}),
        },
      } satisfies HandlerError;
      const { avatarDataUrl, ...profileUpdates } = updates;
      const profile = { ...draft.profiles[user.id], ...profileUpdates };
      if (avatarDataUrl === null) delete profile.avatarDataUrl;
      else if (typeof avatarDataUrl === 'string') profile.avatarDataUrl = avatarDataUrl;
      draft.profiles[user.id] = profile;
      const storedUser = draft.users[user.id];
      if (updates.displayName) storedUser.displayName = updates.displayName;
      if (updates.username) storedUser.username = updates.username;
      if (updates.email) storedUser.email = updates.email;
      return profile;
    });
    if ('status' in result) return errorResult(result);
    return HttpResponse.json<ProfileResponse>(result);
  }),

  http.put('*/api/profile/password', async ({ request }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    const body = await readJson(request);
    const currentPassword = body?.currentPassword;
    const newPassword = body?.newPassword;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string'
      || newPassword.length < 8 || newPassword === currentPassword) {
      return apiError(422, 'VALIDATION_ERROR', 'Informe uma nova senha válida.', {
        newPassword: ['A nova senha deve ter ao menos 8 caracteres e ser diferente da atual.'],
      });
    }
    if (!(await verifyPassword(user, currentPassword))) {
      return apiError(422, 'VALIDATION_ERROR', 'A senha atual está incorreta.', {
        currentPassword: ['A senha atual está incorreta.'],
      });
    }
    const passwordChange: ChangePasswordRequest = { currentPassword, newPassword };
    const passwordSalt = newPasswordSalt();
    const passwordHash = await hashPassword(passwordChange.newPassword, passwordSalt);
    mutate((draft) => {
      draft.users[user.id].passwordSalt = passwordSalt;
      draft.users[user.id].passwordHash = passwordHash;
    });
    const response: ChangePasswordResponse = { changed: true };
    return HttpResponse.json(response);
  }),

  http.get('*/api/wallets', ({ request }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    const response: WalletsResponse = { wallets: getDb().wallets[user.id] ?? [] };
    return HttpResponse.json(response);
  }),

  http.post('*/api/wallets', async ({ request }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    const body = await readJson(request);
    const nickname = typeof body?.nickname === 'string' ? body.nickname.trim() : '';
    const address = typeof body?.address === 'string' ? body.address.trim() : '';
    const network = typeof body?.network === 'string' ? body.network.trim() : '';
    const provider = typeof body?.provider === 'string' ? body.provider.trim() : '';
    const role = body?.role;
    const fieldErrors: Record<string, string[]> = {};
    if (nickname.length < 2) fieldErrors.nickname = ['Informe um apelido válido.'];
    if (!address || address.length < 8) fieldErrors.address = ['Informe um endereço válido.'];
    if (!network) fieldErrors.network = ['Selecione uma rede.'];
    if (!provider) fieldErrors.provider = ['Selecione uma carteira.'];
    if (role !== 'primary' && role !== 'secondary') fieldErrors.role = ['Selecione o tipo de carteira.'];
    if (Object.keys(fieldErrors).length) {
      return apiError(422, 'VALIDATION_ERROR', 'Revise os campos informados.', fieldErrors);
    }
    const walletRole: WalletRequest['role'] = role === 'primary' ? 'primary' : 'secondary';
    const walletRequest: WalletRequest = { nickname, address, network, provider, role: walletRole };
    const result = mutate((draft) => {
      const wallets = draft.wallets[user.id] ?? [];
      if (wallets.some((wallet) => wallet.role === walletRequest.role)) return {
        status: 409,
        code: 'AVAILABILITY_CONFLICT',
        message: `Já existe uma carteira ${walletRequest.role === 'primary' ? 'principal' : 'secundária'}.`,
      } satisfies HandlerError;
      const wallet: WalletResponse = { id: `wallet-${draft.nextId}`, ...walletRequest };
      draft.nextId += 1;
      wallets.push(wallet);
      draft.wallets[user.id] = wallets;
      return wallet;
    });
    if ('status' in result) return errorResult(result);
    return HttpResponse.json<WalletResponse>(result, { status: 201 });
  }),

  http.patch('*/api/wallets/:walletId', async ({ request, params }) => {
    const user = requireUser(request);
    if (user instanceof Response) return user;
    const body = await readJson(request);
    if (!body) return apiError(422, 'VALIDATION_ERROR', 'Informe dados de carteira válidos.');
    const walletId = String(params.walletId);
    const result = mutate((draft) => {
      const wallets = draft.wallets[user.id] ?? [];
      const wallet = wallets.find((entry) => entry.id === walletId);
      if (!wallet) return {
        status: 404, code: 'NOT_FOUND', message: 'Carteira não encontrada.',
      } satisfies HandlerError;
      if ('nickname' in body) {
        if (typeof body.nickname !== 'string' || body.nickname.trim().length < 2) return {
          status: 422,
          code: 'VALIDATION_ERROR',
          message: 'Informe um apelido válido.',
          fieldErrors: { nickname: ['Informe um apelido com pelo menos 2 caracteres.'] },
        } satisfies HandlerError;
        wallet.nickname = body.nickname.trim();
      }
      if ('address' in body) {
        if (typeof body.address !== 'string' || body.address.trim().length < 8) return {
          status: 422,
          code: 'VALIDATION_ERROR',
          message: 'Informe um endereço válido.',
          fieldErrors: { address: ['Informe um endereço válido.'] },
        } satisfies HandlerError;
        wallet.address = body.address.trim();
      }
      if ('network' in body) {
        if (typeof body.network !== 'string' || !body.network.trim()) return {
          status: 422,
          code: 'VALIDATION_ERROR',
          message: 'Selecione uma rede válida.',
          fieldErrors: { network: ['Selecione uma rede válida.'] },
        } satisfies HandlerError;
        wallet.network = body.network.trim();
      }
      if ('provider' in body) {
        if (typeof body.provider !== 'string' || !body.provider.trim()) return {
          status: 422,
          code: 'VALIDATION_ERROR',
          message: 'Selecione uma carteira válida.',
          fieldErrors: { provider: ['Selecione uma carteira válida.'] },
        } satisfies HandlerError;
        wallet.provider = body.provider.trim();
      }
      return wallet;
    });
    if ('status' in result) return errorResult(result);
    return HttpResponse.json<WalletResponse>(result);
  }),
];
