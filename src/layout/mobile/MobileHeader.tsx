'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import NotificationDropdown from '@/components/header/NotificationDropdown';
import useGoBack from '@/hooks/useGoBack';
import { useAuth } from '@/hooks/useAuth';
import { useExitActing } from '@/hooks/useExitActing';
import CashflowYearSelect from '@/layout/CashflowYearSelect';
import { getMobilePageTitle, isNestedRoute } from '@/layout/navigation';
import { openMoreSheet, UserAvatar } from './MoreSheet';
import { useThemeColorSync } from './useThemeColorSync';

/**
 * Cabeçalho compacto da casca mobile (abaixo de lg): voltar ou logo, título da página, ano do
 * Fluxo (em /fluxodecaixa), sino e avatar (abre o painel Mais na seção Conta). Substitui o
 * botão hambúrguer flutuante, que cobria os títulos. Com personificação, a faixa "Vendo como".
 */
export default function MobileHeader() {
  const pathname = usePathname();
  const goBack = useGoBack();
  const { user, actingClient } = useAuth();
  const { exitActing, leaving } = useExitActing();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useThemeColorSync();

  // Borda inferior só depois de rolar ~4px (sentinel + IntersectionObserver, sem listener
  // de scroll).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), {
      rootMargin: '4px 0px 0px 0px',
      threshold: 0,
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  const title = getMobilePageTitle(pathname);
  const nested = isNestedRoute(pathname);
  const showYear = Boolean(pathname?.startsWith('/fluxodecaixa'));

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="-mb-px h-px lg:hidden" />
      <header
        data-mf-mobile-header=""
        className={`sticky top-0 z-[9980] border-b bg-white/95 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] backdrop-blur dark:bg-gray-900/95 lg:hidden print:hidden ${
          scrolled ? 'border-gray-200 dark:border-gray-800' : 'border-transparent'
        }`}
      >
        <div className="flex h-14 items-center gap-1 pr-2 pl-4">
          {nested ? (
            <button
              type="button"
              onClick={goBack}
              aria-label="Voltar"
              className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-700 active:bg-gray-100 dark:text-gray-300 dark:active:bg-white/5"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M15 5l-7 7 7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : (
            <Link
              href="/carteira"
              aria-label="My Finance — ir para a Carteira"
              className="mr-1 flex h-11 w-8 shrink-0 items-center"
            >
              <Image src="/images/logo/logo-icon.svg" alt="" width={28} height={28} />
            </Link>
          )}
          <p className="min-w-0 flex-1 truncate text-xl font-semibold text-gray-800 dark:text-white/90">
            {title}
          </p>
          {showYear ? <CashflowYearSelect compact /> : null}
          <NotificationDropdown placement="down" />
          <button
            type="button"
            onClick={() => openMoreSheet('conta')}
            aria-label="Abrir menu da conta"
            aria-haspopup="dialog"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-gray-100 dark:active:bg-white/5"
          >
            <UserAvatar user={user} />
          </button>
        </div>
        {actingClient ? (
          <div className="flex items-center justify-between gap-2 bg-mf-tranquilidade/15 px-4 py-1 text-xs text-mf-seguranca dark:bg-mf-tranquilidade/10 dark:text-mf-tranquilidade">
            <span className="min-w-0 truncate" role="status">
              Vendo como <b className="font-semibold">{actingClient.name}</b>
            </span>
            <button
              type="button"
              onClick={() => void exitActing()}
              disabled={leaving}
              className="-my-2 -mr-2 flex min-h-11 shrink-0 items-center px-2"
            >
              <span className="flex min-h-8 items-center rounded-lg border border-current px-3 font-medium">
                {leaving ? '…' : 'Sair'}
                <span className="sr-only"> da visão do cliente</span>
              </span>
            </button>
          </div>
        ) : null}
      </header>
    </>
  );
}
