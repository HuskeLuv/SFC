'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DollarLineIcon, HorizontaLDots, PencilIcon, TableIcon } from '@/icons';
import { getActiveTab, TAB_ITEM_NAMES, useMainNavItems, type MobileTab } from '@/layout/navigation';
import { onOpenLancamento } from '@/lib/cashflow/cashflowEvents';
import LancamentoRapidoSheet from './LancamentoRapidoSheet';
import LaunchSheet, { getAvailableQuickLaunchActions } from './LaunchSheet';
import MoreSheet, { openMoreSheet, useMoreSheetState } from './MoreSheet';

/** Classes de grade literais (o JIT do Tailwind não enxerga classes montadas). */
const GRID_COLS = { 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' } as const;

const TAB_BASE =
  'flex h-full min-h-11 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium';
const PILL_BASE =
  'flex h-[30px] w-[52px] items-center justify-center rounded-full transition-colors duration-[180ms] active:scale-[.92] [&_svg]:h-6 [&_svg]:w-6';

function TabContent({
  active,
  icon,
  label,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: React.ReactNode;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`${PILL_BASE} ${
          active
            ? 'bg-mf-outside/10 text-mf-outside dark:bg-mf-tranquilidade/15 dark:text-mf-tranquilidade'
            : ''
        }`}
      >
        {icon}
      </span>
      {label}
    </>
  );
}

const tabTextClass = (active: boolean) =>
  active ? 'text-mf-patrimonio dark:text-mf-tranquilidade' : 'text-gray-500 dark:text-gray-400';

type LinkTab = {
  id: Exclude<MobileTab, 'mais'>;
  itemName: string;
  label: React.ReactNode;
  ariaLabel?: string;
  icon: React.ReactNode;
};

/**
 * Barra de abas mobile (abaixo de lg): Carteira · Fluxo · + Lançar · Planejamento · Mais.
 * Cada aba só aparece se o item existir no menu do usuário (personificação/perfil). Some com
 * overlay aberto ou teclado (regras da casca no globals.css), nunca ao rolar.
 */
export default function MobileTabBar() {
  const pathname = usePathname();
  const items = useMainNavItems();
  const { open: moreOpen } = useMoreSheetState();
  const [launchOpen, setLaunchOpen] = useState(false);
  // Lançamento rápido do Fluxo (PWA fase 2): abre em qualquer tela.
  const [lancamentoOpen, setLancamentoOpen] = useState(false);

  const has = (name: string) => items.some((item) => item.name === name);
  const pathOf = (name: string) => items.find((item) => item.name === name)?.path ?? '/';
  const activeTab = getActiveTab(pathname, items);

  const leftTabs: LinkTab[] = [
    {
      id: 'carteira' as const,
      itemName: TAB_ITEM_NAMES.carteira,
      label: <span className="max-w-full truncate px-0.5">Carteira</span>,
      icon: <DollarLineIcon />,
    },
    {
      id: 'fluxo' as const,
      itemName: TAB_ITEM_NAMES.fluxo,
      label: <span className="max-w-full truncate px-0.5">Fluxo</span>,
      ariaLabel: 'Fluxo de Caixa',
      icon: <TableIcon />,
    },
  ].filter((tab) => has(tab.itemName));

  const rightTabs: LinkTab[] = [
    {
      id: 'planejamento' as const,
      itemName: TAB_ITEM_NAMES.planejamento,
      label: <span className="max-w-full truncate px-0.5">Planejar</span>,
      ariaLabel: 'Planejamento',
      icon: <PencilIcon />,
    },
  ].filter((tab) => has(tab.itemName));

  const launchActions = getAvailableQuickLaunchActions(items);
  const showLaunch = launchActions.length > 0;
  const canLancarFluxo = launchActions.some((action) => action.kind === 'sheet');

  // A visão do mês (estado vazio) pede o lançamento rápido pelo barramento do Fluxo.
  useEffect(() => {
    if (!canLancarFluxo) return;
    return onOpenLancamento(() => {
      setLaunchOpen(false);
      setLancamentoOpen(true);
    });
  }, [canLancarFluxo]);

  const count = leftTabs.length + rightTabs.length + 1 + (showLaunch ? 1 : 0);
  const gridCols = GRID_COLS[Math.min(5, Math.max(3, count)) as 3 | 4 | 5];

  const renderLinkTab = (tab: LinkTab) => {
    const active = activeTab === tab.id;
    return (
      <li key={tab.id} className="min-w-0">
        <Link
          href={pathOf(tab.itemName)}
          aria-current={active ? 'page' : undefined}
          aria-label={tab.ariaLabel}
          className={`${TAB_BASE} ${tabTextClass(active)}`}
        >
          <TabContent active={active} icon={tab.icon} label={tab.label} />
        </Link>
      </li>
    );
  };

  const moreActive = activeTab === 'mais';

  return (
    <>
      <nav
        data-mf-tabbar=""
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-[9990] border-t border-gray-200 bg-white/95 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 lg:hidden print:hidden"
      >
        <ul className={`grid h-16 px-1 ${gridCols}`}>
          {leftTabs.map(renderLinkTab)}
          {showLaunch ? (
            <li className="flex min-w-0 flex-col items-center">
              <button
                type="button"
                aria-label="Lançar"
                aria-haspopup="dialog"
                aria-expanded={launchOpen}
                onClick={() => setLaunchOpen((open) => !open)}
                className="-mt-[18px] flex h-14 w-14 items-center justify-center self-center justify-self-center rounded-full bg-mf-outside text-white shadow-[0_6px_16px_rgb(0_121_242/0.35)] ring-4 ring-white active:scale-[.94] active:bg-mf-patrimonio dark:ring-gray-900"
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className={`transition-transform duration-200 ${launchOpen ? 'rotate-45' : ''}`}
                >
                  <path
                    d="M12 5v14M5 12h14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <span
                aria-hidden="true"
                className="mt-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400"
              >
                Lançar
              </span>
            </li>
          ) : null}
          {rightTabs.map(renderLinkTab)}
          <li className="min-w-0">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => openMoreSheet()}
              className={`${TAB_BASE} ${tabTextClass(moreActive)}`}
            >
              <TabContent
                active={moreActive}
                icon={<HorizontaLDots />}
                label={<span className="max-w-full truncate px-0.5">Mais</span>}
              />
            </button>
          </li>
        </ul>
      </nav>
      {showLaunch ? (
        <LaunchSheet
          isOpen={launchOpen}
          onClose={() => setLaunchOpen(false)}
          actions={launchActions}
          // Abre depois do fechamento do "+ Lançar" (a trava de rolagem e o foco se acertam antes).
          onOpenCashflowLaunch={() => window.requestAnimationFrame(() => setLancamentoOpen(true))}
        />
      ) : null}
      {canLancarFluxo ? (
        <LancamentoRapidoSheet isOpen={lancamentoOpen} onClose={() => setLancamentoOpen(false)} />
      ) : null}
      <MoreSheet />
    </>
  );
}
