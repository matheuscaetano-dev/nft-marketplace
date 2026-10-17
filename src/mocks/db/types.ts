import type {
  AccountSummary,
  CartLineRequest,
  OrderCreateRequest,
  OrderResponse,
  ProfileResponse,
  QuoteResponse,
  WalletResponse,
} from '../../contracts/api';
import type { NFT } from '../../types';

export interface MockUser extends AccountSummary {
  passwordSalt: string;
  passwordHash: string;
}

export interface MockSession {
  userId: string;
  expiresAt: number;
}

export interface MockNftEdition {
  id: string;
  label: string;
  priceEth: string;
  availableQuantity: number;
}

export interface MockNftRecord extends NFT {
  version: number;
  editions: MockNftEdition[];
}

export interface MockCart {
  items: CartLineRequest[];
  version: number;
}

export interface MockCoupon {
  code: string;
  discountBasisPoints: number;
  expiresAt: string;
  redemptionLimit: number;
  redemptionCount: number;
}

export interface StoredQuote {
  userId: string;
  request: CartLineRequest[];
  response: QuoteResponse;
  couponCode?: string;
}

export interface StoredOrder extends OrderResponse {
  userId: string;
  requestFingerprint: string;
  idempotencyKey: string;
  request?: OrderCreateRequest;
}

export interface IdempotencyRecord {
  userId: string;
  fingerprint: string;
  orderId: string;
}

export interface MockDatabaseState {
  schemaVersion: 1;
  nextId: number;
  users: Record<string, MockUser>;
  sessions: Record<string, MockSession>;
  nfts: Record<string, MockNftRecord>;
  favorites: Record<string, string[]>;
  carts: Record<string, MockCart>;
  visitorCarts: Record<string, MockCart>;
  orders: Record<string, StoredOrder>;
  idempotency: Record<string, IdempotencyRecord>;
  profiles: Record<string, ProfileResponse>;
  wallets: Record<string, WalletResponse[]>;
  coupons: Record<string, MockCoupon>;
  quotes: Record<string, StoredQuote>;
}

export type MockScenarioSeed = 'default' | 'empty';
