import { useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { ChevronLeft, Heart, Minus, Plus, ShoppingCart } from 'lucide-react';
import { useFavoriteMutation, useFavorites, useNftDetail, useNftList } from '../api/hooks';
import { useSession } from '../api/session';
import { NFTCard } from '../components/marketplace/NFTCard';
import { useCart } from '../components/marketplace/CartProvider';

export const Route = createFileRoute('/nft/$id')({
  component: NFTDetailsPage,
});

function NFTDetailsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const session = useSession();
  const favorites = useFavorites();
  const favoriteMutation = useFavoriteMutation();
  const [quantity, setQuantity] = useState(1);
  const [favoriteMessage, setFavoriteMessage] = useState('');
  const [activeTab, setActiveTab] = useState<'details' | 'reviews'>('details');
  const [relatedPage, setRelatedPage] = useState(0);
  const [purchaseMessage, setPurchaseMessage] = useState('');

  const {
    data: nft,
    isLoading,
    isError,
  } = useNftDetail(id);
  const { data: listings } = useNftList({ page: 1, limit: 27 });

  if (isLoading) {
    return <div role="status" aria-label="Carregando NFT" className="mx-auto max-w-[1200px] py-12"><div className="h-8 w-64 animate-pulse rounded bg-[#322017] motion-reduce:animate-none" /><div className="mt-5 aspect-square max-w-[470px] animate-pulse rounded bg-[#322017] motion-reduce:animate-none" /></div>;
  }

  if (isError || !nft) {
    return (
      <section className="mx-auto max-w-[1200px] py-12">
        <a href="/#catalogo" className="text-sm text-[#D28A4C] hover:text-[#f0a66e]">← Voltar ao mercado</a>
        <h1 className="mt-8 text-2xl font-bold text-[#F5F1EB]">NFT não encontrado</h1>
        <p className="mt-2 text-sm text-[#bba181]">Esse item não está disponível no catálogo.</p>
      </section>
    );
  }

  const collectionName = nft.collectionName || nft.collection;
  const edition = nft.edition ?? '1/50';
  const isFavorite = favorites.data?.nftIds.includes(nft.id) ?? false;
  const isSoldOut = nft.availableQuantity <= 0;
  const toggleFavorite = async () => {
    if (session.status !== 'authenticated') {
      await navigate({ to: '/login', search: { redirect: window.location.pathname } });
      return;
    }
    setFavoriteMessage('');
    try {
      await favoriteMutation.mutateAsync({ nftId: nft.id, action: isFavorite ? 'remove' : 'add' });
      setFavoriteMessage(isFavorite ? 'NFT removido dos favoritos.' : 'NFT adicionado aos favoritos.');
    } catch (cause) {
      setFavoriteMessage(cause instanceof Error ? cause.message : 'Não foi possível atualizar os favoritos.');
    }
  };
  const addSelectedToCart = async () => {
    const added = await addItem(nft, quantity);
    setPurchaseMessage(added
      ? `${nft.name} foi adicionado ao carrinho.`
      : 'Não foi possível adicionar o NFT. Verifique o estoque e tente novamente.');
  };
  const tokenNumber = nft.tokenId || nft.name.split('#')[1] || nft.id;
  const tokenId = '#' + tokenNumber.padStart(4, '0');
  const relatedNFTs = (listings?.data ?? []).filter((item) => item.id !== nft.id);
  const relatedStart = relatedNFTs.length ? relatedPage % relatedNFTs.length : 0;
  const visibleRelated = [...relatedNFTs.slice(relatedStart), ...relatedNFTs.slice(0, relatedStart)].slice(0, 5);

  return (
    <div className="mx-auto max-w-[1200px] space-y-14">
      <section aria-label="Detalhes do NFT em mobile" className="relative left-1/2 mx-auto w-screen max-w-[414px] -translate-x-1/2 overflow-hidden rounded-[32px] bg-[#241612] pb-0 lg:hidden">
        <div className="flex h-[66px] items-center justify-between px-6 pt-1">
          <Link to="/" hash="catalogo" aria-label="Voltar ao mercado" className="flex size-8 items-center justify-center rounded-full border border-[#70482c] text-[#D28A4C]">
            <ChevronLeft aria-hidden="true" size={19} />
          </Link>
          <button type="button" aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'} aria-pressed={isFavorite} disabled={favoriteMutation.isPending} onClick={() => void toggleFavorite()} className="flex size-8 items-center justify-center rounded-full border border-[#70482c] text-[#D28A4C] disabled:opacity-50">
            <Heart aria-hidden="true" size={16} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>

        <div className="px-6">
          <img src={nft.imageUrl} alt={nft.name} className="aspect-square w-full rounded-[22px] object-cover" />
        </div>

        <div className="relative z-10 -mt-9 flex h-[504px] flex-col justify-between rounded-t-[28px] bg-[#241612] px-6 pb-0 pt-8">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h1 className="min-w-0 text-[16px] font-bold leading-6 text-[#F5F1EB]">{nft.name}</h1>
            </div>

            <p className="mt-2 text-[11px] leading-[20px] text-[#c8ad8c]">{nft.description}</p>

            <h2 className="mt-2 text-[12px] font-bold text-[#F5F1EB]">Edição:</h2>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <span className="rounded-full border border-[#D28A4C] px-2 py-1 text-[10px] text-[#D28A4C]">{edition}</span>
            </div>

            <div className="mt-2 space-y-1 text-[11px] leading-[18px] text-[#b99568]">
              <p>ID do token: {tokenId}</p>
              <p>Coleção: {collectionName}</p>
              <p>Atributos: {(nft.attributes || []).join(', ') || 'Sem atributos cadastrados'}</p>
            </div>
          </div>

          <div className="-mx-6 rounded-t-[26px] bg-[#21150f] px-6 pb-6 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11px] text-[#F5F1EB]">
                <span>Qtd.</span>
                <button type="button" aria-label="Diminuir quantidade" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="flex size-[20px] items-center justify-center rounded-full bg-[#D28A4C] text-[#17100b] disabled:opacity-50"><Minus aria-hidden="true" size={12} /></button>
                <span aria-live="polite" className="min-w-3 text-center">{quantity}</span>
                <button type="button" aria-label="Aumentar quantidade" disabled={quantity >= nft.availableQuantity} onClick={() => setQuantity((value) => Math.min(nft.availableQuantity, value + 1))} className="flex size-[20px] items-center justify-center rounded-full bg-[#D28A4C] text-[#17100b] disabled:opacity-50"><Plus aria-hidden="true" size={12} /></button>
              </div>
              <p className="text-[16px] font-bold text-[#D28A4C]">{nft.priceEth} ETH</p>
            </div>

            <div className="mt-3 flex gap-2.5">
              <button type="button" disabled={isSoldOut} onClick={() => void addSelectedToCart()} className="h-[48px] flex-1 rounded-full bg-[#D28A4C] text-[12px] font-bold text-[#17100b] transition-colors hover:bg-[#e19b5f] disabled:cursor-not-allowed disabled:opacity-50">
                {isSoldOut ? 'Edição esgotada' : 'Comprar NFT'}
              </button>
              <button type="button" aria-label={'Adicionar ' + nft.name + ' ao carrinho'} disabled={isSoldOut} onClick={() => void addSelectedToCart()} className="flex size-[48px] items-center justify-center rounded-full border border-[#402813] bg-[#2a1a12] text-[#D28A4C] disabled:opacity-50">
                <ShoppingCart aria-hidden="true" size={17} />
              </button>
            </div>
            {favoriteMessage && <p role="status" aria-live="polite" className="mt-2 text-[10px] text-[#D28A4C]">{favoriteMessage}</p>}
            {purchaseMessage && <p role="status" className="mt-2 text-[10px] text-[#D28A4C]">{purchaseMessage} <a href="/cart" className="underline underline-offset-2">Ver carrinho</a></p>}
          </div>
        </div>
      </section>

      <section aria-label="Detalhes do NFT" className="hidden lg:block">
        <a href="/#catalogo" className="text-[13px] text-[#F5F1EB] hover:text-[#D28A4C]">
          Início <span className="mx-2 text-[#D28A4C]">/</span> Mercado
        </a>

        <div className="mt-4 grid gap-8 lg:grid-cols-[470px_minmax(0,1fr)]">
          <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-4 lg:grid-cols-[84px_minmax(0,1fr)]">
            <div className="flex flex-col gap-3">
              <img src={nft.imageUrl} alt="" className="aspect-square overflow-hidden rounded-[7px] border border-[#D28A4C] bg-[#21150f] p-1 object-cover" />
            </div>

            <div className="relative aspect-square rounded-[6px] bg-[#21150f] p-4">
              <img src={nft.imageUrl} alt={nft.name} className="h-full w-full rounded-[20px] object-cover" />
            </div>
          </div>

          <div>
            <p className="text-[12px] text-[#bba181]">{collectionName}</p>
            <h1 className="mt-1 text-[28px] font-bold leading-tight text-[#F5F1EB]">{nft.name}</h1>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#503523] pb-3">
              <p className="text-[20px] font-bold text-[#D28A4C]">{nft.priceEth} ETH</p>
            </div>

            <h2 className="mt-3 text-[13px] font-bold text-[#F5F1EB]">Sobre este NFT:</h2>
            <p className="mt-2 text-[12px] leading-5 text-[#c8ad8c]">{nft.description}</p>

            <h2 className="mt-3 text-[13px] font-bold text-[#F5F1EB]">Edição:</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {[edition].map((option) => (
                <span key={option} className="rounded-full border border-[#D28A4C] px-2 py-1 text-[11px] text-[#D28A4C]">{option}</span>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button type="button" aria-label="Diminuir quantidade" disabled={quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))} className="flex size-10 items-center justify-center rounded-full bg-[#D28A4C] text-[#17100b] disabled:opacity-50">
                  <Minus aria-hidden="true" size={17} />
                </button>
                <span aria-live="polite" className="min-w-3 text-center text-[16px]">{quantity}</span>
                <button type="button" aria-label="Aumentar quantidade" disabled={quantity >= nft.availableQuantity} onClick={() => setQuantity((value) => Math.min(nft.availableQuantity, value + 1))} className="flex size-10 items-center justify-center rounded-full bg-[#D28A4C] text-[#17100b] disabled:opacity-50">
                  <Plus aria-hidden="true" size={17} />
                </button>
              </div>

              <div className="flex gap-2">
                <button type="button" disabled={isSoldOut} onClick={() => void addSelectedToCart()} className="h-10 min-w-[140px] rounded-[6px] bg-[#D28A4C] px-5 text-[12px] font-bold text-[#17100b] transition-colors hover:bg-[#e19b5f] disabled:cursor-not-allowed disabled:opacity-50">
                  {isSoldOut ? 'EDIÇÃO ESGOTADA' : 'COMPRAR'}
                </button>
                <button type="button" aria-pressed={isFavorite} disabled={favoriteMutation.isPending} onClick={() => void toggleFavorite()} className="inline-flex h-10 items-center gap-2 rounded-[6px] border border-[#D28A4C] px-4 text-[12px] text-[#D28A4C] hover:bg-[#D28A4C]/10 disabled:opacity-50">
                  <Heart aria-hidden="true" size={16} fill={isFavorite ? 'currentColor' : 'none'} />
                  {isFavorite ? 'Favoritado' : 'Favoritar'}
                </button>
              </div>
              {favoriteMessage && <p role="status" aria-live="polite" className="mt-2 text-[11px] text-[#D28A4C]">{favoriteMessage}</p>}
            </div>
            {purchaseMessage && (
              <p role="status" className="mt-2 text-[11px] text-[#D28A4C]">
                {purchaseMessage} <a href="/cart" className="underline underline-offset-2">Ver carrinho</a>
              </p>
            )}

            <div className="mt-4 space-y-2 text-[12px] text-[#bba181]">
              <p>ID do token: {tokenId}</p>
              <p>Coleção: {collectionName}</p>
              <p>Atributos: {(nft.attributes || []).join(', ') || 'Sem atributos cadastrados'}</p>
            </div>

            <div className="mt-3 flex items-center gap-2 text-[12px]">
              <span className="font-bold text-[#F5F1EB]">Compartilhar este NFT:</span>
              <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noopener noreferrer" aria-label="Compartilhar no LinkedIn" className="font-bold text-[#F5F1EB] hover:text-[#D28A4C]">in</a>
              <a href="mailto:?subject=Veja%20este%20NFT" aria-label="Compartilhar por e-mail" className="text-[#F5F1EB] hover:text-[#D28A4C]">✉</a>
              <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noopener noreferrer" aria-label="Compartilhar no X" className="text-[#F5F1EB] hover:text-[#D28A4C]">𝕏</a>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Informações e avaliações do NFT" className="hidden lg:block">
        <div role="tablist" aria-label="Seções do item" className="flex gap-8 border-b border-[#503523]">
          <button type="button" role="tab" aria-selected={activeTab === 'details'} onClick={() => setActiveTab('details')} className={activeTab === 'details' ? 'border-b-2 border-[#D28A4C] pb-2 text-[14px] font-bold text-[#D28A4C]' : 'pb-2 text-[14px] text-[#F5F1EB]'}>
            Detalhes do NFT
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'reviews'} onClick={() => setActiveTab('reviews')} className={activeTab === 'reviews' ? 'border-b-2 border-[#D28A4C] pb-2 text-[14px] font-bold text-[#D28A4C]' : 'pb-2 text-[14px] text-[#F5F1EB]'}>
            Avaliações
          </button>
        </div>

        {activeTab === 'details' ? (
          <div className="space-y-5 py-4 text-[12px] leading-5 text-[#c8ad8c]">
            <p>{nft.description}</p>
            <DetailField title="Rede:" value={nft.network || 'Não informada'} />
            <DetailField title="Coleção:" value={collectionName} />
            <DetailField title="Atributos:" value={(nft.attributes ?? []).join(', ') || 'Sem atributos cadastrados'} />
          </div>
        ) : (
          <div className="py-6 text-[12px] leading-5 text-[#c8ad8c]">
            <p className="font-bold text-[#F5F1EB]">Avaliações indisponíveis</p>
            <p className="mt-2">O catálogo não fornece dados de avaliações para este NFT.</p>
          </div>
        )}
      </section>

      <section aria-labelledby="more-collection-title" className="hidden pb-2 lg:block">
        <h2 id="more-collection-title" className="border-b border-[#503523] pb-2 text-[14px] font-bold text-[#D28A4C]">
          Mais desta coleção
        </h2>

        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {visibleRelated.map((relatedNFT) => <NFTCard key={relatedNFT.id} nft={relatedNFT} />)}
        </div>

        <div className="mt-7 flex justify-center gap-2" aria-label="Navegação da coleção">
          {[0, 1, 2].map((page) => (
            <button
              key={page}
              type="button"
              aria-label={'Página ' + (page + 1) + ' da coleção'}
              aria-pressed={relatedPage === page}
              onClick={() => setRelatedPage(page)}
              className={relatedPage === page ? 'size-2.5 rounded-full bg-[#D28A4C]' : 'size-2.5 rounded-full border border-[#D28A4C]'}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function DetailField({ title, value }: { title: string; value: string }) {
  return (
    <p>
      <strong className="block text-[#F5F1EB]">{title}</strong>
      <span>{value}</span>
    </p>
  );
}
