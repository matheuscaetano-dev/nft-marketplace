import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { ReactNode } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Eye, EyeOff, UserRound } from 'lucide-react';
import { isApiError } from '../api/client';
import { useProfile, useProfileMutations, useWallets } from '../api/hooks';
import { AccountSidebar } from '../components/marketplace/AccountSidebar';
import { requireAuthenticatedRoute } from '../api/route-guards';
import type { ProfileResponse } from '../contracts/api';

export const Route = createFileRoute('/profile')({
  beforeLoad: () => requireAuthenticatedRoute('account'),
  component: CollectorProfilePage,
});

type ProfileFieldKey = 'displayName' | 'username' | 'email' | 'ensName';
type ProfileFields = Pick<ProfileResponse, ProfileFieldKey>;
const avatarMimeTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};
const profileInputClass = 'h-[34px] w-full rounded-[3px] border border-[#3F2319] bg-[#100A06] px-3 text-[11px] text-[#F5F1EB] outline-none placeholder:text-[#8F7254] focus:border-[#D28A4C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D28A4C]';
const initialProfile: ProfileFields = { displayName: '', username: '', email: '', ensName: '' };

function CollectorProfilePage() {
  const profile = useProfile();
  const wallets = useWallets();
  const mutations = useProfileMutations();
  const [fieldOverrides, setFieldOverrides] = useState<Partial<ProfileFields>>({});
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null | undefined>();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState('');
  const submitLock = useRef(false);
  const passwordLock = useRef(false);

  const fields: ProfileFields = profile.data
    ? {
      displayName: fieldOverrides.displayName ?? profile.data.displayName,
      username: fieldOverrides.username ?? profile.data.username,
      email: fieldOverrides.email ?? profile.data.email,
      ensName: fieldOverrides.ensName ?? profile.data.ensName,
    }
    : initialProfile;

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitLock.current) return;
    setStatus('');
    setFieldErrors({});
    if (!event.currentTarget.reportValidity()) {
      event.currentTarget.querySelector<HTMLElement>(':invalid')?.focus();
      return;
    }
    submitLock.current = true;
    try {
      const updated = await mutations.update.mutateAsync({
        ...fields,
        ...(avatarDataUrl !== undefined ? { avatarDataUrl } : {}),
      });
      setFieldOverrides({
        displayName: updated.displayName,
        username: updated.username,
        email: updated.email,
        ensName: updated.ensName,
      });
      setAvatarDataUrl(updated.avatarDataUrl);
      setStatus('Perfil atualizado.');
    } catch (error) {
      if (isApiError(error)) {
        setStatus(error.message);
        setFieldErrors(error.fieldErrors ?? {});
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      } else setStatus('Não foi possível salvar o perfil.');
    } finally {
      submitLock.current = false;
    }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (passwordLock.current) return;
    setStatus('');
    setFieldErrors({});
    if (!event.currentTarget.reportValidity()) {
      event.currentTarget.querySelector<HTMLElement>(':invalid')?.focus();
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: ['A nova senha e a confirmação estão diferentes.'] });
      document.getElementById('profile-password-confirm')?.focus();
      return;
    }
    passwordLock.current = true;
    try {
      await mutations.changePassword.mutateAsync({ currentPassword, newPassword });
      setStatus('Senha alterada.');
    } catch (error) {
      if (isApiError(error)) {
        setStatus(error.message);
        setFieldErrors(error.fieldErrors ?? {});
        const firstField = Object.keys(error.fieldErrors ?? {})[0];
        if (firstField) document.getElementById(`profile-${firstField}`)?.focus();
      } else setStatus('Não foi possível alterar a senha.');
    } finally {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      passwordLock.current = false;
    }
  };

  const selectAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (avatarMimeTypes[extension] !== file.type || file.size > 1_000_000) {
      setStatus('Escolha PNG, JPEG, WebP ou GIF de até 1 MB.');
      event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarDataUrl(reader.result);
        setStatus('Pré-visualização atualizada. Salve o perfil para persistir.');
      }
    };
    reader.onerror = () => setStatus('Não foi possível ler este arquivo de imagem.');
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  if (profile.isLoading) {
    return <AccountPageShell><div role="status" aria-label="Carregando perfil" className="h-64 animate-pulse rounded bg-[#21150f] motion-reduce:animate-none" /></AccountPageShell>;
  }
  if (profile.isError || !profile.data) {
    return <AccountPageShell><div role="alert" className="text-sm text-red-200">Não foi possível carregar o perfil. <button type="button" onClick={() => void profile.refetch()} className="underline">Tentar novamente</button></div></AccountPageShell>;
  }

  return (
    <AccountPageShell>
      <h1 className="mb-6 text-[14px] font-bold leading-5 text-[#F5F1EB]">Perfil do colecionador</h1>
      <form noValidate onSubmit={(event) => void saveProfile(event)} className="max-w-[720px]">
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
          <ProfileField id="displayName" label="Nome de exibição" required value={fields.displayName} error={fieldErrors.displayName?.join(' ')} onChange={(value) => setFieldOverrides((previous) => ({ ...previous, displayName: value }))} />
          <ProfileField id="username" label="Nome de usuário" required value={fields.username} error={fieldErrors.username?.join(' ')} onChange={(value) => setFieldOverrides((previous) => ({ ...previous, username: value }))} />
          <ProfileField id="email" label="E-mail" required type="email" value={fields.email} error={fieldErrors.email?.join(' ')} onChange={(value) => setFieldOverrides((previous) => ({ ...previous, email: value }))} />
          <ProfileField id="ensName" label="Nome ENS" value={fields.ensName} error={fieldErrors.ensName?.join(' ')} onChange={(value) => setFieldOverrides((previous) => ({ ...previous, ensName: value }))} />
          <div>
            <span className="mb-2 block text-[11px] text-[#F5F1EB]">Avatar</span>
            <div className="flex h-[42px] items-center gap-4">
              {(avatarDataUrl === undefined ? profile.data.avatarDataUrl : avatarDataUrl)
                ? <img src={avatarDataUrl === undefined ? profile.data.avatarDataUrl : avatarDataUrl ?? undefined} alt="Pré-visualização do avatar" className="size-[36px] shrink-0 rounded-full object-cover" />
                : <span aria-label="Avatar padrão" className="flex size-[36px] shrink-0 items-center justify-center rounded-full bg-[#322017] text-[#D28A4C]"><UserRound aria-hidden="true" size={18} /></span>}
              <label className="flex h-[34px] cursor-pointer items-center justify-center rounded-[3px] bg-[#D28A4C] px-5 text-[11px] font-bold text-[#17100b] transition-colors hover:bg-[#e19b5f] focus-within:outline focus-within:outline-2 focus-within:outline-[#D28A4C]">
                Alterar
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Selecionar avatar" className="sr-only" onChange={selectAvatar} />
              </label>
              {(avatarDataUrl || profile.data.avatarDataUrl) && <button type="button" onClick={() => { setAvatarDataUrl(null); setStatus('Avatar removido da pré-visualização. Salve o perfil para persistir.'); }} className="text-[10px] text-[#d7c7b4] hover:text-[#D28A4C]">Remover</button>}
            </div>
            {fieldErrors.avatarDataUrl && <p className="mt-1 text-xs text-red-300">{fieldErrors.avatarDataUrl.join(' ')}</p>}
          </div>
          <div>
            <span className="mb-2 block text-[11px] text-[#F5F1EB]">Carteira principal</span>
            <p className="flex h-[34px] items-center text-[11px] text-[#bba181]">{wallets.data?.wallets.find((wallet) => wallet.role === 'primary')?.nickname ?? 'Nenhuma carteira cadastrada'}</p>
          </div>
        </div>
        <button type="submit" disabled={mutations.update.isPending} className="mt-5 flex h-[34px] min-w-[110px] items-center justify-center rounded-[3px] bg-[#D28A4C] px-5 text-[11px] font-bold text-[#17100b] transition-colors hover:bg-[#e19b5f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D28A4C] disabled:opacity-50">
          {mutations.update.isPending ? 'Salvando…' : 'Salvar perfil'}
        </button>
      </form>

      <form noValidate onSubmit={(event) => void savePassword(event)} className="mt-7 max-w-[349px] border-t border-[#3F2319] pt-5">
        <h2 className="mb-3 text-[13px] font-bold leading-5 text-[#F5F1EB]">Alterar senha</h2>
        <div className="space-y-4">
          <PasswordInput id="currentPassword" label="Senha atual" value={currentPassword} error={fieldErrors.currentPassword?.join(' ')} onChange={setCurrentPassword} visible={visiblePasswords} onToggle={() => setVisiblePasswords((value) => !value)} />
          <PasswordInput id="newPassword" label="Nova senha" value={newPassword} error={fieldErrors.newPassword?.join(' ')} onChange={setNewPassword} visible={visiblePasswords} onToggle={() => setVisiblePasswords((value) => !value)} />
          <PasswordInput id="password-confirm" label="Confirmar nova senha" value={confirmPassword} error={fieldErrors.confirmPassword?.join(' ')} onChange={setConfirmPassword} visible={visiblePasswords} onToggle={() => setVisiblePasswords((value) => !value)} />
        </div>
        <button type="submit" disabled={mutations.changePassword.isPending || !currentPassword || !newPassword || !confirmPassword} className="mt-5 flex h-[34px] items-center justify-center rounded-[3px] bg-[#D28A4C] px-4 text-[11px] font-bold text-[#17100b] transition-colors hover:bg-[#e19b5f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D28A4C] disabled:opacity-50">
          {mutations.changePassword.isPending ? 'Alterando…' : 'Alterar senha'}
        </button>
      </form>
      {status && <p role="status" aria-live="polite" className="mt-3 text-[11px] text-[#D28A4C]">{status}</p>}
    </AccountPageShell>
  );
}

function AccountPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto mt-2 grid max-w-[1006px] grid-cols-1 items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <AccountSidebar active="profile" />
      <main className="min-w-0 px-2 pb-12 lg:px-0 lg:pb-0">{children}</main>
    </div>
  );
}

function ProfileField({
  id, label, value, onChange, required = false, type = 'text', error,
}: {
  id: ProfileFieldKey;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: 'text' | 'email';
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={`profile-${id}`} className="mb-2 block text-[11px] text-[#F5F1EB]">{label}{required && <> <RequiredMark /></>}</label>
      <input id={`profile-${id}`} type={type} required={required} value={value} aria-invalid={Boolean(error)} aria-describedby={error ? `profile-${id}-error` : undefined} onChange={(event) => onChange(event.target.value)} className={profileInputClass} />
      {error && <p id={`profile-${id}-error`} className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

function PasswordInput({
  id, label, value, onChange, visible, onToggle, error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={`profile-${id}`} className="mb-2 block text-[11px] text-[#F5F1EB]">{label}</label>
      <div className="relative">
        <input id={`profile-${id}`} type={visible ? 'text' : 'password'} autoComplete={id === 'currentPassword' ? 'current-password' : 'new-password'} required minLength={8} value={value} aria-invalid={Boolean(error)} aria-describedby={error ? `profile-${id}-error` : undefined} onChange={(event) => onChange(event.target.value)} className={`${profileInputClass} pr-9`} />
        <button type="button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} onClick={onToggle} className="absolute inset-y-0 right-3 flex items-center text-[#bba181] hover:text-[#D28A4C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D28A4C]">
          {visible ? <EyeOff aria-hidden="true" size={14} /> : <Eye aria-hidden="true" size={14} />}
        </button>
      </div>
      {error && <p id={`profile-${id}-error`} className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

function RequiredMark() {
  return <span aria-hidden="true" className="text-[#E86F47]">*</span>;
}
