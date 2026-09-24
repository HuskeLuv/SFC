'use client';

import { usePathname } from 'next/navigation';
import { useSidebar } from '@/context/SidebarContext';
import { CashflowYearProvider } from '@/context/CashflowYearContext';
import AppSidebar from '@/layout/AppSidebar';
import Backdrop from '@/layout/Backdrop';
import MobileHeader from '@/layout/mobile/MobileHeader';
import MobileTabBar from '@/layout/mobile/MobileTabBar';
import InstallAppCard from '@/components/pwa/InstallAppCard';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import VersionWatcher from '@/components/common/VersionWatcher';
import AssistentePanel from '@/components/assistente/AssistentePanel';
import React from 'react';

/**
 * D.1 (checklist mai/28): topbar removida. ThemeToggle, NotificationDropdown,
 * UserDropdown e a pill de personificação foram pra `SidebarFooter`.
 *
 * PWA fase 0: abaixo de lg a sidebar some e entra a casca mobile — cabeçalho
 * compacto (MobileHeader) + barra de abas (MobileTabBar). Desktop inalterado.
 */
export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const pathname = usePathname();

  // Margem do conteúdo ajustada à largura da sidebar.
  const mainContentMargin = isMobileOpen
    ? 'ml-0'
    : isExpanded || isHovered
      ? 'lg:ml-[200px]'
      : 'lg:ml-[90px]';

  // A planilha de fluxo de caixa precisa de toda a largura disponível
  // (12 meses + total anual); as demais páginas mantêm o limite 2xl.
  const fullWidth = pathname?.startsWith('/fluxodecaixa');
  const contentWidthClass = fullWidth ? 'w-full' : 'mx-auto max-w-(--breakpoint-2xl)';

  return (
    <CashflowYearProvider>
      <div className="min-h-screen max-lg:min-h-dvh xl:flex">
        {/* print: só o conteúdo — sidebar/casca fora, margem zerada */}
        <div className="print:hidden">
          <AppSidebar />
          <Backdrop />
          <MobileTabBar />
        </div>
        <div
          className={`flex-1 min-w-0 transition-all duration-300 ease-in-out ${mainContentMargin} max-lg:pb-[calc(var(--mf-bottom-nav-h,0px)+1rem)] print:ml-0`}
        >
          <MobileHeader />
          {pathname?.startsWith('/carteira') && (
            <InstallAppCard variant="banner" className="mx-4 mt-3 lg:hidden" />
          )}
          <div className={`p-4 md:p-6 ${contentWidthClass} print:max-w-none print:p-0`}>
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </div>
        {/* Deploy novo com aba aberta: banner + reload na próxima navegação */}
        <VersionWatcher />
        {/* Assistente de IA (só renderiza quando ASSISTENTE_HABILITADO no servidor) */}
        <AssistentePanel />
      </div>
    </CashflowYearProvider>
  );
}
