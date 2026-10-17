import type { QuoteRequest } from '../contracts/api';

export const queryKeys = {
  nftList: <T extends object>(params: T) =>
    ['nfts', params] as const,
  nftDetail: (nftId: string) => ['nft', nftId] as const,
  favorites: (userId: string) => ['private', userId, 'favorites'] as const,
  cart: (userId: string) => ['private', userId, 'cart'] as const,
  quote: (userId: string, request: QuoteRequest) =>
    ['private', userId, 'quote', request] as const,
  quotePrefix: (userId: string) => ['private', userId, 'quote'] as const,
  order: (userId: string, orderId: string) =>
    ['private', userId, 'order', orderId] as const,
  profile: (userId: string) => ['private', userId, 'profile'] as const,
  wallets: (userId: string) => ['private', userId, 'wallets'] as const,
  session: ['session'] as const,
};
