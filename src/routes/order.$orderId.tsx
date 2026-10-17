import { useNavigate, createFileRoute, Link } from '@tanstack/react-router';
import { Check, X } from 'lucide-react';
import { useOrder, useWallets } from '../api/hooks';
import { requireAuthenticatedRoute } from '../api/route-guards';
import { formatEth } from '../lib/money';

export const Route = createFileRoute('/order/$orderId')({
  beforeLoad: () => requireAuthenticatedRoute('order'),
  component: OrderPage,
});

function OrderPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const order = useOrder(orderId);
  const wallets = useWallets();

  if (order.isPending) {
    return <p role="status" className="text-sm text-[#D28A4C]">Carregando pedido…</p>;
  }
  if (order.isError) {
    return (
      <main className="w-full max-w-[540px] border border-[#503523] bg-[#21150f] p-6">
        <p role="alert" className="text-red-200">Não foi possível carregar este pedido.</p>
        <button type="button" onClick={() => void order.refetch()} className="mt-3 text-sm text-[#D28A4C] underline">Tentar novamente</button>
      </main>
    );
  }

  if (order.data.status === 'pending') {
    return (
      <main className="w-full max-w-[540px] border border-[#503523] border-b-4 border-b-[#D28A4C] bg-[#21150f] p-6 sm:p-8">
        <h1 className="text-lg font-bold text-[#F5F1EB]">Pedido em processamento</h1>
        <p role="status" className="mt-3 text-sm leading-6 text-[#bba181]">A confirmação está pendente. Esta página verifica atualizações automaticamente e pode ser reaberta após atualizar.</p>
        <p className="mt-3 text-xs text-[#8f7254]">Pedido {order.data.id}</p>
        <button type="button" onClick={() => void order.refetch()} className="mt-5 rounded-[4px] bg-[#D28A4C] px-4 py-2 text-sm font-bold text-[#17100b]">Verificar novamente</button>
      </main>
    );
  }

  if (order.data.status === 'confirmed' && !order.data.receipt) {
    return <p role="status" className="text-sm text-[#D28A4C]">Pedido confirmado. Carregando recibo…</p>;
  }

  if (order.data.status === 'rejected') {
    return (
      <main className="w-full max-w-[540px] border border-[#503523] border-b-4 border-b-[#D28A4C] bg-[#21150f] p-6 sm:p-8">
        <h1 className="text-lg font-bold text-[#F5F1EB]">Pagamento recusado</h1>
        <p role="status" className="mt-3 text-sm leading-6 text-[#bba181]">{order.data.rejectionReason ?? 'O pagamento não foi confirmado.'}</p>
        <p className="mt-3 text-xs text-[#8f7254]">Os itens permanecem no carrinho; nenhum recibo de compra foi criado.</p>
        <Link to="/cart" className="mt-5 inline-flex rounded-[4px] bg-[#D28A4C] px-4 py-2 text-sm font-bold text-[#17100b]">Voltar ao carrinho</Link>
      </main>
    );
  }

  const receipt = order.data.receipt;
  if (!receipt) return <p role="status" className="text-sm text-[#D28A4C]">Carregando recibo…</p>;

  const wallet = wallets.data?.wallets.find((item) => item.network === receipt.network)
    ?? wallets.data?.wallets[0];
  const date = new Date(receipt.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const transactionId = receipt.transactionReference;

  return (
    <article className="relative w-full max-w-[540px] border-x border-t border-[#503523] border-b-4 border-b-[#D28A4C] bg-[#21150f] pb-8 text-[#F5F1EB] shadow-[0_18px_60px_rgba(0,0,0,0.4)]">
      <header className="relative border-b border-[#70482c] px-6 pb-5 pt-16 text-center">
        <button type="button" aria-label="Fechar confirmação" onClick={() => void navigate({ to: '/' })} className="absolute right-3 top-2 flex size-6 items-center justify-center text-[#D28A4C] hover:text-[#f0a66e]">
          <X aria-hidden="true" size={14} />
        </button>
        <span aria-hidden="true" className="absolute left-1/2 top-2 -translate-x-1/2 rounded-t-[5px] border border-[#D28A4C] px-2 py-0.5 text-[9px] font-bold tracking-[0.14em] text-[#D28A4C]">THANK YOU</span>
        {receipt.items[0] ? (
          <img src={receipt.items[0].imageUrl} alt="" className="absolute left-1/2 top-5 size-12 -translate-x-1/2 rounded-full border-[3px] border-[#70482c] object-cover shadow-lg" />
        ) : (
          <span className="absolute left-1/2 top-5 flex size-12 -translate-x-1/2 items-center justify-center rounded-full border-[3px] border-[#70482c] bg-[#D28A4C] text-[#17100b]"><Check aria-hidden="true" size={20} /></span>
        )}
        <p className="text-[13px] leading-5 text-[#e8d2b3]">Seus NFTs agora estão na sua carteira</p>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-[#70482c] px-6 py-4 text-[10px] sm:grid-cols-4">
        <div className="min-w-0 border-r border-[#70482c] pr-2"><dt className="text-[#bba181]">ID da transação</dt><dd className="truncate text-[11px] text-[#d7c7b4]">{transactionId}</dd></div>
        <div className="min-w-0 border-r border-[#70482c] pr-2"><dt className="text-[#bba181]">Data</dt><dd className="truncate text-[11px] text-[#d7c7b4]">{date}</dd></div>
        <div className="min-w-0 border-r border-[#70482c] pr-2"><dt className="text-[#bba181]">Total</dt><dd className="truncate text-[11px] text-[#d7c7b4]">{formatEth(receipt.totalEth)} ETH</dd></div>
        <div className="min-w-0"><dt className="text-[#bba181]">Carteira</dt><dd className="truncate text-[11px] text-[#d7c7b4]">{wallet?.provider ?? receipt.network}</dd></div>
      </dl>

      <section className="px-6 pt-4" aria-labelledby="receipt-title">
        <h1 id="receipt-title" className="mb-2 text-[13px] font-bold">Detalhes da transação</h1>
        <div className="grid grid-cols-[minmax(0,1fr)_68px_96px] gap-3 border-b border-[#503523] pb-2 text-[11px] font-bold text-[#d7c7b4]">
          <span>NFTs</span><span className="text-center">Edições</span><span className="text-right">Subtotal</span>
        </div>
        <ul>
          {receipt.items.map((item) => (
            <li key={`${item.nftId}:${item.editionId}`} className="grid grid-cols-[minmax(0,1fr)_68px_96px] items-center gap-3 border-b border-[#503523] py-2.5">
              <span className="flex min-w-0 items-center gap-3">
                <img src={item.imageUrl} alt="" className="size-12 shrink-0 rounded-[5px] object-cover" />
                <span className="min-w-0"><span className="block truncate text-[12px] font-bold">{item.name}</span><span className="block truncate text-[10px] text-[#9f805c]">ID do token: {item.tokenId ?? item.nftId}</span></span>
              </span>
              <span className="text-center text-[11px] text-[#bba181]">(× {item.quantity})</span>
              <span className="text-right text-[11px] font-bold text-[#D28A4C]">{formatEth(item.totalPriceEth)} ETH</span>
            </li>
          ))}
        </ul>
      </section>

      <dl className="ml-auto mt-4 w-[230px] space-y-2 px-6 text-right text-[11px] text-[#d7c7b4]">
        <div className="flex justify-between gap-3"><dt>Subtotal</dt><dd>{formatEth(receipt.subtotalEth)} ETH</dd></div>
        {Number(receipt.discountEth) > 0 && <div className="flex justify-between gap-3"><dt>Desconto</dt><dd>− {formatEth(receipt.discountEth)} ETH</dd></div>}
        <div className="flex justify-between gap-3"><dt>Taxa de rede</dt><dd>{formatEth(receipt.networkFeeEth)} ETH</dd></div>
        <div className="flex justify-between gap-3 border-t border-[#503523] pt-1 font-bold"><dt>Total</dt><dd className="text-[#D28A4C]">{formatEth(receipt.totalEth)} ETH</dd></div>
      </dl>

      <p className="mx-6 mt-4 border-t border-[#503523] pt-3 text-center text-[10px] leading-4 text-[#9f805c]">
        Transação simulada confirmada na {receipt.network}. Sua compra está registrada neste recibo.
      </p>
      <a href={receipt.explorerUrl} target="_blank" rel="noopener noreferrer" className="mx-auto mt-4 flex h-9 w-fit items-center justify-center rounded-[4px] bg-[#D28A4C] px-5 text-[11px] font-bold text-[#17100b] transition-colors hover:bg-[#e19b5f]">
        Ver no explorador
      </a>
    </article>
  );
}
