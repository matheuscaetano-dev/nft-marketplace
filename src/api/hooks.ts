import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationOptions } from '@tanstack/react-query';
import type {
  CartLineRequest,
  CartMergeRequest,
  FavoritesResponse,
  OrderCreateRequest,
  OrderResponse,
  QuoteRequest,
  UpdateProfileRequest,
  WalletRequest,
} from '../contracts/api';
import type { PaginatedResponse, NFT } from '../types';
import { queryKeys } from './keys';
import {
  cartApi,
  favoritesApi,
  nftApi,
  orderApi,
  profileApi,
  quoteApi,
  walletsApi,
} from './resources';
import { useSession } from './session';
import { acceptSession, getSessionState } from './session-store';

export type NftListParams = Parameters<typeof nftApi.list>[0];

export function useNftList(params: NftListParams) {
  return useQuery<PaginatedResponse<NFT>>({
    queryKey: queryKeys.nftList(params),
    queryFn: ({ signal }) => nftApi.list(params, { signal }),
    placeholderData: (previousData) => previousData,
  });
}

export function useNftDetail(nftId: string) {
  return useQuery({
    queryKey: queryKeys.nftDetail(nftId),
    queryFn: ({ signal }) => nftApi.detail(nftId, { signal }),
    enabled: Boolean(nftId),
  });
}

export function useFavorites() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  return useQuery({
    queryKey: queryKeys.favorites(userId),
    queryFn: ({ signal }) => favoritesApi.list({ signal }),
    enabled: Boolean(userId),
    staleTime: 0,
  });
}

export type FavoriteMutation = { nftId: string; action: 'add' | 'remove' };

interface FavoriteMutationContext {
  userId: string;
  hadPrevious: boolean;
  previous?: { nftIds: string[] };
}

function isCurrentUser(userId: string): boolean {
  return getSessionState().session?.user.id === userId;
}

export function createFavoriteMutationOptions(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
): UseMutationOptions<FavoritesResponse, Error, FavoriteMutation, FavoriteMutationContext> {
  const queryKey = queryKeys.favorites(userId);
  return {
    mutationFn: ({ nftId, action }: FavoriteMutation) => (
      action === 'add' ? favoritesApi.add({ nftId }) : favoritesApi.remove({ nftId })
    ),
    onMutate: async ({ nftId, action }): Promise<FavoriteMutationContext> => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<{ nftIds: string[] }>(queryKey);
      const hadPrevious = queryClient.getQueryState(queryKey) !== undefined;
      queryClient.setQueryData<{ nftIds: string[] }>(queryKey, (current) => {
        const nftIds = current?.nftIds ?? [];
        return {
          nftIds: action === 'add'
            ? nftIds.includes(nftId) ? nftIds : [...nftIds, nftId]
            : nftIds.filter((id) => id !== nftId),
        };
      });
      return { userId, hadPrevious, ...(previous ? { previous } : {}) };
    },
    onError: (_error, _variables, context) => {
      if (!context || !isCurrentUser(context.userId)) return;
      if (context.hadPrevious && context.previous) {
        queryClient.setQueryData(queryKeys.favorites(context.userId), context.previous);
      } else {
        queryClient.removeQueries({ queryKey: queryKeys.favorites(context.userId), exact: true });
      }
    },
    onSettled: (_data, _error, _variables, context) => {
      if (context) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.favorites(context.userId) });
      }
    },
  };
}

export function useFavoriteMutation() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useMutation(createFavoriteMutationOptions(queryClient, userId));
}

export function useCart() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  return useQuery({
    queryKey: queryKeys.cart(userId),
    queryFn: ({ signal }) => cartApi.get({ signal }),
    enabled: Boolean(userId),
    staleTime: 0,
  });
}

function invalidateCartResources(userId: string, queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.cart(userId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.quotePrefix(userId) });
}

export function useCartMutations() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  const add = useMutation({
    mutationFn: (line: CartLineRequest) => cartApi.addItem(line),
    onSuccess: () => invalidateCartResources(userId, queryClient),
  });
  const update = useMutation({
    mutationFn: (input: { nftId: string; editionId: string; quantity: number }) => (
      cartApi.updateItem(input.nftId, input.editionId, { quantity: input.quantity })
    ),
    onSuccess: () => invalidateCartResources(userId, queryClient),
  });
  const remove = useMutation({
    mutationFn: (input: { nftId: string; editionId: string }) => (
      cartApi.removeItem(input.nftId, input.editionId)
    ),
    onSuccess: () => invalidateCartResources(userId, queryClient),
  });
  const mergeVisitor = useMutation({
    mutationFn: (request: CartMergeRequest) => cartApi.mergeVisitor(request),
    onSuccess: () => invalidateCartResources(userId, queryClient),
  });
  return { add, update, remove, mergeVisitor };
}

export function useVisitorCart(visitorId: string) {
  return useQuery({
    queryKey: ['visitor-cart', visitorId] as const,
    queryFn: ({ signal }) => cartApi.getVisitor(visitorId, { signal }),
    enabled: Boolean(visitorId),
  });
}

export function useAddVisitorCartItem(visitorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (line: CartLineRequest) => cartApi.addVisitorItem(visitorId, line),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['visitor-cart', visitorId] }),
  });
}

export function useVisitorCartMutations(visitorId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['visitor-cart', visitorId] });
  const update = useMutation({
    mutationFn: (input: { nftId: string; editionId: string; quantity: number }) => (
      cartApi.updateVisitorItem(visitorId, input.nftId, input.editionId, { quantity: input.quantity })
    ),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (input: { nftId: string; editionId: string }) => (
      cartApi.removeVisitorItem(visitorId, input.nftId, input.editionId)
    ),
    onSuccess: invalidate,
  });
  return { update, remove };
}

export function useQuote(request: QuoteRequest | undefined) {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  return useQuery({
    queryKey: request ? queryKeys.quote(userId, request) : queryKeys.quotePrefix(userId),
    queryFn: ({ signal }) => {
      if (!request) throw new Error('Uma requisição válida é necessária para cotar o carrinho.');
      return quoteApi.create(request, { signal });
    },
    enabled: Boolean(userId && request?.items.length),
    staleTime: 0,
  });
}

export function useCreateQuote() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: QuoteRequest) => quoteApi.create(request),
    onSuccess: (quote, request) => {
      if (!isCurrentUser(userId)) return;
      queryClient.setQueryData(queryKeys.quote(userId, request), quote);
    },
  });
}

export function useApplyCoupon() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: QuoteRequest) => quoteApi.create(request),
    onSuccess: (quote, request) => {
      if (!isCurrentUser(userId)) return;
      queryClient.setQueryData(queryKeys.quote(userId, request), quote);
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart(userId) });
    },
  });
}

export interface OrderAttempt {
  request: OrderCreateRequest;
  idempotencyKey: string;
}

export function createOrderAttempt(request: OrderCreateRequest): OrderAttempt {
  return { request, idempotencyKey: crypto.randomUUID() };
}

export function useOrder(orderId: string) {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  return useQuery({
    queryKey: queryKeys.order(userId, orderId),
    queryFn: ({ signal }) => orderApi.get(orderId, { signal }),
    enabled: Boolean(userId && orderId),
    staleTime: 0,
    refetchInterval: (query) => query.state.data?.status === 'pending' ? 2_000 : false,
  });
}

export function createOrderMutationOptions(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
): UseMutationOptions<OrderResponse, Error, OrderAttempt> {
  return {
    mutationFn: (attempt: OrderAttempt) => (
      orderApi.create(attempt.request, attempt.idempotencyKey)
    ),
    onSuccess: (order) => {
      if (!isCurrentUser(userId)) return;
      queryClient.setQueryData(queryKeys.order(userId, order.id), order);
      void queryClient.invalidateQueries({ queryKey: queryKeys.cart(userId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quotePrefix(userId) });
      void queryClient.invalidateQueries({ queryKey: ['nfts'] });
    },
  };
}

export function useCreateOrder() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  return useMutation(createOrderMutationOptions(queryClient, userId));
}

export function useProfile() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  return useQuery({
    queryKey: queryKeys.profile(userId),
    queryFn: ({ signal }) => profileApi.get({ signal }),
    enabled: Boolean(userId),
    staleTime: 0,
  });
}

export function useProfileMutations() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: (request: UpdateProfileRequest) => profileApi.update(request),
    onSuccess: (profile) => {
      if (!isCurrentUser(userId)) return;
      queryClient.setQueryData(queryKeys.profile(userId), profile);
      const session = getSessionState().session;
      if (session?.user.id === userId) {
        acceptSession({
          ...session,
          user: {
            ...session.user,
            displayName: profile.displayName,
            username: profile.username,
            email: profile.email,
          },
        });
      }
    },
  });
  const changePassword = useMutation({
    mutationFn: (request: Parameters<typeof profileApi.changePassword>[0]) => (
      profileApi.changePassword(request)
    ),
  });
  return { update, changePassword };
}

export function useWallets() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  return useQuery({
    queryKey: queryKeys.wallets(userId),
    queryFn: ({ signal }) => walletsApi.list({ signal }),
    enabled: Boolean(userId),
    staleTime: 0,
  });
}

export function useWalletMutations() {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.wallets(userId) });
  const create = useMutation({ mutationFn: (request: WalletRequest) => walletsApi.create(request), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: (input: { walletId: string; request: Partial<WalletRequest> }) => (
      walletsApi.update(input.walletId, input.request)
    ),
    onSuccess: invalidate,
  });
  return { create, update };
}
