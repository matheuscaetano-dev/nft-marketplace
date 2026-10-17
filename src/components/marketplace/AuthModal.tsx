import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { FaFacebookF } from 'react-icons/fa';
import { FcGoogle } from 'react-icons/fc';
import { isApiError } from '../../api/client';
import { useLogin, useRegister } from '../../api/session';

type AuthMode = 'login' | 'register';

interface AuthModalProps {
  onClose: () => void;
  onAuthenticated: (displayName: string) => void;
}

const fieldClass = 'h-[50px] w-full rounded-[10px] border border-[#3F2319] bg-[#140D0A] px-4 py-3 text-[11px] text-[#F5F1EB] outline-none placeholder:text-[#9b7955] focus:border-[#D28A4C] sm:h-[40px] sm:rounded-[5px] sm:border-[#3F2319] sm:bg-transparent sm:px-4';

export function AuthModal({ onClose, onAuthenticated }: AuthModalProps) {
  const login = useLogin();
  const register = useRegister();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>('input')?.focus();
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleDialogKeys);
    return () => {
      window.removeEventListener('keydown', handleDialogKeys);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setMessage('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage('');

    if (pending) return;
    if (mode === 'register' && password !== confirmPassword) {
      setMessage('As senhas não coincidem.');
      return;
    }

    setPending(true);
    try {
      if (mode === 'register') {
        const response = await register({
          email,
          password,
          username: username.trim(),
          displayName: username.trim(),
        });
        onAuthenticated(response.user.displayName);
      } else {
        const session = await login({ email, password });
        onAuthenticated(session.user.displayName);
      }
    } catch (cause) {
      setMessage(isApiError(cause) ? cause.message : 'Não foi possível concluir. Tente novamente.');
    } finally {
      setPending(false);
      setPassword('');
      setConfirmPassword('');
    }
  };

  const socialSignIn = (provider: string) => {
    setMessage(`O login com ${provider} ainda precisa ser conectado a um provedor OAuth.`);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/35 p-0 sm:p-1"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'login' ? 'Entrar' : 'Criar perfil de colecionador'}
        className="relative my-auto flex min-h-[100dvh] w-full max-w-none flex-col rounded-[32px] bg-[#140D0A] px-7 pb-5 pt-[15vh] text-[#F5F1EB] shadow-2xl sm:my-0 sm:min-h-0 sm:w-full sm:max-w-[468px] sm:rounded-[4px] sm:border-b-4 sm:border-b-[#D28A4C] sm:bg-[#241612] sm:px-[50px] sm:pb-6 sm:pt-[48px]"
      >
        <button
          type="button"
          aria-label="Fechar"
          onClick={onClose}
          className="absolute right-3 top-3 hidden size-6 items-center justify-center text-[#D28A4C] hover:text-[#f0a66e] sm:flex"
        >
          <X aria-hidden="true" size={15} />
        </button>

        <div className="mb-[40px] hidden justify-center gap-1 text-[20px] leading-5 sm:flex">
          <button type="button" onClick={() => switchMode('login')} className={mode === 'login' ? 'font-bold text-[#D28A4C]' : 'text-[#F5F1EB] hover:text-[#D28A4C]'}>
            Entrar
          </button>
          <span className="text-[#D28A4C]">|</span>
          <button type="button" onClick={() => switchMode('register')} className={mode === 'register' ? 'font-bold text-[#D28A4C]' : 'text-[#F5F1EB] hover:text-[#D28A4C]'}>
            Criar conta
          </button>
        </div>

        <div className="flex h-[42px] w-full shrink-0 justify-center sm:hidden">
          <span className="flex h-[42px] w-[109px] items-center justify-center text-[32px] leading-[32px] font-bold tracking-[0.1em] text-[#F5F1EB]">
            KURIO
          </span>
        </div>

        <h1 className="mt-[82px] mb-[34px] min-h-5 text-center text-[16px] leading-5 font-bold text-[#F5F1EB] sm:hidden">
          {mode === 'login' ? 'Entrar' : 'Criar perfil de colecionador'}
        </h1>

        <p className="mx-auto mb-5 hidden max-w-[430px] text-center text-[14px] leading-[18px] text-[#d7c7b4] sm:block">
          {mode === 'login'
            ? 'Entre para gerenciar sua carteira, coleção e perfil do criador.'
            : 'Crie seu perfil de colecionador e conecte uma carteira quando quiser.'}
        </p>

        <form onSubmit={submit} className="mx-auto w-full space-y-3 sm:max-w-[368px]">
          {mode === 'register' && (
            <input
              aria-label="Nome de usuário"
              autoComplete="username"
              required
              minLength={3}
              maxLength={24}
              pattern="[a-zA-Z0-9_-]+"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Nome de usuário"
              className={`${fieldClass} text-center sm:text-left`}
            />
          )}
          <input
            aria-label="E-mail"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={mode === 'register' ? 'Digite seu e-mail' : 'contato@email.com'}
            className={fieldClass}
          />
          <PasswordField
            label="Senha"
            value={password}
            onChange={setPassword}
            visible={showPassword}
            onToggle={() => setShowPassword((visible) => !visible)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {mode === 'register' && (
            <PasswordField
              label="Confirmar senha"
              value={confirmPassword}
              onChange={setConfirmPassword}
              visible={showConfirmPassword}
              onToggle={() => setShowConfirmPassword((visible) => !visible)}
              autoComplete="new-password"
            />
          )}

          {mode === 'login' && (
            <div className="flex justify-end">
              <button type="button" onClick={() => setMessage('A recuperação de senha estará disponível quando o serviço de autenticação for conectado.')} className="text-[11px] text-[#D28A4C] hover:underline sm:text-[14px]">
                Esqueceu a senha?
              </button>
            </div>
          )}

          <button type="submit" disabled={pending} className="!mt-[40px] h-[60px] w-full rounded-[10px] bg-[#D28A4C] text-[14px] font-bold text-[#17100b] transition-colors hover:bg-[#e19b5f] disabled:cursor-wait disabled:opacity-60 sm:!mt-6 sm:h-[48px] sm:rounded-[5px] sm:text-[16px]">
            <span className="sm:hidden">{pending ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar perfil'}</span>
            <span className="hidden sm:inline">{pending ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}</span>
          </button>
        </form>

        <div className="mx-auto mt-10 mb-3 flex w-full items-center gap-3 text-[9px] text-[#d7c7b4] sm:mt-6 sm:mb-3 sm:max-w-[368px] sm:text-[14px]">
          <span className="h-px flex-1 bg-[#402813]" />
          Ou continue com
          <span className="h-px flex-1 bg-[#402813]" />
        </div>

        <div className="mx-auto w-full space-y-3 sm:max-w-[368px] sm:space-y-3">
          <button type="button" disabled={pending} onClick={() => socialSignIn('Google')} className="flex h-[40px] w-full items-center justify-center gap-2 rounded-[10px] border border-[#3F2319] text-[10px] text-[#d7c7b4] hover:border-[#D28A4C] disabled:opacity-60 sm:h-[44px] sm:rounded-[5px] sm:text-[14px]">
            <FcGoogle aria-hidden="true" size={16} />
            Continuar com Google
          </button>
          <button type="button" disabled={pending} onClick={() => socialSignIn('Facebook')} className="flex h-[40px] w-full items-center justify-center gap-2 rounded-[10px] border border-[#3F2319] text-[10px] text-[#d7c7b4] hover:border-[#D28A4C] disabled:opacity-60 sm:h-[44px] sm:rounded-[5px] sm:text-[14px]">
            <FaFacebookF aria-hidden="true" size={13} className="text-[#1877F2]" />
            Continuar com Facebook
          </button>
        </div>

        {message && <p role="status" className="mt-3 text-center text-[9px] leading-4 text-[#D28A4C]">{message}</p>}
        <p className="mt-10 text-center text-[12px] leading-4 text-[#bba181] sm:hidden">
          {mode === 'login' ? 'Novo na Kurio? ' : 'Já tem uma conta? '}
          <button type="button" onClick={() => switchMode(mode === 'login' ? 'register' : 'login')} className="text-[#D28A4C] hover:underline">
            {mode === 'login' ? 'Crie uma conta' : 'Entre'}
          </button>
        </p>
      </section>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  visible,
  onToggle,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: string;
}) {
  return (
    <div className="relative">
      <input
        aria-label={label}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        required
        minLength={8}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        className={`${fieldClass} pr-10`}
      />
      <button type="button" aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'} onClick={onToggle} className="absolute inset-y-0 right-2 flex items-center text-[#bba181] hover:text-[#D28A4C]">
        {visible ? <EyeOff aria-hidden="true" size={13} /> : <Eye aria-hidden="true" size={13} />}
      </button>
    </div>
  );
}
