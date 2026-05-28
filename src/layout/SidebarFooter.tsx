'use client';

import React, { useState } from 'react';
import { logger } from '@/lib/logger';
import { ThemeToggleButton } from '@/components/common/ThemeToggleButton';
import NotificationDropdown from '@/components/header/NotificationDropdown';
import UserDropdown from '@/components/header/UserDropdown';
import { useAuth } from '@/hooks/useAuth';
import { useCsrf } from '@/hooks/useCsrf';
import { useSidebar } from '@/context/SidebarContext';
import { useRouter } from 'next/navigation';

/**
 * Footer fixo da sidebar (#1 do checklist mai/28) — substitui a topbar
 * removida em D.1. Contém: tema, notificações, perfil e a pill de
 * personificação (quando consultor está atuando).
 *
 * Quando a sidebar está colapsada (não isExpanded e não hover), só os
 * ícones aparecem. Quando expandida, ícones + texto.
 */
export default function SidebarFooter() {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const { actingClient, checkAuth, user } = useAuth();
  const { csrfFetch } = useCsrf();
  const router = useRouter();
  const [leavingActing, setLeavingActing] = useState(false);

  const showLabels = isExpanded || isHovered || isMobileOpen;

  const handleExitActing = async () => {
    if (!actingClient || leavingActing) return;
    try {
      setLeavingActing(true);
      const response = await csrfFetch('/api/consultant/acting', { method: 'DELETE' });
      if (!response.ok && response.status !== 204) {
        throw new Error('Falha ao encerrar visão do cliente');
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      await checkAuth();
      router.refresh();
      if (user?.role === 'consultant') {
        router.push('/dashboard/consultor');
      }
    } catch (error) {
      logger.error('Erro ao sair da visão do cliente:', error);
    } finally {
      setLeavingActing(false);
    }
  };

  return (
    <div className="mt-auto border-t border-gray-200 pt-3 dark:border-gray-800">
      {actingClient && (
        <div
          className={`mb-2 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 dark:border-blue-900/30 dark:bg-blue-900/20 ${
            showLabels ? '' : 'justify-center'
          }`}
        >
          {showLabels && (
            <span
              className="truncate text-xs font-medium text-blue-700 dark:text-blue-200"
              title={actingClient.name}
            >
              {actingClient.name}
            </span>
          )}
          <button
            type="button"
            onClick={handleExitActing}
            className={`ml-auto inline-flex items-center justify-center rounded-md border border-blue-300 bg-white px-2 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-800/40 dark:text-blue-100 dark:hover:bg-blue-700/40 ${
              leavingActing ? 'cursor-progress opacity-70' : ''
            }`}
            aria-label="Encerrar personificação"
            title="Encerrar personificação"
          >
            {leavingActing ? '…' : 'Sair'}
          </button>
        </div>
      )}
      <div
        className={`flex items-center ${showLabels ? 'justify-between gap-2' : 'flex-col gap-2'}`}
      >
        <ThemeToggleButton />
        <NotificationDropdown />
        <UserDropdown />
      </div>
    </div>
  );
}
