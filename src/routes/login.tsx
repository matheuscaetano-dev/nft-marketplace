import { useRef, useState, type FormEvent } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { isApiError } from '../api/client';
import { useLogin } from '../api/session';

interface LoginSearch {
  redirect?: string;
  context?: 'checkout';
  reason?: 'session-expired';
}

function validateLoginSearch(search: Record<string, unknown>): LoginSearch {
  const redirect = typeof search.redirect === 'string' && search.redirect.startsWith('/')
    && !search.redirect.startsWith('//') ? search.redirect : undefined;
  return {
    ...(redirect ? { redirect } : {}),
    ...(search.context === 'checkout' ? { context: 'checkout' } : {}),
    ...(search.reason === 'session-expired' ? { reason: 'session-expired' } : {}),
  };
}

export const Route = createFileRoute('/login')({
  validateSearch: validateLoginSearch,
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);

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
      await login({ email, password });
      await navigate({ href: search.redirect ?? '/' });
    } catch (cause) {
      if (isApiError(cause)) {
        setError(cause.message);
        setFieldErrors(cause.fieldErrors ?? {});
        const firstError = Object.keys(cause.fieldErrors ?? {})[0];
        if (firstError) document.getElementById(`login-${firstError}`)?.focus();
      } else setError('Não foi possível entrar. Tente novamente.');
    } finally {
      setPassword('');
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <main className="mx-auto max-w-md rounded-xl border border-[#503523] bg-[#21150f] p-6">
      <h1 className="text-xl font-bold text-[#F5F1EB]">Entrar na sua conta</h1>
      {search.reason === 'session-expired' && (
        <p role="status" className="mt-2 text-sm text-amber-200">Sua sessão expirou. Entre novamente para retomar de onde parou.</p>
      )}
      {search.context === 'checkout' && (
        <p className="mt-2 text-sm text-[#bba181]">Entre para continuar seu checkout. Seu contexto será preservado.</p>
      )}
      <form noValidate className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
        <label className="block text-sm text-[#d7c7b4]">
          E-mail
          <input
            required
            type="email"
            id="login-email"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 block w-full rounded border border-[#503523] bg-[#100a06] p-2 text-[#F5F1EB]"
          />
          {fieldErrors.email && <span id="login-email-error" className="mt-1 block text-xs text-red-300">{fieldErrors.email.join(' ')}</span>}
        </label>
        <label className="block text-sm text-[#d7c7b4]">
          Senha
          <input
            required
            type="password"
            id="login-password"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 block w-full rounded border border-[#503523] bg-[#100a06] p-2 text-[#F5F1EB]"
          />
          {fieldErrors.password && <span id="login-password-error" className="mt-1 block text-xs text-red-300">{fieldErrors.password.join(' ')}</span>}
        </label>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={pending} className="w-full rounded bg-[#D28A4C] px-4 py-2 font-bold text-[#17100b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D28A4C] disabled:opacity-60">
          {pending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <p className="mt-4 text-sm text-[#bba181]">
        Ainda não tem conta? <Link to="/register" search={search} className="text-[#D28A4C]">Cadastre-se</Link>
      </p>
    </main>
  );
}
