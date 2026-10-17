import { useRef, useState, type FormEvent } from 'react';
import type { ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { isApiError } from '../api/client';
import { useWalletMutations, useWallets } from '../api/hooks';
import { AccountSidebar } from '../components/marketplace/AccountSidebar';
import { requireAuthenticatedRoute } from '../api/route-guards';
import type { WalletRequest, WalletResponse } from '../contracts/api';

export const Route = createFileRoute('/wallets')({
  beforeLoad: () => requireAuthenticatedRoute('account'),
  component: CollectorWalletsPage,
});

type WalletForm = Pick<WalletRequest, 'nickname' | 'address' | 'network' | 'provider'>;
type WalletField = keyof WalletForm;
const emptyForm: WalletForm = { nickname: '', address: '', network: '', provider: '' };
const inputClass = 'h-[34px] w-full rounded-[3px] border border-[#3F2319] bg-[#100A06] px-3 text-[11px] text-[#F5F1EB] outline-none placeholder:text-[#8F7254] focus:border-[#D28A4C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D28A4C]';

function CollectorWalletsPage() {
  const walletsQuery = useWallets();
  const mutations = useWalletMutations();
  const walletList = walletsQuery.data?.wallets ?? [];
  const primary = walletList.find((wallet) => wallet.role === 'primary');
  const secondary = walletList.find((wallet) => wallet.role === 'secondary');
  const [primaryOverrides, setPrimaryOverrides] = useState<Partial<WalletForm>>({});
  const [secondaryOverrides, setSecondaryOverrides] = useState<Partial<WalletForm>>({});
  const [sameAsPrimary, setSameAsPrimary] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState('');
  const submitLock = useRef(false);

  const primaryForm = { ...toWalletForm(primary), ...primaryOverrides };
  const secondaryForm = { ...toWalletForm(secondary), ...secondaryOverrides };
  const secondaryVisible = showSecondary || Boolean(secondary);

  const saveWallet = async (event: FormEvent<HTMLFormElement>, role: WalletRequest['role']) => {
    event.preventDefault();
    if (submitLock.current) return;
    setStatus('');
    setFieldErrors({});
    if (!event.currentTarget.reportValidity()) {
      event.currentTarget.querySelector<HTMLElement>(':invalid')?.focus();
      return;
    }
    submitLock.current = true;
    const form = role === 'primary' ? primaryForm : secondaryForm;
    const wallet = role === 'primary' ? primary : secondary;
    const request: WalletRequest = {
      ...form,
      ...(role === 'secondary' && sameAsPrimary && primaryForm.address ? { address: primaryForm.address } : {}),
      role,
    };
    try {
      if (wallet) await mutations.update.mutateAsync({ walletId: wallet.id, request });
      else await mutations.create.mutateAsync(request);
      setStatus(`Carteira ${role === 'primary' ? 'principal' : 'secundária'} salva.`);
    } catch (error) {
      if (isApiError(error)) {
        setStatus(error.message);
        setFieldErrors(error.fieldErrors ?? {});
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      } else setStatus('Não foi possível salvar a carteira.');
    } finally {
      submitLock.current = false;
    }
  };

  if (walletsQuery.isLoading) {
    return <AccountWalletShell><div role="status" aria-label="Carregando carteiras" className="h-64 animate-pulse rounded bg-[#21150f] motion-reduce:animate-none" /></AccountWalletShell>;
  }
  if (walletsQuery.isError) {
    return <AccountWalletShell><div role="alert" className="text-sm text-red-200">Não foi possível carregar as carteiras. <button type="button" onClick={() => void walletsQuery.refetch()} className="underline">Tentar novamente</button></div></AccountWalletShell>;
  }

  return (
    <AccountWalletShell>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[14px] font-bold leading-5 text-[#F5F1EB]">Carteira principal</h1>
          <p className="mt-1 text-[11px] leading-[17px] text-[#bba181]">Estas carteiras ficam disponíveis no pagamento e para receber NFTs comprados.</p>
        </div>
        {!secondaryVisible && <button type="button" onClick={() => setShowSecondary(true)} className="shrink-0 pt-0.5 text-[11px] font-bold text-[#D28A4C] hover:text-[#f0a66e]">Adicionar secundária</button>}
      </div>

      <WalletFormView form={primaryForm} setForm={(update) => setPrimaryOverrides((previous) => ({ ...previous, ...update({ ...toWalletForm(primary), ...previous }) }))} errors={fieldErrors} pending={mutations.create.isPending || mutations.update.isPending} onSubmit={(event) => void saveWallet(event, 'primary')} submitLabel={primary ? 'Atualizar carteira principal' : 'Salvar carteira principal'} />

      <section className="mt-6 border-t border-[#3F2319] pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-bold leading-5 text-[#F5F1EB]">Carteira secundária</h2>
            <p className="mt-1 text-[11px] leading-[17px] text-[#bba181]">{secondaryVisible ? 'Cadastre ou atualize sua carteira secundária.' : 'Você ainda não adicionou uma carteira secundária.'}</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[#d7c7b4]">
            <input type="checkbox" checked={sameAsPrimary} onChange={(event) => setSameAsPrimary(event.target.checked)} className="size-3 accent-[#D28A4C]" />
            Igual à carteira principal
          </label>
        </div>
        {secondaryVisible && (
          <WalletFormView form={sameAsPrimary ? { ...secondaryForm, address: primaryForm.address } : secondaryForm} setForm={(update) => setSecondaryOverrides((previous) => ({ ...previous, ...update({ ...toWalletForm(secondary), ...previous }) }))} errors={fieldErrors} pending={mutations.create.isPending || mutations.update.isPending} onSubmit={(event) => void saveWallet(event, 'secondary')} submitLabel={secondary ? 'Atualizar carteira secundária' : 'Salvar carteira secundária'} addressDisabled={sameAsPrimary} />
        )}
      </section>
      {status && <p role="status" aria-live="polite" className="mt-3 text-[11px] text-[#D28A4C]">{status}</p>}
    </AccountWalletShell>
  );
}

function toWalletForm(wallet?: WalletResponse): WalletForm {
  return wallet
    ? { nickname: wallet.nickname, address: wallet.address, network: wallet.network, provider: wallet.provider }
    : emptyForm;
}

function WalletFormView({
  form, setForm, errors, pending, onSubmit, submitLabel, addressDisabled = false,
}: {
  form: WalletForm;
  setForm: (update: (current: WalletForm) => WalletForm) => void;
  errors: Record<string, string[]>;
  pending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  addressDisabled?: boolean;
}) {
  const update = (field: WalletField, value: string) => setForm((current) => ({ ...current, [field]: value }));
  return (
    <form noValidate onSubmit={onSubmit}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <WalletField label="Apelido da carteira" field="nickname" value={form.nickname} error={errors.nickname?.join(' ')} required onChange={update} />
        <WalletField label="Rede" field="network" value={form.network} error={errors.network?.join(' ')} required onChange={update} options={['Ethereum', 'Polygon', 'Solana', 'Base']} />
        <WalletField label="Endereço da carteira" field="address" value={form.address} error={errors.address?.join(' ')} required onChange={update} disabled={addressDisabled} placeholder="Endereço público da carteira" />
        <WalletField label="Provedor" field="provider" value={form.provider} error={errors.provider?.join(' ')} required onChange={update} options={['MetaMask', 'WalletConnect', 'Coinbase Wallet']} />
      </div>
      <button type="submit" disabled={pending} className="mt-5 flex h-[34px] items-center justify-center rounded-[3px] bg-[#D28A4C] px-4 text-[11px] font-bold text-[#17100b] transition-colors hover:bg-[#e19b5f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D28A4C] disabled:opacity-50">
        {pending ? 'Salvando…' : submitLabel}
      </button>
    </form>
  );
}

function WalletField({
  label, field, value, error, onChange, required = false, options, disabled = false, placeholder,
}: {
  label: string;
  field: WalletField;
  value: string;
  error?: string;
  onChange: (field: WalletField, value: string) => void;
  required?: boolean;
  options?: string[];
  disabled?: boolean;
  placeholder?: string;
}) {
  const id = `wallet-${field}-${label.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[11px] text-[#F5F1EB]">{label}{required && <span aria-hidden="true" className="text-[#E86F47]"> *</span>}</label>
      {options ? (
        <select id={id} required={required} value={value} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => onChange(field, event.target.value)} className={`${inputClass} bg-[#100A06] ${value ? '' : 'text-[#8F7254]'}`}>
          <option value="">Selecione</option>{options.map((option) => <option key={option}>{option}</option>)}
        </select>
      ) : (
        <input id={id} required={required} value={value} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => onChange(field, event.target.value)} placeholder={placeholder} className={`${inputClass} disabled:opacity-60`} />
      )}
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

function AccountWalletShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto mt-2 grid max-w-[1006px] grid-cols-1 items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <AccountSidebar active="wallets" />
      <main className="min-w-0 px-2 pb-12 lg:px-0 lg:pb-0">{children}</main>
    </div>
  );
}
