import { useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Socket } from 'socket.io-client';
import type { MarketplaceEvent, SessionResponse } from '../contracts/api';
import type { NFT, PaginatedResponse } from '../types';
import type { CartResponse, OrderResponse } from '../contracts/api';
import { queryKeys } from './keys';
import type { SessionState } from './session-store';

interface ServerToClientEvents {
  'marketplace.event': (event: MarketplaceEvent) => void;
}

interface ClientToServerEvents {
  authenticate: (token: string) => void;
}

type MarketplaceSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface RealtimeNotice {
  id: string;
  nftId: string;
  message: string;
}

const noticeListeners = new Set<() => void>();
const seenEventIds = new Set<string>();
const resourceVersions = new Map<string, number>();
const terminalOrders = new Set<string>();
let notice: RealtimeNotice | undefined;
let socket: MarketplaceSocket | undefined;
let activeUserId: string | undefined;
let activeToken: string | undefined;
let generation = 0;
let socketLoading = false;

function publishNotice(nextNotice: RealtimeNotice | undefined) {
  notice = nextNotice;
  noticeListeners.forEach((listener) => listener());
}

export function subscribeRealtimeNotice(listener: () => void): () => void {
  noticeListeners.add(listener);
  return () => noticeListeners.delete(listener);
}

export function getRealtimeNotice(): RealtimeNotice | undefined {
  return notice;
}

export function acknowledgeRealtimeNotice(eventId: string): void {
  if (notice?.id === eventId) publishNotice(undefined);
}

export function useRealtimeNotice(): RealtimeNotice | undefined {
  return useSyncExternalStore(subscribeRealtimeNotice, getRealtimeNotice, getRealtimeNotice);
}

function cachedNftVersion(client: QueryClient, nftId: string): number {
  const detail = client.getQueryData<NFT>(queryKeys.nftDetail(nftId))?.version ?? 0;
  const listings = client.getQueriesData<PaginatedResponse<NFT>>({ queryKey: ['nfts'] });
  const catalogVersion = Math.max(0, ...listings.flatMap(([, data]) => (
    data?.data.filter((nft) => nft.id === nftId).map((nft) => nft.version ?? 0) ?? []
  )));
  const carts = activeUserId
    ? client.getQueriesData<CartResponse>({ queryKey: queryKeys.cart(activeUserId) })
    : [];
  const cartVersion = Math.max(0, ...carts.flatMap(([, data]) => (
    data?.items.filter((item) => item.nft.id === nftId).map((item) => item.nft.version ?? 0) ?? []
  )));
  return Math.max(detail, catalogVersion, cartVersion);
}

function applyNftUpdate(client: QueryClient, event: Extract<MarketplaceEvent, { type: 'nft.updated' }>) {
  const { nftId, editionId, priceEth, availableQuantity, editionAvailableQuantity } = event.resource;
  const currentCart = activeUserId
    ? client.getQueryData<CartResponse>(queryKeys.cart(activeUserId))
    : undefined;
  const cartItem = currentCart?.items.find((item) => item.nft.id === nftId);
  const previousPrice = cartItem?.nft.editions?.find((edition) => edition.id === editionId)?.priceEth
    ?? cartItem?.nft.priceEth;
  const previousAvailability = cartItem?.availableQuantity;
  const updatedAvailability = editionAvailableQuantity ?? availableQuantity;
  const nftName = cartItem?.nft.name ?? nftId;

  const updateNft = (nft: NFT): NFT => {
    if (nft.id !== nftId) return nft;
    const updatedEditions = nft.editions
      ? nft.editions.map((edition) => (
        edition.id !== editionId
          ? edition
          : {
            ...edition,
            ...(priceEth !== undefined ? { priceEth } : {}),
            ...(editionAvailableQuantity !== undefined
              ? { availableQuantity: editionAvailableQuantity }
              : {}),
          }
      ))
      : undefined;
    return {
      ...nft,
      ...(priceEth !== undefined && (!editionId || editionId === 'default') ? { priceEth } : {}),
      ...(availableQuantity !== undefined ? { availableQuantity } : {}),
      version: event.version,
      ...(updatedEditions ? { editions: updatedEditions } : {}),
    };
  };

  client.setQueriesData<PaginatedResponse<NFT>>({ queryKey: ['nfts'] }, (current) => (
    current ? { ...current, data: current.data.map(updateNft) } : current
  ));
  client.setQueryData<NFT>(queryKeys.nftDetail(nftId), (current) => current ? updateNft(current) : current);
  if (activeUserId) {
    client.setQueryData<CartResponse>(queryKeys.cart(activeUserId), (current) => current ? {
      ...current,
      items: current.items.map((item) => item.nft.id !== nftId
        ? item
        : {
          ...item,
          nft: updateNft(item.nft),
          ...(editionId && item.editionId === editionId && editionAvailableQuantity !== undefined
            ? { availableQuantity: editionAvailableQuantity }
            : availableQuantity !== undefined ? { availableQuantity } : {}),
        }),
    } : current);
    void client.invalidateQueries({ queryKey: queryKeys.quotePrefix(activeUserId) });
    void client.invalidateQueries({ queryKey: queryKeys.cart(activeUserId) });
  }

  if (cartItem) {
    const changes = [
      priceEth !== undefined && priceEth !== previousPrice ? `preço atualizado para ${priceEth} ETH` : '',
      updatedAvailability !== undefined && updatedAvailability !== previousAvailability
        ? `disponibilidade atualizada para ${updatedAvailability}` : '',
    ].filter(Boolean);
    if (changes.length) {
      publishNotice({
        id: event.eventId,
        nftId,
        message: `${nftName}: ${changes.join(' e ')}.`,
      });
    }
  }
}

export function applyMarketplaceEvent(
  client: QueryClient,
  event: MarketplaceEvent,
  userId: string,
): boolean {
  if (seenEventIds.has(event.eventId)) return false;

  const resourceKey = event.type === 'nft.updated'
    ? `nft:${event.resource.nftId}`
    : `order:${event.resource.orderId}`;
  const currentVersion = event.type === 'nft.updated'
    ? Math.max(resourceVersions.get(resourceKey) ?? 0, cachedNftVersion(client, event.resource.nftId))
    : Math.max(
      resourceVersions.get(resourceKey) ?? 0,
      client.getQueryData<OrderResponse>(queryKeys.order(userId, event.resource.orderId))?.version ?? 0,
    );

  if (event.version <= currentVersion) {
    seenEventIds.add(event.eventId);
    return false;
  }

  if (event.type === 'order.updated'
    && (terminalOrders.has(event.resource.orderId)
      || ['confirmed', 'rejected'].includes(
        client.getQueryData<OrderResponse>(queryKeys.order(userId, event.resource.orderId))?.status ?? '',
      ))) {
    terminalOrders.add(event.resource.orderId);
    seenEventIds.add(event.eventId);
    return false;
  }

  seenEventIds.add(event.eventId);
  resourceVersions.set(resourceKey, event.version);
  if (seenEventIds.size > 1_000) {
    const oldest = seenEventIds.values().next().value;
    if (oldest) seenEventIds.delete(oldest);
  }

  if (event.type === 'nft.updated') {
    applyNftUpdate(client, event);
  } else {
    const key = queryKeys.order(userId, event.resource.orderId);
    client.setQueryData<OrderResponse>(key, (current) => current ? {
      ...current,
      status: event.resource.status,
      version: event.version,
      ...(event.resource.rejectionReason
        ? { rejectionReason: event.resource.rejectionReason }
        : {}),
    } : current);
    if (event.resource.status !== 'pending') terminalOrders.add(event.resource.orderId);
    void client.invalidateQueries({ queryKey: key, exact: true });
  }
  return true;
}

function clearSocketListeners(current: MarketplaceSocket) {
  current.removeAllListeners();
  current.io.removeAllListeners();
  current.disconnect();
}

function reconcileActiveQueries(client: QueryClient, userId: string) {
  void client.invalidateQueries({ queryKey: ['nfts'] });
  void client.invalidateQueries({ queryKey: ['nft'] });
  void client.invalidateQueries({ queryKey: queryKeys.cart(userId) });
  void client.invalidateQueries({ queryKey: queryKeys.quotePrefix(userId) });
  void client.invalidateQueries({
    queryKey: ['private', userId, 'order'],
    predicate: (query) => {
      const data: unknown = query.state.data;
      return typeof data === 'object' && data !== null && 'status' in data && data.status === 'pending';
    },
  });
}

export function synchronizeRealtimeSession(
  state: SessionState,
  client: QueryClient,
): void {
  const session: SessionResponse | undefined = state.status === 'authenticated' ? state.session : undefined;
  const userId = session?.user.id;
  const token = session?.token;
  if (!userId || !token) {
    if (socket) clearSocketListeners(socket);
    socket = undefined;
    socketLoading = false;
    activeUserId = undefined;
    activeToken = undefined;
    generation += 1;
    seenEventIds.clear();
    resourceVersions.clear();
    terminalOrders.clear();
    publishNotice(undefined);
    return;
  }
  if (activeUserId === userId && activeToken === token && (socket || socketLoading)) return;
  if (socket) clearSocketListeners(socket);
  generation += 1;
  const currentGeneration = generation;
  activeUserId = userId;
  activeToken = token;
  socketLoading = true;
  seenEventIds.clear();
  resourceVersions.clear();
  terminalOrders.clear();
  void import('socket.io-client').then(({ io }) => {
    socketLoading = false;
    if (generation !== currentGeneration || activeUserId !== userId) return;
    const currentSocket: MarketplaceSocket = io(
      window.location.origin,
      { path: '/socket.io/', transports: ['websocket'] },
    ) as MarketplaceSocket;
    socket = currentSocket;
    let hasConnected = false;

    currentSocket.on('connect', () => {
      if (generation !== currentGeneration || activeUserId !== userId) return;
      currentSocket.emit('authenticate', token);
      if (hasConnected) reconcileActiveQueries(client, userId);
      hasConnected = true;
    });
    currentSocket.on('marketplace.event', (event) => {
      if (generation !== currentGeneration || activeUserId !== userId) return;
      applyMarketplaceEvent(client, event, userId);
    });
  }).catch((error: unknown) => {
    socketLoading = false;
    if (generation === currentGeneration && activeUserId === userId) {
      console.error('Could not initialize the marketplace real-time connection.', error);
    }
  });
}
