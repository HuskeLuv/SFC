'use client';

import { usePathname } from 'next/navigation';
import { useSidebar } from '@/context/SidebarContext';
import { CashflowYearProvider } from '@/context/CashflowYearContext';
import AppSidebar from '@/layout/AppSidebar';
import Backdrop from '@/layout/Backdrop';
import MobileSidebarTrigger from '@/layout/MobileSidebarTrigger';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import React from 'react';

/**
 * D.1 (checklist mai/28): topbar removida. ThemeToggle, NotificationDropdown,
 * UserDropdown e a pill de personificação foram pra `SidebarFooter`. Em
 * mobile o toggle de abrir sidebar vira o flutuante MobileSidebarTrigger.
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
      <div className="min-h-screen xl:flex">
        <AppSidebar />
        <Backdrop />
        <MobileSidebarTrigger />
        <div className={`flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}>
          <div className={`p-4 md:p-6 ${contentWidthClass}`}>
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </div>
      </div>
    </CashflowYearProvider>
  );
}
