import type { MarketplaceEvent, NftUpdatedEvent, OrderUpdatedEvent } from '../contracts/api';

type EventListener = (event: MarketplaceEvent) => void;

const listeners = new Set<EventListener>();

export function subscribeToMarketplaceEvents(listener: EventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishMarketplaceEvent(event: MarketplaceEvent): void {
  listeners.forEach((listener) => listener(event));
}

export function createNftUpdatedEvent(event: Omit<NftUpdatedEvent, 'eventId' | 'type'>): NftUpdatedEvent {
  return {
    ...event,
    eventId: `nft:${event.resource.nftId}:v${event.version}`,
    type: 'nft.updated',
  };
}

export function createOrderUpdatedEvent(
  event: Omit<OrderUpdatedEvent, 'eventId' | 'type'>,
): OrderUpdatedEvent {
  return {
    ...event,
    eventId: `order:${event.resource.orderId}:v${event.version}`,
    type: 'order.updated',
  };
}
