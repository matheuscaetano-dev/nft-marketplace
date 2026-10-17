import { useState } from 'react';
import { Heart } from 'lucide-react';
import type { NFT } from '../../types';

export function NFTCard({ nft }: { nft: NFT }) {
  const [isFavorite, setIsFavorite] = useState(false);

  return (
    <div className="group relative block min-w-0">
      <a href={'/nft/' + encodeURIComponent(nft.id)} aria-label={'Ver detalhes de ' + nft.name} className="block min-w-0">
        <article>
          <div className="rounded-[18px] bg-[#21150f] p-[4px] transition-colors group-hover:bg-[#392317] lg:rounded-none">
          <img
            src={nft.imageUrl}
            srcSet={nft.imageUrl.startsWith('/assets/nft-monkey-')
              ? `${nft.imageUrl.replace('.webp', '-640.webp')} 640w, ${nft.imageUrl} 1254w`
              : undefined}
            sizes="(max-width: 1023px) 45vw, 30vw"
            alt={nft.name}
            width={1254}
            height={1254}
            loading={nft.id === '1' ? 'eager' : 'lazy'}
            fetchPriority={nft.id === '1' ? 'high' : 'auto'}
              className="aspect-square w-full rounded-[13px] object-cover transition-transform duration-300 group-hover:scale-[0.985] lg:rounded-[10px]"
          />
          </div>
          <div className="mt-1.5 px-1 lg:mt-2 lg:px-0">
            <h3 className="truncate text-[11px] leading-4 text-[#F5F1EB]">{nft.name}</h3>
            <p className="flex items-center gap-2 text-[12px] font-bold leading-4 text-[#e89a5e]">
              <span>{nft.priceEth} ETH</span>
              {nft.originalPriceEth && (
                <span className="font-normal text-[#a88768] line-through">
                  {nft.originalPriceEth} ETH
                </span>
              )}
            </p>
          </div>
        </article>
      </a>

      {nft.attributes?.some((attribute) => attribute.toLowerCase().includes('raro')) && (
        <span className="absolute left-0 top-2 z-10 bg-[#D28A4C] px-2 py-1 text-[9px] font-bold text-[#17100b] lg:hidden">RARO</span>
      )}
      <button
        type="button"
        aria-label={isFavorite ? `Remover ${nft.name} dos favoritos` : `Adicionar ${nft.name} aos favoritos`}
        aria-pressed={isFavorite}
        onClick={() => setIsFavorite((favorite) => !favorite)}
        className="absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-full bg-[#21150f]/90 text-[#D28A4C] lg:hidden"
      >
        <Heart aria-hidden="true" size={15} fill={isFavorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}
