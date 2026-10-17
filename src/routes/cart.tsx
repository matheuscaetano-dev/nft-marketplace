import { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { FormEvent } from 'react';
import { ChevronLeft, Minus, Plus, Trash2 } from 'lucide-react';
import { useNftList } from '../api/hooks';
import { NFTCard } from '../components/marketplace/NFTCard';
import { useCart } from '../components/marketplace/CartProvider';
import { formatEth } from '../lib/money';
import { useSession } from '../api/session';
import { useRealtimeNotice } from '../api/realtime-socket';

export const Route = createFileRoute('/cart')({
  component: CartPage,
});

function CartPage() {
  const {
    items,
    promoCode,
    quote,
    isLoading,
    isQuoteLoading,
    isMutating,
    error,
    quoteError,
    setPromoCode,
    updateQuantity,
    removeItem,
    retry,
  } = useCart();
  const isAuthenticated = useSession().status === 'authenticated';
  const realtimeNotice = useRealtimeNotice();
  const [promoCodeInput, setPromoCodeInput] = useState(promoCode);
  const [promoMessage, setPromoMessage] = useState('');
  const [recommendationPage, setRecommendationPage] = useState(0);

  const { data: listings, isLoading: isLoadingRecommendations } = useNftList({ page: 1, limit: 27 });

  const subtotal = quote?.subtotalEth;
  const discount = quote?.discountEth;
  const networkFee = quote?.networkFeeEth;
  const total = quote?.totalEth;
  const cartIds = new Set(items.map((item) => item.nft.id));
  const recommendations = (listings?.data ?? []).filter((nft) => !cartIds.has(nft.id));
  const start = recommendations.length ? recommendationPage % recommendations.length : 0;
  const visibleRecommendations = [
    ...recommendations.slice(start),
    ...recommendations.slice(0, start),
  ].slice(0, 5);

  const applyPromoCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPromoMessage('');
    setPromoCode(promoCodeInput);
  };

  const quoteMessage = quote?.couponStatus === 'applied'
    ? `Cupom ${quote.couponCode} aplicado.`
    : quote?.couponStatus === 'expired'
      ? 'Este cupom está expirado ou atingiu o limite de uso.'
      : quote?.couponStatus === 'invalid'
        ? 'Cupom inválido.'
        : promoCode && !quote
          ? quoteError ?? (isAuthenticated ? '' : 'Entre para validar o cupom e obter uma cotação.')
          : '';

  return (
    <div className="mx-[-24px] max-w-[1200px] lg:mx-auto lg:space-y-16">
      <section aria-labelledby="cart-title">
        <div className="relative flex h-[34px] items-center justify-center border-b border-[#503523] px-6 lg:hidden">
          <Link to="/" hash="catalogo" aria-label="Voltar ao mercado" className="absolute left-6 flex size-8 items-center justify-center rounded-full border border-[#503523] text-[#D28A4C]">
            <ChevronLeft aria-hidden="true" size={18} />
          </Link>
          <h1 className="h-[16px] w-[193px] whitespace-nowrap text-center text-[20px] leading-4 font-bold text-[#F5F1EB]">Carrinho de NFTs</h1>
        </div>

        <nav aria-label="Trilha de navegação" className="mb-4 hidden text-[12px] font-semibold text-[#F5F1EB] lg:block">
          <Link to="/" className="hover:text-[#D28A4C]">Início</Link>
          <span className="mx-2 text-[#D28A4C]">/</span>
          <Link to="/" hash="catalogo" className="hover:text-[#D28A4C]">Mercado</Link>
          <span className="mx-2 text-[#D28A4C]">/</span>
          <h1 id="cart-title" className="inline">Carrinho</h1>
        </nav>

        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(240px,0.9fr)] lg:gap-16">
          <div>
            {realtimeNotice && items.some((item) => item.nft.id === realtimeNotice.nftId) && (
              <p role="status" aria-live="polite" className="mb-3 rounded border border-[#D28A4C] bg-[#21150f] px-3 py-2 text-[11px] text-[#D28A4C]">
                {realtimeNotice.message}
              </p>
            )}
            <div className="hidden min-w-[560px] grid-cols-[minmax(215px,1fr)_76px_88px_76px_24px] gap-3 border-b border-[#503523] px-2 pb-2 text-[12px] font-semibold text-[#F5F1EB] lg:grid">
              <span>NFTs</span><span>Preço</span><span>Edições</span><span>Unidades</span><span />
            </div>

            {isLoading ? (
              <div role="status" aria-label="Carregando carrinho" className="space-y-3 pt-3">
                {[0, 1].map((row) => <div key={row} className="h-[76px] animate-pulse bg-[#21150f] motion-reduce:animate-none" />)}
              </div>
            ) : error ? (
              <div role="alert" className="mt-4 bg-[#21150f] p-5 text-sm text-red-200">
                <p>{error}</p><button type="button" onClick={() => void retry()} className="mt-3 underline">Tentar novamente</button>
              </div>
            ) : items.length ? (
              <>
                <div className="hidden space-y-2 overflow-x-auto pt-2 lg:block">
                  {items.map(({ nft, editionId, quantity }) => {
                    const tokenId = nft.tokenId || nft.name.match(/#(\d+)/)?.[1] || nft.id;
                    const maxQuantity = nft.availableQuantity;
                    const quotedItem = quote?.items.find((line) => line.nftId === nft.id && line.editionId === editionId);
                    return (
                      <article key={nft.id} className="grid min-w-[560px] grid-cols-[minmax(215px,1fr)_76px_88px_76px_24px] items-center gap-3 bg-[#21150f] px-2 py-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <img src={nft.imageUrl} alt={nft.name} className="size-[52px] shrink-0 rounded-[5px] object-cover" />
                          <div className="min-w-0">
                            <h2 className="truncate text-[12px] font-bold text-[#F5F1EB]">{nft.name}</h2>
                            <p className="text-[11px] text-[#bba181]">ID do token: #{tokenId.padStart(4, '0')}</p>
                          </div>
                        </div>

                        <p className="text-[12px] text-[#d7c7b4]">{formatEth(quotedItem?.unitPriceEth ?? nft.priceEth)} ETH</p>

                        <div className="flex items-center gap-2 text-[12px]">
                          <button type="button" aria-label={'Diminuir ' + nft.name} disabled={quantity <= 1 || isMutating} onClick={() => void updateQuantity(nft.id, quantity - 1)} className="flex size-5 items-center justify-center rounded-full bg-[#D28A4C] text-[#17100b] disabled:opacity-40">
                            <Minus aria-hidden="true" size={12} />
                          </button>
                          <span aria-live="polite" className="min-w-3 text-center">{quantity}</span>
                          <button type="button" aria-label={'Aumentar ' + nft.name} disabled={quantity >= maxQuantity || isMutating} onClick={() => void updateQuantity(nft.id, quantity + 1)} className="flex size-5 items-center justify-center rounded-full bg-[#D28A4C] text-[#17100b] disabled:opacity-40">
                            <Plus aria-hidden="true" size={12} />
                          </button>
                        </div>

                        <p className="text-[12px] font-bold text-[#D28A4C]">× {quantity}</p>
                        <button type="button" aria-label={'Remover ' + nft.name} disabled={isMutating} onClick={() => void removeItem(nft.id, editionId)} className="flex size-6 items-center justify-center text-[#bba181] transition-colors hover:text-[#D28A4C] disabled:opacity-40">
                          <Trash2 aria-hidden="true" size={15} />
                        </button>
                      </article>
                    );
                  })}
                </div>

                <div className="space-y-4 px-7 pt-4 lg:hidden">
                  {items.map(({ nft, editionId, quantity }) => {
                    const maxQuantity = nft.availableQuantity;
                    const quotedItem = quote?.items.find((line) => line.nftId === nft.id && line.editionId === editionId);
                    return (
                      <article key={nft.id} className="relative grid h-[100px] grid-cols-[82px_minmax(0,1fr)] items-center overflow-hidden rounded-[12px] bg-[#241612]">
                        <div className="size-[82px] shrink-0 overflow-hidden rounded-[10px] bg-[#140D0A]">
                          <img src={nft.imageUrl} alt={nft.name} className="h-full w-full object-cover object-center" />
                        </div>
                        <div className="flex min-w-0 flex-col justify-center py-2 pl-2 pr-[88px]">
                          <h2 className="truncate text-[12px] font-bold text-[#F5F1EB]">{nft.name}</h2>
                          <p className="mt-0.5 text-[11px] text-[#bba181]">Edição: {nft.edition ?? '1/50'}</p>
                          <p className="mt-2 text-[15px] font-bold text-[#D28A4C]">{formatEth(quotedItem?.unitPriceEth ?? nft.priceEth)} ETH</p>
                        </div>
                        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-[12px]">
                          <button type="button" aria-label={quantity === 1 ? 'Remover ' + nft.name : 'Diminuir ' + nft.name} disabled={isMutating} onClick={() => void (quantity === 1 ? removeItem(nft.id, editionId) : updateQuantity(nft.id, quantity - 1))} className="flex size-5 items-center justify-center rounded-full border border-[#503523] bg-[#2c1a12] text-[#D28A4C] disabled:opacity-40">
                            <Minus aria-hidden="true" size={12} />
                          </button>
                          <span aria-live="polite" className="min-w-3 text-center text-[#F5F1EB]">{quantity}</span>
                          <button type="button" aria-label={'Aumentar ' + nft.name} disabled={quantity >= maxQuantity || isMutating} onClick={() => void updateQuantity(nft.id, quantity + 1)} className="flex size-5 items-center justify-center rounded-full border border-[#503523] bg-[#2c1a12] text-[#D28A4C] disabled:opacity-40">
                            <Plus aria-hidden="true" size={12} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="mx-6 mt-4 bg-[#21150f] px-5 py-8 text-center lg:mx-0 lg:mt-3">
                <p className="text-[14px] font-semibold text-[#F5F1EB]">Seu carrinho está vazio.</p>
                <p className="mt-2 text-[12px] text-[#bba181]">Explore o mercado e adicione os NFTs que quiser.</p>
                <Link to="/" hash="catalogo" className="mt-4 inline-flex rounded-[5px] bg-[#D28A4C] px-4 py-2 text-[12px] font-bold text-[#17100b] hover:bg-[#e19b5f]">
                  Explorar NFTs
                </Link>
              </div>
            )}
          </div>

          <aside aria-labelledby="cart-summary-title" className="hidden space-y-4 lg:block">
            <h2 id="cart-summary-title" className="border-b border-[#503523] pb-2 text-[14px] font-bold text-[#F5F1EB]">Resumo da carteira</h2>

            <form onSubmit={applyPromoCode}>
              <label htmlFor="promo-code" className="mb-1 block text-[11px] font-semibold text-[#F5F1EB]">Código promocional</label>
              <div className="flex h-[30px] overflow-hidden rounded-[3px] bg-[#402813]">
                <input id="promo-code" value={promoCodeInput} onChange={(event) => setPromoCodeInput(event.target.value)} placeholder="Digite o código promocional..." className="min-w-0 flex-1 bg-transparent px-2 text-[10px] text-[#F5F1EB] outline-none placeholder:text-[#b08d64]" />
                <button type="submit" className="bg-[#D28A4C] px-3 text-[11px] font-bold text-[#17100b] hover:bg-[#e19b5f]">Aplicar</button>
              </div>
              {(promoMessage || quoteMessage) && <p role="status" aria-live="polite" className="mt-1 text-[10px] text-[#D28A4C]">{promoMessage || quoteMessage}</p>}
              {promoCode && <button type="button" onClick={() => { setPromoCode(''); setPromoCodeInput(''); setPromoMessage('Cupom removido.'); }} className="mt-1 text-[10px] text-[#bba181] underline">Remover cupom</button>}
            </form>

            <dl className="space-y-2 text-[11px] text-[#d7c7b4]">
              <div className="flex justify-between gap-3"><dt>Subtotal</dt><dd>{subtotal ? `${formatEth(subtotal)} ETH` : '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt>Desconto</dt><dd>{discount ? `(-) ${formatEth(discount)} ETH` : '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt>Taxa de rede</dt><dd>{networkFee ? `${formatEth(networkFee)} ETH` : '—'}</dd></div>
              <p className="text-right text-[9px] text-[#b08d64]">Taxa estimada</p>
            </dl>
            {isQuoteLoading && <p role="status" className="text-right text-[10px] text-[#bba181]">Atualizando cotação…</p>}

            <div className="flex justify-between border-t border-[#503523] pt-3 text-[13px] font-bold">
              <span>Total</span><span className="text-[#D28A4C]">{total ? `${formatEth(total)} ETH` : '—'}</span>
            </div>

            {items.length && !isAuthenticated ? (
              <Link to="/login" search={{ redirect: '/cart' }} className="flex h-[34px] w-full items-center justify-center rounded-[4px] bg-[#D28A4C] text-[11px] font-bold text-[#17100b]">Entrar para ver cotação e finalizar</Link>
            ) : items.length ? (
              <Link to="/payment" className="flex h-[34px] w-full items-center justify-center rounded-[4px] bg-[#D28A4C] text-[11px] font-bold text-[#17100b] transition-colors hover:bg-[#e19b5f]">
                Conectar e finalizar
              </Link>
            ) : (
              <button type="button" disabled className="h-[34px] w-full rounded-[4px] bg-[#D28A4C] text-[11px] font-bold text-[#17100b] opacity-50">Conectar e finalizar</button>
            )}
            <Link to="/" hash="catalogo" className="block text-center text-[11px] text-[#D28A4C] hover:text-[#f0a66e]">Continuar explorando</Link>
          </aside>
        </div>

        <aside aria-label="Resumo do pedido" className="mt-5 rounded-t-[40px] bg-[#241612] px-6 pb-8 pt-6 lg:hidden">
          <form onSubmit={applyPromoCode}>
            <label htmlFor="mobile-promo-code" className="sr-only">Código promocional</label>
            <div className="flex h-[42px] overflow-hidden rounded-full border border-[#503523] bg-[#21150f]">
              <input id="mobile-promo-code" value={promoCodeInput} onChange={(event) => setPromoCodeInput(event.target.value)} placeholder="Digite o código promocional..." className="min-w-0 flex-1 bg-transparent px-4 text-[11px] text-[#F5F1EB] outline-none placeholder:text-[#b08d64]" />
              <button type="submit" className="rounded-full bg-[#D28A4C] px-5 text-[12px] font-bold text-white hover:bg-[#e19b5f]">Aplicar</button>
            </div>
            {(promoMessage || quoteMessage) && <p role="status" aria-live="polite" className="mt-1 text-[10px] text-[#D28A4C]">{promoMessage || quoteMessage}</p>}
            {promoCode && <button type="button" onClick={() => { setPromoCode(''); setPromoCodeInput(''); setPromoMessage('Cupom removido.'); }} className="mt-1 text-[10px] text-[#bba181] underline">Remover cupom</button>}
          </form>

          <dl className="mt-3 space-y-2 text-[12px] text-[#d7c7b4]">
            <div className="flex justify-between gap-3"><dt>Subtotal</dt><dd>{subtotal ? `${formatEth(subtotal)} ETH` : '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt>Desconto</dt><dd>{discount ? `(-) ${formatEth(discount)} ETH` : '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt>Taxa de rede</dt><dd>{networkFee ? `${formatEth(networkFee)} ETH` : '—'}</dd></div>
            <p className="-mt-1 text-right text-[9px] text-[#b08d64]">Taxa estimada</p>
          </dl>
          {isQuoteLoading && <p role="status" className="mt-2 text-right text-[10px] text-[#bba181]">Atualizando cotação…</p>}

          <div className="mt-4 flex justify-between border-t border-[#503523] pt-4 text-[14px] font-bold">
            <span>Total</span><span className="text-[16px] text-[#D28A4C]">{total ? `${formatEth(total)} ETH` : '—'}</span>
          </div>

          {items.length && !isAuthenticated ? (
            <Link to="/login" search={{ redirect: '/cart' }} className="mt-5 flex h-[50px] w-full items-center justify-center rounded-full bg-[#D28A4C] text-[13px] font-bold text-[#17100b]">Entrar para ver cotação e finalizar</Link>
          ) : items.length ? (
            <Link to="/payment" className="mt-5 flex h-[50px] w-full items-center justify-center rounded-full bg-[#D28A4C] text-[13px] font-bold text-[#17100b] transition-colors hover:bg-[#e19b5f]">
              Conectar e finalizar
            </Link>
          ) : (
            <button type="button" disabled className="mt-5 h-[50px] w-full rounded-full bg-[#D28A4C] text-[13px] font-bold text-[#17100b] opacity-50">Conectar e finalizar</button>
          )}
        </aside>
      </section>

      <section aria-labelledby="cart-recommendations-title" className="hidden lg:block">
        <h2 id="cart-recommendations-title" className="border-b border-[#503523] pb-2 text-[14px] font-bold text-[#D28A4C]">Colecionadores também viram</h2>
        {visibleRecommendations.length ? (
          <>
            <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
              {visibleRecommendations.map((nft) => <NFTCard key={nft.id} nft={nft} />)}
            </div>
            <div className="mt-6 flex justify-center gap-2" aria-label="Navegação das recomendações">
              {[0, 1, 2].map((page) => (
                <button key={page} type="button" aria-label={'Recomendações ' + (page + 1)} aria-pressed={recommendationPage === page} onClick={() => setRecommendationPage(page)} className={recommendationPage === page ? 'size-2.5 rounded-full bg-[#D28A4C]' : 'size-2.5 rounded-full border border-[#D28A4C]'} />
              ))}
            </div>
          </>
        ) : (
          <p className="mt-5 text-[12px] text-[#bba181]">
            {isLoadingRecommendations ? 'Carregando recomendações...' : 'Você já adicionou todos os NFTs disponíveis.'}
          </p>
        )}
      </section>
    </div>
  );
}
