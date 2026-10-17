import type { AxiosRequestConfig } from 'axios';
import { apiClient } from './client';
import type {
  ApiContracts,
  CartLineRequest,
  CartMergeRequest,
  CartQuantityRequest,
  ChangePasswordRequest,
  FavoriteRequest,
  LoginRequest,
  LogoutResponse,
  OrderCreateRequest,
  OrderResponse,
  ProfileResponse,
  QuoteRequest,
  RegisterRequest,
  RegisterResponse,
  SessionResponse,
  UpdateProfileRequest,
  WalletRequest,
  WalletResponse,
  WalletsResponse,
} from '../contracts/api';

type RequestOptions = Pick<AxiosRequestConfig, 'headers' | 'signal'>;
export interface NftListParams {
  q?: string;
  collection?: string;
  network?: string;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}

export const authApi = {
  register: (request: RegisterRequest, options?: RequestOptions) => apiClient
    .post<RegisterResponse>('/auth/register', request, options)
    .then(({ data }) => data),
  login: (request: LoginRequest, options?: RequestOptions) => apiClient
    .post<SessionResponse>('/auth/login', request, options)
    .then(({ data }) => data),
  session: (options?: RequestOptions) => apiClient
    .get<ApiContracts['session']['response']>('/auth/session', options)
    .then(({ data }) => data),
  logout: (options?: RequestOptions) => apiClient
    .post<LogoutResponse>('/auth/logout', undefined, options)
    .then(({ data }) => data),
};

export const nftApi = {
  list: (params: NftListParams, options?: RequestOptions) => apiClient
    .get<ApiContracts['listNfts']['response']>('/nfts', { ...options, params })
    .then(({ data }) => data),
  detail: (nftId: string, options?: RequestOptions) => apiClient
    .get<ApiContracts['getNft']['response']>(`/nfts/${encodeURIComponent(nftId)}`, options)
    .then(({ data }) => data),
};

export const favoritesApi = {
  list: (options?: RequestOptions) => apiClient
    .get<ApiContracts['favorites']['response']>('/favorites', options)
    .then(({ data }) => data),
  add: ({ nftId }: FavoriteRequest, options?: RequestOptions) => apiClient
    .put<ApiContracts['favorite']['response']>(`/favorites/${encodeURIComponent(nftId)}`, undefined, options)
    .then(({ data }) => data),
  remove: ({ nftId }: FavoriteRequest, options?: RequestOptions) => apiClient
    .delete<ApiContracts['favorite']['response']>(`/favorites/${encodeURIComponent(nftId)}`, options)
    .then(({ data }) => data),
};

export const cartApi = {
  get: (options?: RequestOptions) => apiClient
    .get<ApiContracts['cart']['response']>('/cart', options)
    .then(({ data }) => data),
  getVisitor: (visitorId: string, options?: RequestOptions) => apiClient
    .get<ApiContracts['getVisitorCart']['response']>(`/cart/visitor/${encodeURIComponent(visitorId)}`, options)
    .then(({ data }) => data),
  addVisitorItem: (visitorId: string, request: CartLineRequest, options?: RequestOptions) => apiClient
    .post<ApiContracts['visitorCart']['response']>(`/cart/visitor/${encodeURIComponent(visitorId)}/items`, request, options)
    .then(({ data }) => data),
  updateVisitorItem: (
    visitorId: string,
    nftId: string,
    editionId: string,
    request: CartQuantityRequest,
    options?: RequestOptions,
  ) => apiClient
    .patch<ApiContracts['visitorCart']['response']>(
      `/cart/visitor/${encodeURIComponent(visitorId)}/items/${encodeURIComponent(nftId)}/${encodeURIComponent(editionId)}`,
      request,
      options,
    )
    .then(({ data }) => data),
  removeVisitorItem: (visitorId: string, nftId: string, editionId: string, options?: RequestOptions) => apiClient
    .delete<ApiContracts['visitorCart']['response']>(
      `/cart/visitor/${encodeURIComponent(visitorId)}/items/${encodeURIComponent(nftId)}/${encodeURIComponent(editionId)}`,
      options,
    )
    .then(({ data }) => data),
  addItem: (request: CartLineRequest, options?: RequestOptions) => apiClient
    .post<ApiContracts['cart']['response']>('/cart/items', request, options)
    .then(({ data }) => data),
  updateItem: (
    nftId: string,
    editionId: string,
    request: CartQuantityRequest,
    options?: RequestOptions,
  ) => apiClient
    .patch<ApiContracts['cart']['response']>(
      `/cart/items/${encodeURIComponent(nftId)}/${encodeURIComponent(editionId)}`,
      request,
      options,
    )
    .then(({ data }) => data),
  removeItem: (nftId: string, editionId: string, options?: RequestOptions) => apiClient
    .delete<ApiContracts['cart']['response']>(
      `/cart/items/${encodeURIComponent(nftId)}/${encodeURIComponent(editionId)}`,
      options,
    )
    .then(({ data }) => data),
  mergeVisitor: (request: CartMergeRequest, options?: RequestOptions) => apiClient
    .post<ApiContracts['cartMerge']['response']>('/cart/merge', request, options)
    .then(({ data }) => data),
};

export const quoteApi = {
  create: (request: QuoteRequest, options?: RequestOptions) => apiClient
    .post<ApiContracts['quote']['response']>('/quotes', request, options)
    .then(({ data }) => data),
};

export const orderApi = {
  create: (request: OrderCreateRequest, idempotencyKey: string, options?: RequestOptions) => apiClient
    .post<OrderResponse>('/orders', request, {
      ...options,
      headers: { ...options?.headers, 'Idempotency-Key': idempotencyKey },
    })
    .then(({ data }) => data),
  get: (orderId: string, options?: RequestOptions) => apiClient
    .get<ApiContracts['getOrder']['response']>(`/orders/${encodeURIComponent(orderId)}`, options)
    .then(({ data }) => data),
};

export const profileApi = {
  get: (options?: RequestOptions) => apiClient
    .get<ProfileResponse>('/profile', options)
    .then(({ data }) => data),
  update: (request: UpdateProfileRequest, options?: RequestOptions) => apiClient
    .patch<ProfileResponse>('/profile', request, options)
    .then(({ data }) => data),
  changePassword: (request: ChangePasswordRequest, options?: RequestOptions) => apiClient
    .put<ApiContracts['changePassword']['response']>('/profile/password', request, options)
    .then(({ data }) => data),
};

export const walletsApi = {
  list: (options?: RequestOptions) => apiClient
    .get<WalletsResponse>('/wallets', options)
    .then(({ data }) => data),
  create: (request: WalletRequest, options?: RequestOptions) => apiClient
    .post<WalletResponse>('/wallets', request, options)
    .then(({ data }) => data),
  update: (
    walletId: string,
    request: Partial<WalletRequest>,
    options?: RequestOptions,
  ) => apiClient
    .patch<WalletResponse>(`/wallets/${encodeURIComponent(walletId)}`, request, options)
    .then(({ data }) => data),
};
