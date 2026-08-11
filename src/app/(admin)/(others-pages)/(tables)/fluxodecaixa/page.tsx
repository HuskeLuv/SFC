'use client';
import ComponentCard from '@/components/common/ComponentCard';
import DataTableTwo from '@/components/tables/DataTables/TableTwo/DataTableTwo';
import OrcamentoVsRealSection from '@/components/cashflow/orcamento/OrcamentoVsRealSection';
import { useSidebar } from '@/context/SidebarContext';
import React, { useEffect, useState } from 'react';

type Modo = 'planilha' | 'orcamento';

const MODOS: { value: Modo; label: string }[] = [
  { value: 'planilha', label: 'Planilha' },
  { value: 'orcamento', label: 'Orçamento' },
];

export default function FluxoDeCaixa() {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const isCollapsed = !(isExpanded || isHovered || isMobileOpen);
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
    <div className="inline-flex self-start rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-white/[0.03]">
      {MODOS.map((m) => {
        const isActive = m.value === modo;
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => selectModo(m.value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
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
      className={`${cardWidth} transition-all duration-300 -m-[30px] h-[calc(100vh-60px)] flex flex-col overflow-hidden`}
    >
      <ComponentCard
        title={modo === 'planilha' ? 'Fluxo de Caixa' : 'Orçamento vs Real'}
        className="flex-1 flex flex-col m-[30px] overflow-hidden"
      >
        <div className="flex-1 flex flex-col min-h-0 p-[30px] pt-5 overflow-hidden">
          <div className="mb-4">{pills}</div>
          {modo === 'planilha' ? (
            <DataTableTwo />
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
