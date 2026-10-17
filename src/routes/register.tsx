import { useRef, useState, type FormEvent } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { isApiError } from '../api/client';
import { useRegister } from '../api/session';
import type { RegisterRequest } from '../contracts/api';

interface RegisterSearch {
  redirect?: string;
  context?: 'checkout';
}

function validateRegisterSearch(search: Record<string, unknown>): RegisterSearch {
  const redirect = typeof search.redirect === 'string' && search.redirect.startsWith('/')
    && !search.redirect.startsWith('//') ? search.redirect : undefined;
  return {
    ...(redirect ? { redirect } : {}),
    ...(search.context === 'checkout' ? { context: 'checkout' } : {}),
  };
}

export const Route = createFileRoute('/register')({
  validateSearch: validateRegisterSearch,
  component: RegisterPage,
});

function RegisterPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const register = useRegister();
  const [form, setForm] = useState<RegisterRequest>({
    email: '',
    password: '',
    displayName: '',
    username: '',
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

  const update = (field: keyof RegisterRequest, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingRef.current) return;
    setError('');
    setFieldErrors({});
    if (!event.currentTarget.reportValidity()) {
      event.currentTarget.querySelector<HTMLElement>(':invalid')?.focus();
      return;
    }
    pendingRef.current = true;
    setPending(true);
    try {
      await register(form);
      await navigate({ href: search.redirect ?? '/' });
    } catch (cause) {
      if (isApiError(cause)) {
        setError(cause.message);
        setFieldErrors(cause.fieldErrors ?? {});
        const firstError = Object.keys(cause.fieldErrors ?? {})[0];
        if (firstError) document.getElementById(`register-${firstError}`)?.focus();
      } else setError('Não foi possível criar a conta.');
    } finally {
      setForm((current) => ({ ...current, password: '' }));
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <main className="mx-auto max-w-md rounded-xl border border-[#503523] bg-[#21150f] p-6">
      <h1 className="text-xl font-bold text-[#F5F1EB]">Criar conta</h1>
      <form noValidate className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        <label className="block text-sm text-[#d7c7b4]">Nome
          <input id="register-displayName" required minLength={2} aria-invalid={Boolean(fieldErrors.displayName)} aria-describedby={fieldErrors.displayName ? 'register-displayName-error' : undefined} value={form.displayName} onChange={(event) => update('displayName', event.target.value)} className="mt-1 block w-full rounded border border-[#503523] bg-[#100a06] p-2 text-[#F5F1EB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D28A4C]" />
          {fieldErrors.displayName && <span id="register-displayName-error" className="mt-1 block text-xs text-red-300">{fieldErrors.displayName.join(' ')}</span>}
        </label>
        <label className="block text-sm text-[#d7c7b4]">Nome de usuário
          <input id="register-username" required minLength={3} aria-invalid={Boolean(fieldErrors.username)} aria-describedby={fieldErrors.username ? 'register-username-error' : undefined} value={form.username} onChange={(event) => update('username', event.target.value)} className="mt-1 block w-full rounded border border-[#503523] bg-[#100a06] p-2 text-[#F5F1EB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D28A4C]" />
          {fieldErrors.username && <span id="register-username-error" className="mt-1 block text-xs text-red-300">{fieldErrors.username.join(' ')}</span>}
        </label>
        <label className="block text-sm text-[#d7c7b4]">E-mail
          <input id="register-email" required type="email" aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'register-email-error' : undefined} autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} className="mt-1 block w-full rounded border border-[#503523] bg-[#100a06] p-2 text-[#F5F1EB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D28A4C]" />
          {fieldErrors.email && <span id="register-email-error" className="mt-1 block text-xs text-red-300">{fieldErrors.email.join(' ')}</span>}
        </label>
        <label className="block text-sm text-[#d7c7b4]">Senha
          <input id="register-password" required minLength={8} type="password" aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? 'register-password-error' : undefined} autoComplete="new-password" value={form.password} onChange={(event) => update('password', event.target.value)} className="mt-1 block w-full rounded border border-[#503523] bg-[#100a06] p-2 text-[#F5F1EB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D28A4C]" />
          {fieldErrors.password && <span id="register-password-error" className="mt-1 block text-xs text-red-300">{fieldErrors.password.join(' ')}</span>}
        </label>
        {error && <p role="alert" aria-live="assertive" className="text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={pending} className="w-full rounded bg-[#D28A4C] px-4 py-2 font-bold text-[#17100b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D28A4C] disabled:opacity-60">
          {pending ? 'Criando conta…' : 'Criar conta'}
        </button>
      </form>
      <p className="mt-4 text-sm text-[#bba181]">
        Já tem conta? <Link to="/login" search={search} className="text-[#D28A4C]">Entrar</Link>
      </p>
    </main>
  );
}
