import { Link } from '@tanstack/react-router';
import { AlertTriangle, Download, Heart, LogOut, ShoppingCart, UserRound, WalletCards, Tag } from 'lucide-react';

type AccountSection = 'profile' | 'wallets';

const items = [
  { label: 'Dados do perfil', to: '/profile' as const, icon: UserRound, section: 'profile' as const },
  { label: 'Carteiras', to: '/wallets' as const, icon: WalletCards, section: 'wallets' as const },
  { label: 'Atividade', to: null, icon: ShoppingCart },
  { label: 'Lista de interesse', to: null, icon: Heart },
  { label: 'Ofertas', to: null, icon: Tag },
  { label: 'Arquivos baixados', to: null, icon: Download },
  { label: 'Suporte', to: null, icon: AlertTriangle },
];

export function AccountSidebar({ active }: { active: AccountSection }) {
  return (
    <aside className="h-fit w-full shrink-0 bg-[#241612] lg:w-[260px]">
      <h2 className="px-3 pb-2 pt-3 text-[14px] font-bold leading-5 text-[#F5F1EB]">Meu perfil</h2>
      <nav aria-label="Menu do perfil" className="grid grid-cols-2 lg:block">
        {items.map(({ label, to, icon: Icon, section }) => {
          const selected = section === active;
          const classes = `relative flex min-h-[38px] items-center gap-3 px-3 text-left text-[12px] transition-colors ${selected ? 'bg-[#322017] text-[#D28A4C] after:absolute after:bottom-0 after:left-0 after:top-0 after:w-1 after:bg-[#D28A4C]' : 'text-[#D28A4C] hover:bg-[#322017]'}`;
          const contents = <><Icon aria-hidden="true" size={15} strokeWidth={1.6} /><span>{label}</span></>;

          return (
            <div key={label}>
              {to ? (
                <Link to={to} aria-current={selected ? 'page' : undefined} className={classes}>{contents}</Link>
              ) : (
                <a href="#" className={classes}>{contents}</a>
              )}
            </div>
          );
        })}
      </nav>
      <Link to="/" className="flex min-h-[40px] items-center gap-3 border-t border-[#503523] px-3 text-[12px] text-[#D28A4C] transition-colors hover:bg-[#322017]">
        <LogOut aria-hidden="true" size={15} strokeWidth={1.6} />
        Sair
      </Link>
    </aside>
  );
}
