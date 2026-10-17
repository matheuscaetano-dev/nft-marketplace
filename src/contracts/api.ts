import type { NFT, PaginatedResponse } from '../types';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'SESSION_INVALID'
  | 'SESSION_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'AVAILABILITY_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'ACCOUNT_CONFLICT'
  | 'QUOTE_STALE'
  | 'COUPON_INVALID'
  | 'COUPON_EXPIRED'
  | 'TRANSIENT_FAILURE'
  | 'PAYMENT_REJECTED';

export interface ApiErrorResponse {
  code: ApiErrorCode;
  message: string;
  fieldErrors?: Record<string, string[]>;
  details?: Record<string, unknown>;
}

export interface AccountSummary {
  id: string;
  email: string;
  displayName: string;
  username: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  username: string;
  visitorId?: string;
}

export interface RegisterResponse {
  user: AccountSummary;
  session: SessionResponse;
}

export interface LoginRequest {
  email: string;
  password: string;
  visitorId?: string;
}

export interface SessionResponse {
  user: AccountSummary;
  token: string;
  expiresAt: string;
}

export interface SessionRequest {
  token?: string;
}

export interface LogoutResponse {
  loggedOut: true;
}

export interface ExpireSessionResponse {
  expired: true;
}

export interface FavoritesResponse {
  nftIds: string[];
}

export interface FavoriteRequest {
  nftId: string;
}

export interface CartLineRequest {
  nftId: string;
  editionId: string;
  quantity: number;
}

export interface CartQuantityRequest {
  quantity: number;
}

export interface CartLineResponse extends CartLineRequest {
  nft: NFT;
  availableQuantity: number;
}

export interface CartResponse {
  items: CartLineResponse[];
  version: number;
}

export interface CartMergeRequest {
  visitorId: string;
  items: CartLineRequest[];
}

export type CouponStatus = 'not-applied' | 'applied' | 'invalid' | 'expired';

export interface QuoteRequest {
  items: CartLineRequest[];
  couponCode?: string;
}

export interface QuoteItemAvailability {
  nftId: string;
  editionId: string;
  requestedQuantity: number;
  availableQuantity: number;
  available: boolean;
  unitPriceEth: string;
  nftVersion: number;
}

export interface QuoteResponse {
  quoteId: string;
  version: number;
  items: QuoteItemAvailability[];
  subtotalEth: string;
  discountEth: string;
  networkFeeEth: string;
  totalEth: string;
  couponStatus: CouponStatus;
  couponCode?: string;
  validUntil: string;
}

export type OrderStatus = 'pending' | 'confirmed' | 'rejected';

export interface OrderCreateRequest {
  quoteId: string;
  items: CartLineRequest[];
  walletId: string;
  network: string;
}

export interface ReceiptItemSnapshot {
  nftId: string;
  editionId: string;
  name: string;
  imageUrl: string;
  quantity: number;
  unitPriceEth: string;
  totalPriceEth: string;
}

export interface OrderReceipt {
  orderId: string;
  transactionReference: string;
  explorerUrl: string;
  items: ReceiptItemSnapshot[];
  subtotalEth: string;
  discountEth: string;
  networkFeeEth: string;
  totalEth: string;
  network: string;
  createdAt: string;
}

export interface OrderResponse {
  id: string;
  status: OrderStatus;
  version: number;
  createdAt: string;
  receipt?: OrderReceipt;
  rejectionReason?: string;
}

export interface ProfileResponse {
  displayName: string;
  username: string;
  email: string;
  ensName: string;
  avatarDataUrl?: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
  username?: string;
  email?: string;
  ensName?: string;
  avatarDataUrl?: string | null;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  changed: true;
}

export type WalletRole = 'primary' | 'secondary';

export interface WalletRequest {
  nickname: string;
  address: string;
  network: string;
  provider: string;
  role: WalletRole;
}

export interface WalletResponse extends WalletRequest {
  id: string;
}

export interface WalletsResponse {
  wallets: WalletResponse[];
}

export interface NftUpdatedEvent {
  eventId: string;
  type: 'nft.updated';
  resource: {
    nftId: string;
    editionId?: string;
    priceEth?: string;
    availableQuantity?: number;
    editionAvailableQuantity?: number;
  };
  version: number;
}

export interface OrderUpdatedEvent {
  eventId: string;
  type: 'order.updated';
  resource: {
    orderId: string;
    status: OrderStatus;
    rejectionReason?: string;
  };
  version: number;
}

export type MarketplaceEvent = NftUpdatedEvent | OrderUpdatedEvent;

export interface ApiContracts {
  listNfts: {
    request: URLSearchParams;
    response: PaginatedResponse<NFT>;
  };
  getNft: {
    request: { nftId: string };
    response: NFT;
  };
  register: { request: RegisterRequest; response: RegisterResponse };
  login: { request: LoginRequest; response: SessionResponse };
  session: { request: SessionRequest; response: SessionResponse };
  logout: { request: SessionRequest; response: LogoutResponse };
  expireSession: { request: SessionRequest; response: ExpireSessionResponse };
  favorites: { response: FavoritesResponse };
  favorite: { request: FavoriteRequest; response: FavoritesResponse };
  cart: { response: CartResponse };
  cartLine: { request: CartLineRequest | CartQuantityRequest; response: CartResponse };
  visitorCart: { request: CartLineRequest; response: CartResponse };
  getVisitorCart: { request: { visitorId: string }; response: CartResponse };
  cartMerge: { request: CartMergeRequest; response: CartResponse };
  quote: { request: QuoteRequest; response: QuoteResponse };
  createOrder: { request: OrderCreateRequest; response: OrderResponse };
  getOrder: { request: { orderId: string }; response: OrderResponse };
  profile: { response: ProfileResponse };
  updateProfile: { request: UpdateProfileRequest; response: ProfileResponse };
  changePassword: {
    request: ChangePasswordRequest;
    response: ChangePasswordResponse;
  };
  wallets: { response: WalletsResponse };
  wallet: { request: WalletRequest; response: WalletResponse };
  updateWallet: {
    request: Partial<WalletRequest>;
    response: WalletResponse;
  };
}
