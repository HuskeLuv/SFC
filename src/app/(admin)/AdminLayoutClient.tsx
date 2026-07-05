'use client';

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

  // Margem do conteúdo ajustada à largura da sidebar.
  const mainContentMargin = isMobileOpen
    ? 'ml-0'
    : isExpanded || isHovered
      ? 'lg:ml-[200px]'
      : 'lg:ml-[90px]';

  return (
    <CashflowYearProvider>
      <div className="min-h-screen xl:flex">
        <AppSidebar />
        <Backdrop />
        <MobileSidebarTrigger />
        <div className={`flex-1 transition-all duration-300 ease-in-out ${mainContentMargin}`}>
          <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </div>
      </div>
    </CashflowYearProvider>
  );
}
