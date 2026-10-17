import { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowRight, Search, SlidersHorizontal } from 'lucide-react';
import heroMonkey from '../assets/nft-monkey-1.png';
import { useNftList } from '../api/hooks';
import { NFTCard } from '../components/marketplace/NFTCard';

type CatalogSort = 'recent' | 'newest' | 'trending' | 'price-low' | 'price-high';

type CatalogSearch = Partial<{
  q: string;
  collection: string;
  network: string;
  sort: CatalogSort;
  minPrice: number;
  maxPrice: number;
  page: number;
}>;

const catalogSorts: CatalogSort[] = ['recent', 'newest', 'trending', 'price-low', 'price-high'];

function validateCatalogSearch(search: Record<string, unknown>): CatalogSearch {
  const sort = typeof search.sort === 'string' && catalogSorts.includes(search.sort as CatalogSort)
    ? search.sort as CatalogSort
    : 'recent';
  const requestedMinPrice = Number(search.minPrice);
  const minPrice = Number.isFinite(requestedMinPrice)
    ? Math.min(Math.max(Math.trunc(requestedMinPrice), 2), 1229)
    : 2;
  const requestedMaxPrice = Number(search.maxPrice);
  const maxPrice = Number.isFinite(requestedMaxPrice)
    ? Math.min(Math.max(Math.trunc(requestedMaxPrice), minPrice + 1), 1230)
    : 1230;
  const page = Number(search.page);

  return {
    q: typeof search.q === 'string' ? search.q : undefined,
    collection: typeof search.collection === 'string' ? search.collection : undefined,
    network: typeof search.network === 'string' ? search.network : undefined,
    sort,
    minPrice,
    maxPrice,
    page: Number.isFinite(page) && page >= 1 ? Math.trunc(page) : 1,
  };
}

export const Route = createFileRoute('/')({
  validateSearch: validateCatalogSearch,
  component: CatalogPage,
});

function CatalogPage() {
  const routeSearch = Route.useSearch();
  const search = {
    q: '',
    collection: '',
    network: '',
    sort: 'recent' as CatalogSort,
    minPrice: 2,
    maxPrice: 1230,
    page: 1,
    ...routeSearch,
  };
  const navigate = Route.useNavigate();
  const { data, isLoading, isError, refetch, isPlaceholderData } = useNftList({ ...search, limit: 9 });
  const { data: catalogData } = useNftList({ page: 1, limit: 27 });
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const priceRangeKey = `${search.minPrice}:${search.maxPrice}`;
  const [draftPriceRange, setDraftPriceRange] = useState({
    key: priceRangeKey,
    value: [search.minPrice, search.maxPrice] as [number, number],
  });
  if (draftPriceRange.key !== priceRangeKey) {
    setDraftPriceRange({
      key: priceRangeKey,
      value: [search.minPrice, search.maxPrice],
    });
  }
  const draftRange = draftPriceRange.value;
  const nfts = data?.data ?? [];
  const collectionOptions = [...new Set((catalogData?.data ?? []).map((nft) => nft.collection))].sort();
  const networkOptions = [...new Set((catalogData?.data ?? []).map((nft) => nft.network).filter(Boolean))].sort();
  const featuredNft = catalogData?.data[0];
  const currentPage = data?.page ?? search.page;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / 9));

  useEffect(() => {
    if (data && !isPlaceholderData && data.page !== search.page) {
      void navigate({ search: (previous) => ({ ...previous, page: data.page }), replace: true });
    }
  }, [data, isPlaceholderData, navigate, search.page]);

  const mobileLeftColumn = nfts.filter((_, index) => index % 2 === 0);
  const mobileRightColumn = nfts.filter((_, index) => index % 2 === 1);

  const updateCatalogSearch = (updates: Partial<CatalogSearch>, replace = false) => {
    void navigate({
      search: (previous) => ({ ...previous, ...updates }),
      replace,
    });
  };

  const setDraftMinimum = (value: number) => {
    setDraftPriceRange((current) => ({
      ...current,
      value: [Math.min(value, current.value[1] - 1), current.value[1]],
    }));
  };
  const setDraftMaximum = (value: number) => {
    setDraftPriceRange((current) => ({
      ...current,
      value: [current.value[0], Math.max(value, current.value[0] + 1)],
    }));
  };

  return (
    <div>
      <div className="mx-auto mb-3 flex h-[45px] w-full max-w-[366px] items-center gap-2 rounded-[8px] bg-[#21150f] p-1 lg:hidden">
        <label htmlFor="mobile-search" className="flex min-w-0 flex-1 items-center gap-2 px-2.5 text-[#bba181]">
          <Search aria-hidden="true" size={16} strokeWidth={1.7} />
          <input
            id="mobile-search"
            type="search"
            value={search.q ?? ''}
            onChange={(event) => updateCatalogSearch({ q: event.target.value, page: 1 }, true)}
            placeholder="Explorar coleções"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-[#F5F1EB] outline-none placeholder:text-[#b08d64]"
          />
        </label>
        <button
          type="button"
          aria-label="Mostrar filtros"
          aria-expanded={showMobileFilters}
          onClick={() => setShowMobileFilters((visible) => !visible)}
          className="flex size-[36px] shrink-0 items-center justify-center rounded-[7px] bg-[#D28A4C] text-[#17100b]"
        >
          <SlidersHorizontal aria-hidden="true" size={18} />
        </button>
      </div>

      <section aria-label="Banner de boas-vindas" className="relative mx-auto mb-3 h-[190px] w-full max-w-[366px] overflow-hidden rounded-[12px] bg-[#21150f] p-3 lg:hidden">
        <div className="relative z-10 h-[156px] w-[188px]">
          <p className="h-4 text-[12px] font-medium leading-4 text-[#F5F1EB]">Bem-vindo à Kurio</p>
          <h1 className="mt-1 h-[58px] w-[190px] text-[18px] font-bold leading-[29px] text-[#F5F1EB]">SEJA DONO DA CULTURA DIGITAL</h1>
          <p className="mt-1 h-[54px] w-[188px] text-[12px] leading-[18px] text-[#CFB28C]">Descubra NFTs selecionados de criadores do mundo todo.</p>
          <a href="#catalogo" className="mt-1 inline-flex h-[14px] items-center gap-1.5 text-[12px] font-bold leading-[14px] text-[#E89B55]">
            EXPLORAR <ArrowRight aria-hidden="true" className="size-[10px]" strokeWidth={1.5} />
          </a>
        </div>
        <div className="absolute right-3 top-2 z-10 h-[146px] w-[138px]">
          <img src={heroMonkey} alt="Macaco com óculos e jaqueta verde" className="absolute right-0 top-0 size-[112px] rounded-[15px] object-cover" />
        </div>
        <div aria-hidden="true" className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-[6px]">
          <span className="size-[7px] rounded-full bg-[#D28A4C]" /><span className="size-[7px] rounded-full bg-[#D28A4C]" /><span className="size-[7px] rounded-full bg-[#D28A4C]" />
        </div>
      </section>

      <section
        aria-labelledby="home-hero-title"
        className="relative mx-auto hidden min-h-[450px] w-full max-w-[1200px] grid-cols-1 overflow-hidden bg-[#100a06] lg:grid lg:h-[450px] lg:grid-cols-[minmax(0,1fr)_450px]"
      >
        <div className="relative z-10 flex min-h-[450px] items-center px-8 py-10 sm:px-10">
          <div className="-translate-y-6">
            <p className="h-[16px] w-[600px] max-w-full text-[14px] font-medium leading-[16px] tracking-[0.1em] text-[#F5F1EB]">
              Bem-vindo à Kurio
            </p>
            <h1 id="home-hero-title" className="mt-5 h-[140px] w-[600px] max-w-full text-[43px] font-bold leading-[70px] tracking-normal text-[#F5F1EB]">
              SEJA DONO DO FUTURO
              <br />
              DA ARTE DIGITAL
            </h1>
            <p className="mt-3 h-[72px] w-[557px] max-w-full text-[14px] leading-[24px] text-[#CFB28C]">
              Descubra NFTs selecionados de criadores emergentes e consagrados.
              Colecione arte digital rara, apoie artistas e tenha uma parte da
              cultura da internet.
            </p>
            <a href="#catalogo" className="mt-8 inline-flex h-[40px] w-[140px] items-center justify-center gap-[10px] rounded-[6px] bg-[#D28A4C] py-[10px] pl-[28px] pr-[36px] text-sm font-bold text-[#17100b] transition-colors hover:bg-[#e19b5f]">
              EXPLORAR
            </a>
          </div>
        </div>
        <div aria-hidden="true" className="absolute bottom-10 left-0 z-20 hidden w-[calc(100%_-_450px)] items-center justify-center gap-2.5 lg:flex">
          <span className="size-2 rounded-full bg-[#e89a5e]" />
          <span className="size-2 rounded-full bg-[#e89a5e]" />
          <span className="size-2 rounded-full bg-[#e89a5e]" />
        </div>
        <img
          src={heroMonkey}
          alt="Ilustração 3D de um macaco usando óculos escuros e jaqueta verde"
          className="h-[320px] w-full rounded-[24px] object-cover object-center lg:col-start-2 lg:row-start-1 lg:h-[450px] lg:w-[450px]"
        />
      </section>

      <section id="catalogo" aria-label="Catálogo de NFTs" className="mt-3 grid grid-cols-1 items-start gap-4 lg:mt-12 lg:grid-cols-[310px_minmax(0,1fr)] lg:gap-12">
        <aside className={`${showMobileFilters ? 'block' : 'hidden'} space-y-5 lg:block`}>
          <div className="bg-[#21150f] px-5 py-5 text-[12px] leading-5 text-[#CFB28C]">
            <FilterGroup title="Coleções">
              <ul className="space-y-1">
                {collectionOptions.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      aria-pressed={search.collection === name}
                      onClick={() => updateCatalogSearch({
                        collection: search.collection === name ? undefined : name,
                        page: 1,
                      })}
                      className={[
                        'flex w-full scroll-mb-36 items-center justify-between py-[2px] text-left transition-colors hover:text-[#e89a5e]',
                        search.collection === name ? 'text-[#e89a5e]' : 'text-[#bba181]',
                      ].join(' ')}
                    >
                      <span>{name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </FilterGroup>

            <div className="my-5 border-t border-[#3b2920]" />

            <FilterGroup title="Faixa de preço">
              <PriceSlider min={draftRange[0]} max={draftRange[1]} onMinChange={setDraftMinimum} onMaxChange={setDraftMaximum} />
              <p className="mt-3 text-[11px] text-[#cdb99d]">
                Preço: {(draftRange[0] / 100).toFixed(2).replace('.', ',')} – {(draftRange[1] / 100).toFixed(2).replace('.', ',')} ETH
              </p>
              <button
                type="button"
                onClick={() => updateCatalogSearch({ minPrice: draftRange[0], maxPrice: draftRange[1], page: 1 })}
                className="mt-2 rounded-[4px] bg-[#D28A4C] px-3 py-1 text-[11px] font-bold text-[#17100b] transition-colors hover:bg-[#e19b5f]"
              >
                Aplicar
              </button>
            </FilterGroup>

            <div className="my-5 border-t border-[#3b2920]" />

            <FilterGroup title="Rede">
              <ul className="space-y-1">
                {networkOptions.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      aria-pressed={search.network === name}
                      onClick={() => updateCatalogSearch({
                        network: search.network === name ? undefined : name,
                        page: 1,
                      })}
                      className={[
                        'flex w-full scroll-mb-36 items-center justify-between py-[2px] text-left transition-colors hover:text-[#e89a5e]',
                        search.network === name ? 'text-[#e89a5e]' : 'text-[#bba181]',
                      ].join(' ')}
                    >
                      <span>{name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </FilterGroup>
          </div>

          {featuredNft && (
            <article
              className="hidden h-[470px] w-[310px] flex-col gap-[10px] px-2 pb-1 pt-6 text-center lg:flex"
              style={{ background: 'linear-gradient(180deg, rgba(210, 138, 76, 0.1) 0%, rgba(210, 138, 76, 0.03) 100%)' }}
            >
              <h2 className="text-[16px] font-bold leading-5 uppercase tracking-wide text-[#e89a5e]">Do catálogo</h2>
              <a href={`/nft/${featuredNft.id}`} className="flex min-h-0 flex-1 flex-col gap-3 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D28A4C]">
                <img src={featuredNft.imageUrl} alt={featuredNft.name} className="min-h-0 w-full flex-1 rounded-[14px] object-cover object-center" />
                <span className="text-sm font-semibold text-[#F5F1EB]">{featuredNft.name}</span>
                <span className="text-xs text-[#D28A4C]">{featuredNft.priceEth} ETH</span>
              </a>
            </article>
          )}
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 lg:mb-5">
            <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-1">
              <label className="hidden h-9 max-w-[360px] items-center gap-2 rounded-[6px] border border-[#503523] px-3 text-[#bba181] lg:flex">
                <Search aria-hidden="true" size={15} />
                <input
                  aria-label="Buscar NFTs"
                  type="search"
                  value={search.q ?? ''}
                  onChange={(event) => updateCatalogSearch({ q: event.target.value, page: 1 }, true)}
                  placeholder="Buscar por NFT ou coleção"
                  className="min-w-0 flex-1 bg-transparent text-[11px] text-[#F5F1EB] outline-none placeholder:text-[#8F7254]"
                />
              </label>
              <div role="tablist" aria-label="Tipo de listagem" className="flex w-full flex-nowrap items-center gap-x-3 overflow-x-auto sm:gap-x-5">
                {([
                  ['Todos os NFTs', 'recent'],
                  ['Novos lançamentos', 'newest'],
                  ['Em alta', 'trending'],
                ] as const).map(([tab, sort]) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={search.sort === sort}
                    onClick={() => updateCatalogSearch({ sort, page: 1 })}
                    className={[
                      'whitespace-nowrap border-b pb-[3px] text-[10px] transition-colors sm:text-[12px]',
                      search.sort === sort ? 'border-[#e89a5e] font-semibold text-[#e89a5e]' : 'border-transparent text-[#F5F1EB] hover:text-[#e89a5e]',
                    ].join(' ')}
                  >{tab}</button>
                ))}
              </div>
            </div>

            <label className="hidden items-center gap-1 text-[11px] text-[#F5F1EB] lg:flex">
              <span className="whitespace-nowrap">Ordenar por:</span>
              <select
                value={search.sort === 'price-low' || search.sort === 'price-high' ? search.sort : 'recent'}
                onChange={(event) => updateCatalogSearch({ sort: event.target.value as CatalogSort, page: 1 })}
                className="max-w-[190px] cursor-pointer appearance-none border-0 bg-transparent p-0 text-[11px] text-[#d6c9b9] outline-none"
              >
                <option value="recent" className="bg-[#21150f]">Listados recentemente</option>
                <option value="price-low" className="bg-[#21150f]">Menor preço</option>
                <option value="price-high" className="bg-[#21150f]">Maior preço</option>
              </select>
            </label>
          </div>

          {isLoading ? (
            <div className="animate-pulse py-8 text-sm text-[#e89a5e]">Carregando catálogo...</div>
          ) : isError ? (
            <div className="py-8 text-sm text-[#bba181]">
              <p role="alert">Não foi possível carregar os NFTs agora. Tente novamente em instantes.</p>
              <button type="button" onClick={() => void refetch()} className="mt-3 rounded-[4px] border border-[#D28A4C] px-3 py-1 text-[#D28A4C] hover:bg-[#21150f]">
                Tentar novamente
              </button>
            </div>
          ) : nfts.length === 0 ? (
            <p className="py-8 text-sm text-[#bba181]">Nenhum NFT encontrado com esses filtros.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 items-start gap-x-4 lg:hidden">
                <div className="flex min-w-0 flex-col gap-y-6">
                  {mobileLeftColumn.map((nft) => <NFTCard key={nft.id} nft={nft} />)}
                </div>
                <div className="flex min-w-0 flex-col gap-y-6 pt-8">
                  {mobileRightColumn.map((nft) => <NFTCard key={nft.id} nft={nft} />)}
                </div>
              </div>
              <div className="hidden grid-cols-2 gap-x-5 gap-y-8 lg:grid xl:grid-cols-3">
                {nfts.map((nft) => <NFTCard key={nft.id} nft={nft} />)}
              </div>
            </>
          )}

          {nfts.length > 0 && <nav aria-label="Paginação do catálogo" className="mt-12 flex scroll-mb-36 justify-end gap-1.5">
            {Array.from({ length: pageCount }, (_, index) => index + 1).map((page) => (
              <button
                key={page}
                type="button"
                aria-current={currentPage === page ? 'page' : undefined}
                onClick={() => updateCatalogSearch({ page })}
                className={[
                  'flex size-8 items-center justify-center rounded-[3px] border text-[12px] transition-colors',
                  currentPage === page ? 'border-[#D28A4C] bg-[#D28A4C] font-bold text-[#17100b]' : 'border-[#503523] text-[#e7d7c4] hover:border-[#D28A4C] hover:text-[#D28A4C]',
                ].join(' ')}
              >{page}</button>
            ))}
            <button
              type="button"
              aria-label="Próxima página"
              disabled={currentPage >= pageCount}
              onClick={() => updateCatalogSearch({ page: Math.min(currentPage + 1, pageCount) })}
              className="flex size-8 items-center justify-center rounded-[3px] border border-[#503523] text-[12px] text-[#e7d7c4] transition-colors hover:border-[#D28A4C] hover:text-[#D28A4C] disabled:cursor-not-allowed disabled:opacity-40"
            >›</button>
          </nav>}
        </div>
      </section>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="mb-2 font-bold text-[#F5F1EB]">{title}</h2>{children}</section>;
}

function PriceSlider({ min, max, onMinChange, onMaxChange }: { min: number; max: number; onMinChange: (value: number) => void; onMaxChange: (value: number) => void }) {
  const minPosition = (min / 1230) * 100 + '%';
  const maxPosition = 100 - (max / 1230) * 100 + '%';

  return (
    <div className="relative mt-3 h-3">
      <div className="absolute left-1 right-1 top-1/2 h-[2px] -translate-y-1/2 bg-[#d28a4c]" />
      <div className="absolute top-1/2 h-[2px] -translate-y-1/2 bg-[#80512f]" style={{ left: minPosition, right: maxPosition }} />
      <input aria-label="Preço mínimo" className="price-range-input" type="range" min={2} max={1229} value={min} onChange={(event) => onMinChange(Number(event.target.value))} />
      <input aria-label="Preço máximo" className="price-range-input" type="range" min={3} max={1230} value={max} onChange={(event) => onMaxChange(Number(event.target.value))} />
    </div>
  );
}
