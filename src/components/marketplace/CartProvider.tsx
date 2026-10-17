import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  useAddVisitorCartItem,
  useCart as useAuthenticatedCart,
  useCartMutations,
  useQuote,
  useVisitorCart,
  useVisitorCartMutations,
} from '../../api/hooks';
import { useSession } from '../../api/session';
import type { QuoteResponse } from '../../contracts/api';
import { getOrCreateVisitorId } from '../../api/session-storage';
import type { NFT } from '../../types';

export interface CartItem {
  nft: NFT;
  editionId: string;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  promoCode: string;
  quote?: QuoteResponse;
  isLoading: boolean;
  isQuoteLoading: boolean;
  error?: string;
  quoteError?: string;
  isMutating: boolean;
  addItem: (nft: NFT, quantity?: number) => Promise<boolean>;
  updateQuantity: (nftId: string, quantity: number) => Promise<boolean>;
  removeItem: (nftId: string, editionId?: string) => Promise<boolean>;
  setPromoCode: (code: string) => void;
  clearError: () => void;
  retry: () => Promise<void>;
}

const PROMO_STORAGE_KEY = 'kurio-promo-code';
const CartContext = createContext<CartContextValue | null>(null);

function loadPromoCode(): string {
  try {
    return typeof window === 'undefined' ? '' : window.localStorage.getItem(PROMO_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível atualizar o carrinho.';
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const isAuthenticated = Boolean(userId);
  const visitorId = getOrCreateVisitorId() ?? '';
  const authenticatedCart = useAuthenticatedCart();
  const visitorCart = useVisitorCart(visitorId);
  const authenticatedMutations = useCartMutations();
  const visitorMutations = useVisitorCartMutations(visitorId);
  const addVisitorItem = useAddVisitorCartItem(visitorId);
  const [promoCode, setPromoCodeState] = useState(loadPromoCode);
  const [error, setError] = useState<string>();

  const currentCart = isAuthenticated ? authenticatedCart : visitorCart;
  const items = useMemo(() => (currentCart.data?.items ?? []).flatMap((line) => (
    line.nft ? [{ nft: line.nft, editionId: line.editionId, quantity: line.quantity }] : []
  )), [currentCart.data?.items]);
  const quoteRequest = useMemo(() => (
    isAuthenticated && items.length
      ? {
        items: items.map(({ nft, editionId, quantity }) => ({
          nftId: nft.id,
          editionId,
          quantity,
        })),
        ...(promoCode ? { couponCode: promoCode } : {}),
      }
      : undefined
  ), [isAuthenticated, items, promoCode]);
  const quoteQuery = useQuote(quoteRequest);
  const cartError = error ?? (currentCart.isError ? errorMessage(currentCart.error) : undefined);

  const addItem = async (nft: NFT, quantity = 1) => {
    setError(undefined);
    try {
      const line = { nftId: nft.id, editionId: 'default', quantity };
      if (isAuthenticated) await authenticatedMutations.add.mutateAsync(line);
      else await addVisitorItem.mutateAsync(line);
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    }
  };

  const updateQuantity = async (nftId: string, quantity: number) => {
    const item = items.find((entry) => entry.nft.id === nftId);
    if (!item) return false;
    setError(undefined);
    try {
      const input = { nftId, editionId: item.editionId, quantity };
      if (isAuthenticated) await authenticatedMutations.update.mutateAsync(input);
      else await visitorMutations.update.mutateAsync(input);
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    }
  };

  const removeItem = async (nftId: string, editionId?: string) => {
    const item = items.find((entry) => entry.nft.id === nftId
      && (!editionId || entry.editionId === editionId));
    if (!item) return false;
    setError(undefined);
    try {
      const input = { nftId, editionId: item.editionId };
      if (isAuthenticated) await authenticatedMutations.remove.mutateAsync(input);
      else await visitorMutations.remove.mutateAsync(input);
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      return false;
    }
  };

  const setPromoCode = (code: string) => {
    const normalized = code.trim().toLocaleUpperCase();
    setPromoCodeState(normalized);
    try {
      window.localStorage.setItem(PROMO_STORAGE_KEY, normalized);
    } catch {
      setError('Não foi possível salvar o cupom neste navegador.');
    }
  };

  return (
    <CartContext.Provider value={{
      items,
      promoCode,
      ...(quoteQuery.data ? { quote: quoteQuery.data } : {}),
      isLoading: currentCart.isLoading,
      isQuoteLoading: quoteQuery.isFetching,
      ...(cartError ? { error: cartError } : {}),
      ...(quoteQuery.error ? { quoteError: errorMessage(quoteQuery.error) } : {}),
      isMutating: authenticatedMutations.add.isPending || authenticatedMutations.update.isPending
        || authenticatedMutations.remove.isPending || addVisitorItem.isPending
        || visitorMutations.update.isPending || visitorMutations.remove.isPending,
      addItem,
      updateQuantity,
      removeItem,
      setPromoCode,
      clearError: () => setError(undefined),
      retry: async () => {
        await Promise.all([currentCart.refetch(), quoteQuery.refetch()]);
      },
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart precisa ser usado dentro de CartProvider.');
  return context;
}
