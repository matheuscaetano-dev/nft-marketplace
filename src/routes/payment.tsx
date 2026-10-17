import { useRef, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import type { FormEvent } from 'react';
import { isApiError } from '../api/client';
import {
  createOrderAttempt,
  useCreateOrder,
  useCreateQuote,
  useProfile,
  useWallets,
} from '../api/hooks';
import type { OrderAttempt } from '../api/hooks';
import { requireAuthenticatedRoute } from '../api/route-guards';
import { useSession } from '../api/session';
import { acknowledgeRealtimeNotice, useRealtimeNotice } from '../api/realtime-socket';
import { useCart } from '../components/marketplace/CartProvider';
import type { QuoteResponse, WalletResponse } from '../contracts/api';
import { formatEth } from '../lib/money';

export const Route = createFileRoute('/payment')({
  beforeLoad: () => requireAuthenticatedRoute('checkout'),
  component: PaymentPage,
});

const providers = ['MetaMask', 'WalletConnect', 'Coinbase Wallet'] as const;
type WalletProvider = (typeof providers)[number];
type ConnectionState = 'disconnected' | 'connected' | 'rejected';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseOrderAttempt(value: unknown): OrderAttempt | null {
  if (!isRecord(value) || typeof value.idempotencyKey !== 'string' || !isRecord(value.request)) return null;
  const request = value.request;
  if (typeof request.quoteId !== 'string' || typeof request.walletId !== 'string'
    || typeof request.network !== 'string' || !Array.isArray(request.items)) return null;
  const items = request.items.flatMap((line) => (
    isRecord(line)
      && typeof line.nftId === 'string'
      && typeof line.editionId === 'string'
      && Number.isSafeInteger(line.quantity)
      ? [{ nftId: line.nftId, editionId: line.editionId, quantity: Number(line.quantity) }]
      : []
  ));
  if (items.length !== request.items.length) return null;
  return {
    idempotencyKey: value.idempotencyKey,
    request: {
      quoteId: request.quoteId,
      walletId: request.walletId,
      network: request.network,
      items,
    },
  };
}

function attemptStorageKey(userId: string) {
  return `kurio-order-attempt-v1:${userId}`;
}

function loadAttempt(key: string): OrderAttempt | null {
  try {
    const value = localStorage.getItem(key);
    return value ? parseOrderAttempt(JSON.parse(value) as unknown) : null;
  } catch {
    return null;
  }
}

function quotesDiffer(left: QuoteResponse, right: QuoteResponse): boolean {
  if (left.subtotalEth !== right.subtotalEth || left.discountEth !== right.discountEth
    || left.networkFeeEth !== right.networkFeeEth || left.totalEth !== right.totalEth) return true;
  if (left.items.length !== right.items.length) return true;
  return left.items.some((line, index) => {
    const current = right.items[index];
    return !current || line.nftId !== current.nftId || line.editionId !== current.editionId
      || line.unitPriceEth !== current.unitPriceEth
      || line.availableQuantity !== current.availableQuantity
      || line.available !== current.available
      || line.nftVersion !== current.nftVersion;
  });
}

function PaymentPage() {
  const navigate = useNavigate();
  const session = useSession();
  const realtimeNotice = useRealtimeNotice();
  const userId = session.session?.user.id ?? '';
  const { items, promoCode, quote, isLoading: isCartLoading } = useCart();
  const profile = useProfile();
  const wallets = useWallets();
  const quoteMutation = useCreateQuote();
  const orderMutation = useCreateOrder();
  const storageKey = attemptStorageKey(userId);
  const [savedAttempt, setSavedAttempt] = useState(() => loadAttempt(storageKey));
  const [selectedWalletId, setSelectedWalletId] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<WalletProvider>('MetaMask');
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [reconfirmationQuote, setReconfirmationQuote] = useState<QuoteResponse>();
  const [statusMessage, setStatusMessage] = useState('');
  const [acknowledgedNoticeId, setAcknowledgedNoticeId] = useState('');
  const submittingRef = useRef(false);
  const walletList = wallets.data?.wallets ?? [];
  const selectedWallet = walletList.find((wallet) => wallet.id === selectedWalletId)
    ?? walletList.find((wallet) => wallet.role === 'primary');
  const currentItems = items.map(({ nft, editionId, quantity }) => ({
    nftId: nft.id,
    editionId,
    quantity,
  }));
  const noticeAffectsCart = Boolean(
    realtimeNotice && items.some((item) => item.nft.id === realtimeNotice.nftId),
  );
  const quoteNeedsReconfirmation = noticeAffectsCart && realtimeNotice?.id !== acknowledgedNoticeId;
  const currentQuote = quoteNeedsReconfirmation ? quote : reconfirmationQuote ?? quote;

  const selectWallet = (wallet: WalletResponse) => {
    setSelectedWalletId(wallet.id);
    setConnectionState('disconnected');
    setReconfirmationQuote(undefined);
  };

  const finishOrder = async (attempt: OrderAttempt) => {
    setStatusMessage('Enviando pedido à simulação…');
    try {
      const result = await orderMutation.mutateAsync(attempt);
      localStorage.removeItem(storageKey);
      setSavedAttempt(null);
      await navigate({ to: '/order/$orderId', params: { orderId: result.id } });
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        localStorage.removeItem(storageKey);
        setSavedAttempt(null);
        try {
          const updatedQuote = await quoteMutation.mutateAsync({
            items: currentItems,
            ...(promoCode ? { couponCode: promoCode } : {}),
          });
          setReconfirmationQuote(updatedQuote);
          setStatusMessage('Preço, disponibilidade ou cotação mudou. Confira os novos valores e confirme novamente.');
        } catch (quoteError) {
          setStatusMessage(isApiError(quoteError) ? quoteError.message : 'Não foi possível atualizar a cotação.');
        }
      } else {
        setStatusMessage(isApiError(error)
          ? `${error.message} O pedido pode ser retomado com a mesma chave, sem duplicação.`
          : 'Falha de rede. O pedido pode ser retomado com a mesma chave, sem duplicação.');
      }
    }
  };

  const confirmPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    setStatusMessage('');
    submittingRef.current = true;
    try {
      if (savedAttempt) {
        await finishOrder(savedAttempt);
        return;
      }
      if (!items.length || !selectedWallet) {
        setStatusMessage(items.length ? 'Cadastre ou selecione uma carteira antes de continuar.' : 'Adicione NFTs ao carrinho antes de continuar.');
        return;
      }
      if (connectionState !== 'connected') {
        setStatusMessage('Conecte uma carteira simulada para continuar.');
        return;
      }

      try {
        const freshQuote = await quoteMutation.mutateAsync({
          items: currentItems,
          ...(promoCode ? { couponCode: promoCode } : {}),
        });
        if (freshQuote.couponStatus === 'invalid' || freshQuote.couponStatus === 'expired') {
          setReconfirmationQuote(freshQuote);
          setStatusMessage(freshQuote.couponStatus === 'expired' ? 'O cupom expirou. Remova-o ou atualize o carrinho.' : 'O cupom não é válido. Remova-o ou atualize o carrinho.');
          return;
        }
        if (freshQuote.items.some((line) => !line.available)) {
          setReconfirmationQuote(freshQuote);
          setStatusMessage('A quantidade solicitada não está mais disponível. Ajuste o carrinho antes de confirmar.');
          return;
        }

        if (quoteNeedsReconfirmation) {
          setReconfirmationQuote(freshQuote);
          setAcknowledgedNoticeId(realtimeNotice?.id ?? '');
          if (realtimeNotice) acknowledgeRealtimeNotice(realtimeNotice.id);
          setStatusMessage('A cotação foi atualizada. Revise os valores e confirme novamente.');
          return;
        }

        const baseline = reconfirmationQuote ?? quote;
        if (baseline && quotesDiffer(baseline, freshQuote)) {
          setReconfirmationQuote(freshQuote);
          setStatusMessage('Os valores ou a disponibilidade mudaram. Revise a cotação atualizada e confirme novamente.');
          return;
        }

        const attempt = createOrderAttempt({
          quoteId: freshQuote.quoteId,
          items: currentItems,
          walletId: selectedWallet.id,
          network: selectedWallet.network,
        });
        try {
          localStorage.setItem(storageKey, JSON.stringify(attempt));
        } catch {
          setStatusMessage('Não foi possível salvar a chave segura de recuperação neste navegador. O pedido não foi enviado.');
          return;
        }
        setSavedAttempt(attempt);
        await finishOrder(attempt);
      } catch (error) {
        setStatusMessage(isApiError(error) ? error.message : 'Não foi possível revalidar a cotação. Tente novamente.');
      }
    } finally {
      submittingRef.current = false;
    }
  };

  const quoteUnavailable = Boolean(currentQuote?.items.some((line) => !line.available));
  const isWorking = quoteMutation.isPending || orderMutation.isPending;

  return (
    <main className="mx-auto max-w-[1200px]">
      <nav aria-label="Trilha de navegação" className="mb-6 hidden text-[12px] font-semibold text-[#F5F1EB] lg:block">
        <Link to="/" className="hover:text-[#D28A4C]">Início</Link><span className="mx-2 text-[#D28A4C]">/</span>
        <Link to="/cart" className="hover:text-[#D28A4C]">Carrinho</Link><span className="mx-2 text-[#D28A4C]">/</span>
        <span aria-current="page">Pagamento</span>
      </nav>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="collector-title" className="rounded-[12px] bg-[#21150f] p-5 sm:p-7">
          <h1 id="collector-title" className="text-[16px] font-bold text-[#F5F1EB]">Perfil do colecionador</h1>
          {profile.isLoading ? (
            <div role="status" aria-label="Carregando perfil" className="mt-4 h-24 animate-pulse rounded bg-[#322017] motion-reduce:animate-none" />
          ) : profile.isError ? (
            <div role="alert" className="mt-4 text-sm text-red-200">
              Não foi possível carregar seus dados. <button type="button" onClick={() => void profile.refetch()} className="underline">Tentar novamente</button>
            </div>
          ) : (
            <dl className="mt-4 grid gap-3 text-[12px] sm:grid-cols-2">
              <div><dt className="text-[#bba181]">Nome</dt><dd className="mt-1 text-[#F5F1EB]">{profile.data?.displayName}</dd></div>
              <div><dt className="text-[#bba181]">Usuário</dt><dd className="mt-1 text-[#F5F1EB]">@{profile.data?.username}</dd></div>
              <div><dt className="text-[#bba181]">E-mail</dt><dd className="mt-1 break-all text-[#F5F1EB]">{profile.data?.email}</dd></div>
              <div><dt className="text-[#bba181]">ENS</dt><dd className="mt-1 text-[#F5F1EB]">{profile.data?.ensName || 'Não cadastrado'}</dd></div>
            </dl>
          )}

          <div className="mt-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[14px] font-bold text-[#F5F1EB]">Carteira de recebimento</h2>
              <Link to="/wallets" className="text-[11px] text-[#D28A4C] underline">Gerenciar carteiras</Link>
            </div>
            {wallets.isLoading ? (
              <div role="status" aria-label="Carregando carteiras" className="mt-3 h-20 animate-pulse rounded bg-[#322017] motion-reduce:animate-none" />
            ) : wallets.isError ? (
              <p role="alert" className="mt-3 text-sm text-red-200">Não foi possível carregar as carteiras. <button type="button" onClick={() => void wallets.refetch()} className="underline">Tentar novamente</button></p>
            ) : walletList.length ? (
              <fieldset className="mt-3 space-y-2">
                <legend className="sr-only">Selecione a carteira e sua rede</legend>
                {walletList.map((wallet) => {
                  const selected = (selectedWalletId || selectedWallet?.id) === wallet.id;
                  return (
                    <label key={wallet.id} className={`flex cursor-pointer items-center gap-3 rounded-[8px] border p-3 text-left ${selected ? 'border-[#D28A4C] bg-[#2c1a12]' : 'border-[#503523] bg-[#1b100c]'}`}>
                      <input type="radio" name="wallet-id" value={wallet.id} checked={selected} onChange={() => selectWallet(wallet)} className="accent-[#D28A4C]" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-bold text-[#F5F1EB]">{wallet.nickname} {wallet.role === 'primary' ? '(principal)' : '(secundária)'}</span>
                        <span className="mt-1 block break-all text-[10px] text-[#bba181]">{wallet.address} · {wallet.network} · {wallet.provider}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            ) : (
              <p className="mt-3 text-sm text-[#bba181]">Você ainda não cadastrou uma carteira. <Link to="/wallets" className="text-[#D28A4C] underline">Cadastrar carteira</Link></p>
            )}
          </div>

          <div className="mt-6 rounded-[8px] border border-[#503523] p-4">
            <h2 className="text-[13px] font-bold text-[#F5F1EB]">Conexão de carteira (simulação)</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {providers.map((provider) => (
                <button key={provider} type="button" aria-pressed={selectedProvider === provider} onClick={() => { setSelectedProvider(provider); setConnectionState('disconnected'); }} className={`rounded border px-3 py-2 text-[11px] ${selectedProvider === provider ? 'border-[#D28A4C] text-[#D28A4C]' : 'border-[#503523] text-[#bba181]'}`}>{provider}</button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => { setConnectionState('connected'); setStatusMessage(`${selectedProvider} conectada na simulação.`); }} className="rounded bg-[#D28A4C] px-3 py-2 text-[11px] font-bold text-[#17100b]">Simular conexão</button>
              <button type="button" onClick={() => { setConnectionState('rejected'); setStatusMessage('A conexão foi recusada na simulação. Tente novamente ou selecione outro provedor.'); }} className="rounded border border-[#503523] px-3 py-2 text-[11px] text-[#bba181]">Simular recusa</button>
              {connectionState === 'connected' && <button type="button" onClick={() => { setConnectionState('disconnected'); setStatusMessage('Carteira desconectada.'); }} className="rounded border border-[#503523] px-3 py-2 text-[11px] text-[#bba181]">Desconectar</button>}
            </div>
            <p role="status" aria-live="polite" className="mt-2 text-[10px] text-[#bba181]">
              {connectionState === 'connected' ? `${selectedProvider} conectada (simulado).` : connectionState === 'rejected' ? 'Conexão recusada.' : 'Carteira desconectada.'}
            </p>
          </div>
        </section>

        <aside className="rounded-[12px] bg-[#21150f] p-5">
          <h2 className="text-[14px] font-bold text-[#F5F1EB]">Revisão do pedido</h2>
          {isCartLoading ? (
            <div role="status" aria-label="Carregando itens" className="mt-4 h-20 animate-pulse rounded bg-[#322017] motion-reduce:animate-none" />
          ) : items.length ? (
            <ul className="mt-3 space-y-2">
              {items.map(({ nft, quantity, editionId }) => (
                <li key={`${nft.id}:${editionId}`} className="flex items-center gap-3 border-b border-[#503523] pb-2">
                  <img src={nft.imageUrl} alt="" className="size-12 rounded object-cover" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[11px] text-[#F5F1EB]">{nft.name}</span><span className="text-[10px] text-[#bba181]">× {quantity}</span></span>
                  <span className="text-[10px] text-[#bba181]">{currentQuote?.items.find((line) => line.nftId === nft.id && line.editionId === editionId)?.unitPriceEth ?? '—'} ETH / un.</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[12px] text-[#bba181]">Carrinho vazio. <Link to="/cart" className="text-[#D28A4C] underline">Voltar ao carrinho</Link></p>
          )}

          <dl className="mt-4 space-y-2 text-[11px] text-[#d7c7b4]">
            <SummaryLine label="Subtotal" value={currentQuote?.subtotalEth} />
            <SummaryLine label="Desconto" value={currentQuote?.discountEth} prefix="− " />
            <SummaryLine label="Taxa de rede" value={currentQuote?.networkFeeEth} />
            <div className="flex justify-between border-t border-[#503523] pt-3 text-[13px] font-bold text-[#F5F1EB]">
              <dt>Total</dt><dd className="text-[#D28A4C]">{currentQuote ? `${formatEth(currentQuote.totalEth)} ETH` : 'Cotando…'}</dd>
            </div>
          </dl>
          {promoCode && <p className="mt-2 text-right text-[10px] text-[#bba181]">Cupom: {promoCode}</p>}

          <form onSubmit={(event) => void confirmPurchase(event)} className="mt-5">
            <button type="submit" disabled={isWorking || (!savedAttempt && (!items.length || !selectedWallet || !currentQuote || quoteUnavailable || connectionState !== 'connected'))} className="h-[44px] w-full rounded-[5px] bg-[#D28A4C] text-[12px] font-bold text-[#17100b] disabled:cursor-not-allowed disabled:opacity-50">
              {isWorking ? 'Processando…' : savedAttempt ? 'Retomar pedido com segurança' : reconfirmationQuote ? 'Confirmar valores atualizados' : 'Revalidar e confirmar pedido'}
            </button>
          </form>
          {(statusMessage || (noticeAffectsCart && realtimeNotice?.message)) && (
            <p role="status" aria-live="polite" className="mt-3 text-[11px] leading-5 text-[#D28A4C]">
              {statusMessage || (quoteNeedsReconfirmation
                ? 'Preço ou disponibilidade mudou em tempo real. Revalide a cotação e confirme novamente.'
                : realtimeNotice?.message)}
            </p>
          )}
          {quoteUnavailable && <p role="alert" className="mt-2 text-[11px] text-red-200">Há itens indisponíveis. Volte ao carrinho para ajustar as quantidades.</p>}
          <Link to="/cart" className="mt-4 block text-center text-[11px] text-[#D28A4C] underline">Voltar ao carrinho</Link>
        </aside>
      </div>
      <div className="mt-5 text-center text-[10px] text-[#8f7254]">Pagamento e conexão com carteira são simulados; nenhuma transação real será enviada.</div>
    </main>
  );
}

function SummaryLine({ label, value, prefix = '' }: { label: string; value?: string; prefix?: string }) {
  return <div className="flex justify-between gap-3"><dt>{label}</dt><dd>{value === undefined ? '—' : `${prefix}${formatEth(value)} ETH`}</dd></div>;
}
