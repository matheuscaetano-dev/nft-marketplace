import { mockNFTs } from '../data';
import { parseEth } from '../../lib/money';
import { createNftUpdatedEvent, publishMarketplaceEvent } from '../eventBus';
import type { MockDatabaseState, MockScenarioSeed } from './types';

export const MOCK_DB_STORAGE_KEY = 'kurio-marketplace-mock-db-v1';
const DEFAULT_SESSION_DURATION_MS = 60 * 60 * 1000;

function toAccountSeed(
  id: string,
  email: string,
  displayName: string,
  username: string,
  salt: string,
  passwordHash: string,
) {
  return { id, email, displayName, username, passwordSalt: salt, passwordHash };
}

function createSeedState(seed: MockScenarioSeed = 'default'): MockDatabaseState {
  const users = {
    'user-ada': toAccountSeed(
      'user-ada',
      'ada@kurio.test',
      'Ada Colecionadora',
      'ada-coleciona',
      'seed-salt-ada-v1',
      'f9f3411cd7073c025d66f2eadace4810c36467589c749315b30e827e7d138684',
    ),
    'user-bruno': toAccountSeed(
      'user-bruno',
      'bruno@kurio.test',
      'Bruno Artista',
      'bruno-artista',
      'seed-salt-bruno-v1',
      'e9fbfa8ef35db29eac91923d16f331be00c0df289ae9f1e237fd96e048d01691',
    ),
  };
  const nfts = seed === 'empty'
    ? {}
    : Object.fromEntries(mockNFTs.map((nft) => [
      nft.id,
      {
        ...structuredClone(nft),
        version: 1,
        editions: [{
          id: 'default',
          label: nft.edition ?? '1/50',
          priceEth: nft.priceEth,
          availableQuantity: nft.availableQuantity,
        }],
      },
    ]));
  const ada = users['user-ada'];
  const bruno = users['user-bruno'];
  return {
    schemaVersion: 1,
    nextId: 1,
    users,
    sessions: {},
    nfts,
    favorites: {
      'user-ada': ['7'],
      'user-bruno': ['2', '8'],
    },
    carts: {
      'user-ada': { items: [], version: 1 },
      'user-bruno': { items: [], version: 1 },
    },
    visitorCarts: {},
    orders: {},
    idempotency: {},
    profiles: {
      'user-ada': {
        displayName: ada.displayName,
        username: ada.username,
        email: ada.email,
        ensName: 'ada.kurio.eth',
      },
      'user-bruno': {
        displayName: bruno.displayName,
        username: bruno.username,
        email: bruno.email,
        ensName: 'bruno.kurio.eth',
      },
    },
    wallets: {
      'user-ada': [
        {
          id: 'wallet-ada-primary',
          nickname: 'Principal',
          address: '0xA11CE0000000000000000000000000000000A001',
          network: 'Ethereum',
          provider: 'MetaMask',
          role: 'primary',
        },
        {
          id: 'wallet-ada-secondary',
          nickname: 'Reserva',
          address: '0xA11CE0000000000000000000000000000000A002',
          network: 'Polygon',
          provider: 'WalletConnect',
          role: 'secondary',
        },
      ],
      'user-bruno': [
        {
          id: 'wallet-bruno-primary',
          nickname: 'Ateliê',
          address: '0xB2B000000000000000000000000000000000B001',
          network: 'Polygon',
          provider: 'Coinbase Wallet',
          role: 'primary',
        },
      ],
    },
    coupons: {
      KURIO10: {
        code: 'KURIO10',
        discountBasisPoints: 1000,
        expiresAt: '2030-01-01T00:00:00.000Z',
        redemptionLimit: 100,
        redemptionCount: 0,
      },
      EXPIRED: {
        code: 'EXPIRED',
        discountBasisPoints: 1500,
        expiresAt: '2020-01-01T00:00:00.000Z',
        redemptionLimit: 100,
        redemptionCount: 0,
      },
    },
    quotes: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPersistedState(value: unknown): value is MockDatabaseState {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.nextId !== 'number') {
    return false;
  }

  return [
    'users',
    'sessions',
    'nfts',
    'favorites',
    'carts',
    'visitorCarts',
    'orders',
    'idempotency',
    'profiles',
    'wallets',
    'coupons',
    'quotes',
  ].every((key) => isRecord(value[key]));
}

function loadPersistedState(): MockDatabaseState | undefined {
  if (typeof localStorage === 'undefined') {
    return undefined;
  }

  try {
    const persisted = localStorage.getItem(MOCK_DB_STORAGE_KEY);
    if (!persisted) {
      return undefined;
    }
    const parsed: unknown = JSON.parse(persisted);
    if (!isPersistedState(parsed)) {
      throw new Error('Mock database schema is invalid or unsupported.');
    }
    return parsed;
  } catch (error) {
    console.error('Could not restore the MSW mock database; reset the mock state to recover.', error);
    return undefined;
  }
}

let database = loadPersistedState() ?? createSeedState();

function persistState(state: MockDatabaseState) {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(MOCK_DB_STORAGE_KEY, JSON.stringify(state));
}

export function getDb(): Readonly<MockDatabaseState> {
  return database;
}

export function mutate<T>(operation: (draft: MockDatabaseState) => T): T {
  const draft = structuredClone(database);
  const result = operation(draft);
  persistState(draft);
  database = draft;
  return structuredClone(result);
}

export function resetDb(seed: MockScenarioSeed = 'default'): MockDatabaseState {
  const nextState = createSeedState(seed);
  persistState(nextState);
  database = nextState;
  return structuredClone(database);
}

export function createId(prefix: string): string {
  return mutate((draft) => {
    const id = `${prefix}-${draft.nextId}`;
    draft.nextId += 1;
    return id;
  });
}

export function defaultSessionExpiresAt(): number {
  return Date.now() + DEFAULT_SESSION_DURATION_MS;
}

export function updateNftListing(
  nftId: string,
  updates: { editionId?: string; priceEth?: string; availableQuantity?: number },
) {
  if (updates.priceEth !== undefined && parseEth(updates.priceEth).isNegative()) {
    throw new RangeError('NFT price cannot be negative.');
  }
  if (updates.availableQuantity !== undefined
    && (!Number.isSafeInteger(updates.availableQuantity) || updates.availableQuantity < 0)) {
    throw new RangeError('NFT availability must be a non-negative integer.');
  }

  const updatedNft = mutate((draft) => {
    const nft = draft.nfts[nftId];
    if (!nft) {
      throw new Error(`NFT ${nftId} does not exist.`);
    }
    const edition = updates.editionId
      ? nft.editions.find((entry) => entry.id === updates.editionId)
      : nft.editions[0];
    if (!edition) {
      throw new Error(`Edition ${updates.editionId} does not exist for NFT ${nftId}.`);
    }
    if (updates.priceEth !== undefined) edition.priceEth = updates.priceEth;
    if (updates.availableQuantity !== undefined) {
      edition.availableQuantity = updates.availableQuantity;
    }
    nft.priceEth = nft.editions[0].priceEth;
    nft.availableQuantity = nft.editions
      .reduce((total, currentEdition) => total + currentEdition.availableQuantity, 0);
    nft.version += 1;
    return nft;
  });
  const edition = updatedNft.editions.find((entry) => entry.id === updates.editionId)
    ?? updatedNft.editions[0];
  if (edition) {
    publishMarketplaceEvent(createNftUpdatedEvent({
      resource: {
        nftId,
        editionId: edition.id,
        priceEth: edition.priceEth,
        availableQuantity: updatedNft.availableQuantity,
        editionAvailableQuantity: edition.availableQuantity,
      },
      version: updatedNft.version,
    }));
  }
  return updatedNft;
}
