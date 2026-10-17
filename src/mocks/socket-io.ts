import { toSocketIo } from '@mswjs/socket.io-binding';
import { ws } from 'msw';
import type { WebSocketClientConnectionProtocol } from '@mswjs/interceptors/WebSocket';
import { getDb } from './db';
import { subscribeToMarketplaceEvents } from './eventBus';

const socketOrigin = typeof self === 'undefined' ? 'ws://localhost' : self.location.origin.replace(/^http/, 'ws');
const socketLink = ws.link(socketOrigin);
const openConnections = new Map<WebSocketClientConnectionProtocol, string | undefined>();

const socketHandler = socketLink.addEventListener('connection', (connection) => {
  const { client } = connection;
  const socket = toSocketIo(connection);
  openConnections.set(socket.rawClient, undefined);
  let userId: string | undefined;
  const unsubscribe = subscribeToMarketplaceEvents((event) => {
    if (!userId) return;
    if (event.type === 'order.updated' && getDb().orders[event.resource.orderId]?.userId !== userId) return;
    socket.client.emit('marketplace.event', event);
  });

  socket.client.on('authenticate', (_message, token: unknown) => {
    if (typeof token !== 'string') return;
    const session = getDb().sessions[token];
    if (!session || session.expiresAt <= Date.now()) return;
    userId = session.userId;
    openConnections.set(socket.rawClient, userId);
  });

  client.addEventListener('close', () => {
    unsubscribe();
    openConnections.delete(socket.rawClient);
  });
});

export function disconnectMockSockets(): void {
  openConnections.forEach((_userId, connection) => connection.close());
}

export function mockSocketConnectionCount(userId?: string): number {
  return [...openConnections.values()].filter((connectedUserId) => (
    userId ? connectedUserId === userId : connectedUserId !== undefined
  )).length;
}

export const socketHandlers = [socketHandler];
