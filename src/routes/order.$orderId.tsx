import { createFileRoute, Link } from '@tanstack/react-router';
import { useOrder } from '../api/hooks';
import { requireAuthenticatedRoute } from '../api/route-guards';
import { formatEth } from '../lib/money';

export const Route = createFileRoute('/order/$orderId')({
  beforeLoad: () => requireAuthenticatedRoute('order'),
  component: OrderPage,
});

function OrderPage() {
  const { orderId } = Route.useParams();
  const order = useOrder(orderId);

  if (order.isPending) {
    return <p role="status" className="py-12 text-[#D28A4C]">Carregando pedido…</p>;
  }
  if (order.isError) {
    return (
      <main className="mx-auto max-w-2xl py-12">
        <p role="alert" className="text-red-200">Não foi possível carregar este pedido.</p>
        <button type="button" onClick={() => void order.refetch()} className="mt-3 text-sm text-[#D28A4C] underline">Tentar novamente</button>
      </main>
    );
  }

  if (order.data.status === 'pending') {
    return (
      <main className="mx-auto max-w-2xl rounded-xl border border-[#503523] bg-[#21150f] p-6 sm:p-8">
        <h1 className="text-xl font-bold text-[#F5F1EB]">Pedido em processamento</h1>
        <p role="status" className="mt-3 text-sm text-[#bba181]">A confirmação está pendente. Esta página verifica atualizações automaticamente e pode ser reaberta após atualizar.</p>
        <p className="mt-3 text-xs text-[#8f7254]">Pedido {order.data.id}</p>
        <button type="button" onClick={() => void order.refetch()} className="mt-5 rounded bg-[#D28A4C] px-4 py-2 text-sm font-bold text-[#17100b]">Verificar novamente</button>
      </main>
    );
  }

  if (order.data.status === 'confirmed' && !order.data.receipt) {
    return <p role="status" className="py-12 text-[#D28A4C]">Pedido confirmado. Carregando recibo…</p>;
  }

  if (order.data.status === 'rejected') {
    return (
      <main className="mx-auto max-w-2xl rounded-xl border border-[#503523] bg-[#21150f] p-6 sm:p-8">
        <h1 className="text-xl font-bold text-[#F5F1EB]">Pagamento recusado</h1>
        <p role="status" className="mt-3 text-sm text-[#bba181]">{order.data.rejectionReason ?? 'O pagamento não foi confirmado.'}</p>
        <p className="mt-3 text-xs text-[#8f7254]">Os itens permanecem no carrinho; nenhum recibo de compra foi criado.</p>
        <Link to="/cart" className="mt-5 inline-flex rounded bg-[#D28A4C] px-4 py-2 text-sm font-bold text-[#17100b]">Voltar ao carrinho</Link>
      </main>
    );
  }

  const receipt = order.data.receipt;
  if (!receipt) return <p role="status" className="py-12 text-[#D28A4C]">Carregando recibo…</p>;
  return (
    <main className="mx-auto max-w-2xl rounded-xl border border-[#503523] bg-[#21150f] p-5 sm:p-8">
      <h1 className="text-xl font-bold text-[#F5F1EB]">Pedido confirmado</h1>
      <p className="mt-2 break-all text-sm text-[#bba181]">Referência: {receipt.transactionReference}</p>
      <dl className="mt-5 grid grid-cols-1 gap-3 border-y border-[#503523] py-4 text-sm sm:grid-cols-2">
        <div><dt className="text-[#bba181]">Rede</dt><dd className="mt-1 text-[#F5F1EB]">{receipt.network}</dd></div>
        <div><dt className="text-[#bba181]">Data</dt><dd className="mt-1 text-[#F5F1EB]">{new Date(receipt.createdAt).toLocaleString()}</dd></div>
      </dl>
      <h2 className="mt-5 text-sm font-bold text-[#F5F1EB]">Itens do recibo</h2>
      <ul className="mt-3 space-y-3">
        {receipt.items.map((item) => (
          <li key={`${item.nftId}:${item.editionId}`} className="flex items-center gap-3 border-b border-[#503523] pb-3">
            <img src={item.imageUrl} alt="" className="size-14 shrink-0 rounded object-cover" />
            <span className="min-w-0 flex-1"><span className="block text-sm text-[#F5F1EB]">{item.name} × {item.quantity}</span><span className="text-xs text-[#bba181]">{formatEth(item.unitPriceEth)} ETH cada</span></span>
            <span className="text-sm font-bold text-[#D28A4C]">{formatEth(item.totalPriceEth)} ETH</span>
          </li>
        ))}
      </ul>
      <dl className="ml-auto mt-5 max-w-xs space-y-2 text-sm">
        <div className="flex justify-between gap-4 text-[#bba181]"><dt>Subtotal</dt><dd>{formatEth(receipt.subtotalEth)} ETH</dd></div>
        <div className="flex justify-between gap-4 text-[#bba181]"><dt>Desconto</dt><dd>− {formatEth(receipt.discountEth)} ETH</dd></div>
        <div className="flex justify-between gap-4 text-[#bba181]"><dt>Taxa de rede</dt><dd>{formatEth(receipt.networkFeeEth)} ETH</dd></div>
        <div className="flex justify-between gap-4 border-t border-[#503523] pt-3 font-bold"><dt>Total</dt><dd className="text-[#D28A4C]">{formatEth(receipt.totalEth)} ETH</dd></div>
      </dl>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm">
        <Link to="/" hash="catalogo" className="text-[#D28A4C] underline">Continuar explorando</Link>
        <a href={receipt.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-[#D28A4C] underline">Ver transação simulada</a>
      </div>
    </main>
  );
}
