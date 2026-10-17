import { useState } from 'react';
import { createRootRoute, Outlet, Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { Heart, Home, LogIn, LogOut, ScanLine, Search, ShoppingCart, UserRound } from 'lucide-react';
import { FaFacebookF, FaInstagram, FaLinkedinIn, FaYoutube } from 'react-icons/fa';
import { FaTwitter } from 'react-icons/fa6';
import { CartProvider, useCart } from '../components/marketplace/CartProvider';
import { AuthDialogProvider, useAuthDialog } from '../components/marketplace/AuthDialogProvider';
import { useLogout, useSession } from '../api/session';
import { isApiError } from '../api/client';

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: () => (
    <main className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-3xl font-bold text-[#F5F1EB]">Página não encontrada</h1>
      <p className="mt-3 text-[#bba181]">O endereço informado não corresponde a uma página disponível.</p>
      <Link to="/" className="mt-6 inline-block text-[#D28A4C]">Voltar ao início</Link>
    </main>
  ),
});

type HeaderSection = 'home' | 'market';

function RootLayout() {
  return (
    <CartProvider>
      <AuthDialogProvider>
        <MarketplaceLayout />
      </AuthDialogProvider>
    </CartProvider>
  );
}

function MarketplaceLayout() {
  const [logoutError, setLogoutError] = useState('');
  const openLogin = useAuthDialog();
  const session = useSession();
  const logout = useLogout();
  const currentUser = session.session?.user.displayName ?? '';
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isNFTDetails = pathname.startsWith('/nft/');
  const isCart = pathname === '/cart';
  const isPayment = pathname === '/payment';
  const isOrderPage = pathname.startsWith('/order/');
  const isAccountPage = pathname === '/profile' || pathname === '/wallets';
  const isMobileStandalonePage = isNFTDetails || isCart || isPayment;
  const { items } = useCart();
  const badgeCount = items.reduce((total, item) => total + item.quantity, 0);
  const activeSection: HeaderSection = /^\/(market|mercado|nft|cart|payment)(\/|$)/i.test(pathname)
    ? 'market'
    : 'home';
  const toggleSession = () => {
    if (session.status === 'authenticated') {
      setLogoutError('');
      void logout().catch((cause: unknown) => {
        setLogoutError(isApiError(cause) ? cause.message : 'Não foi possível encerrar a sessão.');
      });
      return;
    }
    openLogin();
  };

  return (
    <div className={`min-h-screen ${isOrderPage ? 'bg-[#140D0A]' : isCart || isPayment ? 'bg-[#140D0A] lg:bg-[#0f0a06]' : 'bg-[#0f0a06]'} font-mono text-zinc-100`}>
      <header className={isOrderPage ? 'hidden' : 'hidden border-b border-orange-900/30 lg:block'}>
        <HeaderRow
          active={activeSection}
          badgeCount={badgeCount}
          currentUser={currentUser}
          compact={isAccountPage}
          onAuthClick={toggleSession}
        />
      </header>

      <main className={isOrderPage ? 'flex min-h-screen w-full items-center justify-center px-4 py-8' : `mx-auto max-w-7xl px-6 ${isAccountPage ? 'pb-16 pt-8 lg:py-6' : isMobileStandalonePage ? 'pb-0 pt-8 lg:py-12' : 'pb-36 pt-8 lg:py-12'}`}>
        {logoutError && <p role="alert" className="mb-4 text-sm text-red-300">{logoutError}</p>}
        <Outlet />
      </main>

      <MobileTabBar
        badgeCount={badgeCount}
        currentUser={currentUser}
        currentPath={pathname}
        hidden={isMobileStandalonePage || isAccountPage || isOrderPage}
        onOpenAuth={openLogin}
        onAccountClick={toggleSession}
      />
      <div className={isOrderPage || isAccountPage ? 'hidden' : isMobileStandalonePage ? 'hidden lg:block' : 'pb-[126px] lg:pb-0'}>
        <Footer />
      </div>
    </div>
  );
}

function MobileTabBar({
  badgeCount,
  currentUser,
  currentPath,
  hidden,
  onOpenAuth,
  onAccountClick,
}: {
  badgeCount: number;
  currentUser: string;
  currentPath: string;
  hidden: boolean;
  onOpenAuth: () => void;
  onAccountClick: () => void;
}) {
  const homeIsActive = currentPath === '/';

  return (
    <nav aria-label="Navegação mobile" className={`${hidden ? 'hidden' : 'fixed'} inset-x-0 bottom-0 z-40 mx-auto h-[126px] w-full max-w-[414px] px-5 pb-5 pt-[28px] lg:hidden`}>
      <div className="relative flex h-[78px] items-center justify-around rounded-[24px] bg-[#21150f] px-3 shadow-[0_-8px_30px_rgba(15,10,6,0.45)]">
        <Link to="/" aria-label="Início" aria-current={homeIsActive ? 'page' : undefined} className={homeIsActive ? 'text-[#D28A4C]' : 'text-[#cbb28e]'}>
          <Home aria-hidden="true" size={18} fill="currentColor" />
        </Link>
        <button type="button" aria-label="Favoritos: entre para acessar" onClick={onOpenAuth} className="text-[#cbb28e] hover:text-[#D28A4C]">
          <Heart aria-hidden="true" size={18} fill="currentColor" />
        </button>
        <span aria-hidden="true" className="w-12 shrink-0" />
        <Link to="/cart" aria-label={`Carrinho com ${badgeCount} itens`} className={currentPath === '/cart' ? 'relative text-[#D28A4C]' : 'relative text-[#cbb28e] hover:text-[#D28A4C]'}>
          <ShoppingCart aria-hidden="true" size={18} />
          {badgeCount > 0 && <span className="absolute -right-2 -top-2 flex size-3.5 items-center justify-center rounded-full bg-[#D28A4C] text-[8px] font-bold text-[#17100b]">{badgeCount}</span>}
        </Link>
        <button
          type="button"
          aria-label={currentUser ? `Sair da conta de ${currentUser}` : 'Minha conta'}
          onClick={onAccountClick}
          className="text-[#cbb28e] hover:text-[#D28A4C]"
        >
          <UserRound aria-hidden="true" size={18} fill="currentColor" />
        </button>

        <Link to="/" hash="mobile-search" aria-label="Pesquisar NFTs" className="absolute left-1/2 top-[-24px] flex size-[58px] -translate-x-1/2 items-center justify-center rounded-full border-[5px] border-[#21150f] bg-[#D28A4C] text-[#F5F1EB] shadow-lg">
          <ScanLine aria-hidden="true" size={23} />
        </Link>
      </div>
    </nav>
  );
}

function HeaderRow({
  active,
  badgeCount,
  currentUser,
  compact = false,
  onAuthClick,
}: {
  active: HeaderSection;
  badgeCount: number;
  currentUser: string;
  compact?: boolean;
  onAuthClick: () => void;
}) {
  const navigate = useNavigate();
  const navLinkClass = (isActive: boolean) =>
    [
      'relative flex h-full items-center text-[13px] transition-colors',
      isActive &&
        'font-semibold text-[#e89a5e] after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[#e89a5e]',
      !isActive && 'text-zinc-300 hover:text-[#e89a5e]',
    ]
      .filter(Boolean)
      .join(' ');

  return (
    <div className={`mx-auto flex ${compact ? 'h-[56px] max-w-[1006px]' : 'h-[45px] max-w-[1200px]'} w-full items-center justify-between px-4 min-[1200px]:px-0`}>
      <Link
        to="/"
        aria-label="Kurio, início"
        className="text-xs font-bold leading-none tracking-[0.08em] text-white"
      >
        KURIO
      </Link>

      <nav aria-label="Navegação principal" className="hidden h-full items-stretch gap-8 md:flex">
        <Link
          to="/"
          aria-current={active === 'home' ? 'page' : undefined}
          className={navLinkClass(active === 'home')}
        >
          Início
        </Link>
        <Link
          to="/"
          hash="catalogo"
          aria-current={active === 'market' ? 'page' : undefined}
          className={navLinkClass(active === 'market')}
        >
          Mercado
        </Link>
        <span aria-disabled="true" className={`${navLinkClass(false)} cursor-not-allowed opacity-60`}>
          Criadores
        </span>
        <span aria-disabled="true" className={`${navLinkClass(false)} cursor-not-allowed opacity-60`}>
          Aprenda
        </span>
      </nav>

      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Pesquisar"
          onClick={() => {
            void navigate({ to: '/', hash: 'catalogo' }).then(() => {
              document.querySelector<HTMLInputElement>('input[aria-label="Buscar NFTs"]')?.focus();
            });
          }}
          className="inline-flex size-8 items-center justify-center text-zinc-100 transition-colors hover:text-[#e89a5e]"
        >
          <Search aria-hidden="true" size={18} strokeWidth={1.8} />
        </button>

        <Link
          to="/cart"
          aria-label={'Carrinho com ' + badgeCount + ' itens'}
          className="relative inline-flex size-8 items-center justify-center text-zinc-100 transition-colors hover:text-[#e89a5e]"
        >
          <ShoppingCart aria-hidden="true" size={19} strokeWidth={1.8} />
          <span className="absolute -right-0.5 -top-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-[#e89a5e] px-0.5 text-[8px] font-bold leading-none text-[#17100b]">
            {badgeCount}
          </span>
        </Link>

        <button
          type="button"
          aria-label={currentUser ? `Sair da conta de ${currentUser}` : 'Entrar'}
          onClick={onAuthClick}
          className="inline-flex h-8 max-w-[150px] items-center gap-1.5 rounded-md bg-[#e89a5e] px-3 text-xs font-semibold text-[#17100b] transition-colors hover:bg-[#f0a66e]"
        >
          {currentUser ? <LogOut aria-hidden="true" size={16} strokeWidth={1.8} /> : <LogIn aria-hidden="true" size={16} strokeWidth={1.8} />}
          <span className="truncate">{currentUser || 'Entrar'}</span>
        </button>
      </div>
    </div>
  );
}


function Footer() {
  const benefits = [
    {
      mark: 'W',
      title: 'Segurança da carteira',
      description: 'Proteja sua carteira e colecione arte digital verificada com confiança.',
    },
    {
      mark: 'C',
      title: 'Criadores em destaque',
      description: 'Conheça artistas, estúdios e comunidades que moldam a cultura digital na rede.',
    },
    {
      mark: 'D',
      title: 'Alertas de lançamentos',
      description: 'Receba calendários de cunhagem, novidades de listas de acesso e análises do mercado.',
    },
  ];

  const linkGroups = [
    {
      title: 'Meu perfil',
      links: ['Meu perfil', 'Carteiras', 'Minha coleção', 'Atividade', 'Estúdio do criador', 'Lista de interesse'],
    },
    {
      title: 'Central de ajuda',
      links: ['Central de ajuda', 'Como comprar NFTs', 'Carteira e segurança', 'Política do mercado', 'Denunciar item'],
    },
    {
      title: 'Coleções',
      links: ['Arte digital', 'Fotografia', 'Música', 'Arte 3D', 'Utilidade'],
    },
  ];

  const socialLinks = [
    { label: 'Facebook', icon: <FaFacebookF aria-hidden="true" /> },
    { label: 'Instagram', icon: <FaInstagram aria-hidden="true" /> },
    { label: 'Twitter', icon: <FaTwitter aria-hidden="true" /> },
    { label: 'LinkedIn', icon: <FaLinkedinIn aria-hidden="true" /> },
    { label: 'YouTube', icon: <FaYoutube aria-hidden="true" /> },
  ];

  return (
    <footer className="mt-8 px-6 pb-8 text-[#F5F1EB] lg:min-h-[610px] lg:pb-0">
      <div className="mx-auto max-w-[1200px]">
        <div className="grid grid-cols-1 gap-7 bg-[#21150f] px-6 py-8 sm:grid-cols-2 lg:h-[250px] lg:grid-cols-4 lg:items-center lg:gap-0 lg:px-10 lg:py-8">
          {benefits.map((benefit) => (
            <section key={benefit.title} className="lg:h-[190px] lg:border-r lg:border-[#70482c] lg:px-5 lg:py-1 lg:first:pl-0">
              <span aria-hidden="true" className="mb-2 flex size-[72px] items-center justify-center rounded-full bg-[#D28A4C] text-[18px] font-bold text-[#17100b]">
                {benefit.mark}
              </span>
              <h2 className="text-[14px] font-bold leading-[18px]">{benefit.title}</h2>
              <p className="mt-1 max-w-[220px] text-[12px] leading-[18px] text-[#bba181]">{benefit.description}</p>
            </section>
          ))}

          <section className="lg:flex lg:h-[190px] lg:flex-col lg:justify-center lg:pl-5">
            <h2 className="text-[15px] font-bold leading-[17px]">Antecipe-se ao próximo lançamento</h2>
            <div className="mt-2 flex h-[36px] w-full overflow-hidden rounded-[4px] bg-[#4a301a]">
              <input
                type="email"
                aria-label="Seu e-mail"
                placeholder="digite seu e-mail..."
                disabled
                className="min-w-0 flex-1 cursor-not-allowed bg-transparent px-3 text-[11px] text-[#F5F1EB] opacity-60 outline-none placeholder:text-[#b08d64]"
              />
              <button type="button" disabled className="cursor-not-allowed bg-[#D28A4C] px-4 text-[12px] font-bold text-[#17100b] opacity-60">
                Enviar
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-[16px] text-[#bba181]">
              Inscrição na newsletter indisponível nesta demonstração.
            </p>
          </section>
        </div>

        <div className="grid grid-cols-1 items-center gap-4 bg-[#402813] px-6 py-5 text-[12px] sm:grid-cols-2 lg:h-[90px] lg:grid-cols-4 lg:gap-4 lg:px-8 lg:py-0">
          <Link to="/" className="font-bold tracking-[0.1em] text-[#F5F1EB]">KURIO</Link>
          <p className="leading-[17px] text-[#F5F1EB]">Feito para colecionadores,<br />criadores e cultura</p>
          <a href="mailto:contato@email.com" className="text-[#F5F1EB] hover:text-[#D28A4C]">contato@email.com</a>
          <a href="tel:+551140028922" className="text-[#F5F1EB] hover:text-[#D28A4C]">+55 11 4002 8922</a>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-8 bg-[#21150f] px-6 py-7 sm:grid-cols-2 lg:min-h-[230px] lg:grid-cols-4 lg:gap-6 lg:px-8 lg:py-6">
          {linkGroups.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <h2 className="mb-3 text-[14px] font-bold leading-[18px]">{group.title}</h2>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link}>
                    {group.title === 'Meu perfil' && link === 'Meu perfil' ? (
                      <Link to="/profile" className="text-[12px] leading-[17px] text-[#d0b99d] transition-colors hover:text-[#D28A4C]">{link}</Link>
                    ) : group.title === 'Meu perfil' && link === 'Carteiras' ? (
                      <Link to="/wallets" className="text-[12px] leading-[17px] text-[#d0b99d] transition-colors hover:text-[#D28A4C]">{link}</Link>
                    ) : (
                      <span aria-disabled="true" className="text-[12px] leading-[17px] text-[#8f7254]">{link}</span>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-1">
            <h2 className="mb-3 text-[14px] font-bold leading-[18px]">Redes sociais</h2>
            <ul aria-label="Redes sociais" className="flex max-w-full flex-wrap gap-2">
              {socialLinks.map((social) => (
                <li key={social.label}>
                  <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-[4px] border border-[#8a572f] text-[13px] font-semibold text-[#8f7254]">
                    {social.icon}
                  </span>
                </li>
              ))}
            </ul>

            <h2 className="mb-2 mt-6 text-[14px] font-bold leading-[18px]">Carteiras compatíveis</h2>
            <div className="flex min-h-[28px] w-full max-w-[245px] min-w-0 flex-wrap items-center justify-center rounded-[6px] border border-[#694629] bg-[#402813] px-2 py-1 text-center text-[9px] font-semibold uppercase leading-[14px] tracking-[0.02em] text-[#D28A4C]">
              <span>MetaMask · WalletConnect · Coinbase</span>
            </div>
          </div>
        </div>
      </div>

      <p className="mx-auto flex min-h-[40px] max-w-[1200px] items-center justify-center py-2 text-center text-[12px] text-[#bba181]">
        © 2026 Kurio. Propriedade digital para todos.
      </p>
    </footer>
  );
}
