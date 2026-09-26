'use client';
import ComponentCard from '@/components/common/ComponentCard';
import DataTableTwo from '@/components/tables/DataTables/TableTwo/DataTableTwo';
import OrcamentoVsRealSection from '@/components/cashflow/orcamento/OrcamentoVsRealSection';
import ConectarBancoCard from '@/components/conexoes/ConectarBancoCard';
import CashflowMonthView from '@/components/cashflow/mobile/CashflowMonthView';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { MOBILE_MEDIA_QUERY } from '@/lib/ui/mobile';
import { useSidebar } from '@/context/SidebarContext';
import { useCashflowYear } from '@/context/CashflowYearContext';
import React, { useEffect, useRef, useState } from 'react';

type Modo = 'planilha' | 'orcamento';

/**
 * `useIsBelowLg` com a TROCA de layout adiada (1s) depois da montagem: a planilha de desktop e a
 * visão do mês guardam estado próprio (grupo em edição, modal de importação) que se perde ao
 * trocar de árvore. Uma oscilação curta da largura (screenshot de página inteira, barra do
 * navegador) não pode desmontar a planilha; a primeira leitura no cliente vale na hora.
 */
function useStableIsBelowLg(): boolean {
  const raw = useIsBelowLg();
  const [stable, setStable] = useState(false);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      setStable(
        typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_MEDIA_QUERY).matches,
      );
      return;
    }
    const timer = setTimeout(() => setStable(raw), 1000);
    return () => clearTimeout(timer);
  }, [raw]);
  return stable;
}

const MODOS: { value: Modo; label: string }[] = [
  { value: 'planilha', label: 'Planilha' },
  { value: 'orcamento', label: 'Orçamento' },
];

export default function FluxoDeCaixa() {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const { year } = useCashflowYear();
  const isCollapsed = !(isExpanded || isHovered || isMobileOpen);
  // PWA fase 2: abaixo de lg a planilha vira a visão do mês (o servidor renderiza o desktop).
  const isMobile = useStableIsBelowLg();
  const cardWidth = isCollapsed ? 'max-w-[98vw] w-full' : '';

  // Modo na URL (?modo=) pra ser linkável e sobreviver a reload, sem
  // navegação completa do Next — mesmo padrão do PlanejamentoFinanceiro.
  const [modo, setModo] = useState<Modo>('planilha');
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('modo');
    if (param === 'planilha' || param === 'orcamento') setModo(param);
  }, []);
  const selectModo = (value: Modo) => {
    setModo(value);
    const url = new URL(window.location.href);
    if (value === 'planilha') url.searchParams.delete('modo');
    else url.searchParams.set('modo', value);
    window.history.replaceState(null, '', url.toString());
  };

  const pills = (
    <div className="inline-flex self-start rounded-lg border border-gray-200 bg-gray-50 p-1 max-lg:flex max-lg:h-[50px] max-lg:w-full max-lg:rounded-xl max-lg:p-[2px] dark:border-gray-800 dark:bg-white/[0.03]">
      {MODOS.map((m) => {
        const isActive = m.value === modo;
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => selectModo(m.value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition max-lg:min-h-11 max-lg:flex-1 max-lg:rounded-[10px] ${
              isActive
                ? 'bg-white text-brand-600 shadow-theme-xs dark:bg-gray-900 dark:text-brand-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
            aria-pressed={isActive}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      className={`${cardWidth} min-w-0 transition-all duration-300 -m-[30px] max-lg:m-0 h-[calc(100vh-60px)] max-lg:h-auto flex flex-col overflow-hidden max-lg:overflow-visible`}
    >
      <ComponentCard
        title={modo === 'planilha' ? `Fluxo de Caixa · ${year}` : `Orçamento vs Real · ${year}`}
        className="flex-1 flex flex-col min-w-0 m-[30px] max-lg:m-0 overflow-hidden max-lg:overflow-visible max-[359px]:-mx-4 max-[359px]:rounded-none max-[359px]:border-x-0"
        bodyClassName="max-lg:overflow-visible"
      >
        {/* Abaixo de lg nenhum ancestral corta (overflow visível): a barra do mês gruda na rolagem
            da página. */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 p-[30px] pt-5 max-lg:p-4 max-lg:pt-3 max-[359px]:px-3 overflow-hidden max-lg:overflow-visible max-lg:min-h-0">
          {/* Entrada do Open Finance (faixa compacta: a planilha ocupa a altura toda). */}
          <ConectarBancoCard contexto="fluxo" className="mb-3" />
          <div className="mb-4">{pills}</div>
          {modo === 'planilha' ? (
            isMobile ? (
              <CashflowMonthView />
            ) : (
              <DataTableTwo />
            )
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <OrcamentoVsRealSection />
            </div>
          )}
        </div>
      </ComponentCard>
    </div>
  );
}
