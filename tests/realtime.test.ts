import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { MarketplaceEvent, SessionResponse } from '../src/contracts/api';
import { applyMarketplaceEvent, synchronizeRealtimeSession } from '../src/api/realtime-socket';
import { queryKeys } from '../src/api/keys';
import { io } from 'socket.io-client';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

const socketDouble = {
  on: vi.fn().mockReturnThis(),
  emit: vi.fn().mockReturnThis(),
  removeAllListeners: vi.fn().mockReturnThis(),
  disconnect: vi.fn().mockReturnThis(),
  io: { removeAllListeners: vi.fn() },
};

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const sampleNft = {
  id: 'realtime-test-nft',
  name: 'Realtime test',
  description: '',
  priceEth: '0.10',
  availableQuantity: 10,
  imageUrl: '',
  collection: '',
  version: 1,
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('marketplace real-time events', () => {
  it('applies an event once and ignores duplicate IDs and older versions', () => {
    const client = createClient();
    const key = queryKeys.nftDetail(sampleNft.id);
    client.setQueryData(key, sampleNft);
    const newest: MarketplaceEvent = {
      eventId: `nft:${sampleNft.id}:v2`,
      type: 'nft.updated',
      resource: { nftId: sampleNft.id, editionId: 'default', priceEth: '0.20' },
      version: 2,
    };
    const older: MarketplaceEvent = {
      eventId: `nft:${sampleNft.id}:old`,
      type: 'nft.updated',
      resource: { nftId: sampleNft.id, editionId: 'default', priceEth: '0.01' },
      version: 1,
    };

    expect(applyMarketplaceEvent(client, newest, 'user-test')).toBe(true);
    expect(applyMarketplaceEvent(client, newest, 'user-test')).toBe(false);
    expect(applyMarketplaceEvent(client, older, 'user-test')).toBe(false);
    expect(client.getQueryData<typeof sampleNft>(key)?.priceEth).toBe('0.20');
    client.clear();
  });

  it('does not move a terminal order back to pending or the opposite terminal state', () => {
    const client = createClient();
    const key = queryKeys.order('user-test', 'order-realtime-terminal');
    client.setQueryData(key, {
      id: 'order-realtime-terminal',
      status: 'pending',
      version: 1,
      createdAt: new Date(0).toISOString(),
    });
    const rejection: MarketplaceEvent = {
      eventId: 'order:terminal:rejected',
      type: 'order.updated',
      resource: { orderId: 'order-realtime-terminal', status: 'rejected' },
      version: 2,
    };
    const downgrade: MarketplaceEvent = {
      eventId: 'order:terminal:downgrade',
      type: 'order.updated',
      resource: { orderId: 'order-realtime-terminal', status: 'confirmed' },
      version: 3,
    };

    expect(applyMarketplaceEvent(client, rejection, 'user-test')).toBe(true);
    expect(applyMarketplaceEvent(client, downgrade, 'user-test')).toBe(false);
    expect(client.getQueryData<{ status: string }>(key)?.status).toBe('rejected');
    client.clear();
  });

  it('removes socket and manager listeners when the session logs out', async () => {
    vi.stubGlobal('window', { location: { origin: 'http://localhost' } });
    vi.mocked(io).mockReturnValue(socketDouble as unknown as ReturnType<typeof io>);
    const session: SessionResponse = {
      user: {
        id: 'user-realtime',
        email: 'realtime@example.test',
        displayName: 'Realtime',
        username: 'realtime',
      },
      token: 'realtime-session-token',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const client = createClient();

    synchronizeRealtimeSession({ status: 'authenticated', session }, client);
    await vi.waitFor(() => expect(socketDouble.on).toHaveBeenCalled());
    synchronizeRealtimeSession({ status: 'anonymous' }, client);

    expect(socketDouble.removeAllListeners).toHaveBeenCalledOnce();
    expect(socketDouble.io.removeAllListeners).toHaveBeenCalledOnce();
    expect(socketDouble.disconnect).toHaveBeenCalledOnce();
    client.clear();
  });
});
