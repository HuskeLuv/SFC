'use client';
import ComponentCard from '@/components/common/ComponentCard';
import DataTableTwo from '@/components/tables/DataTables/TableTwo/DataTableTwo';
import OrcamentoVsRealSection from '@/components/cashflow/orcamento/OrcamentoVsRealSection';
import OrcamentoV2Section, {
  EsqueletoOrcamentoV2,
} from '@/components/cashflow/orcamentoV2/OrcamentoV2Section';
import ConectarBancoCard from '@/components/conexoes/ConectarBancoCard';
import CashflowMonthView from '@/components/cashflow/mobile/CashflowMonthView';
import { useStableIsBelowLg } from '@/hooks/useStableIsBelowLg';
import { useOrcamentoV2Acesso } from '@/hooks/useOrcamentoV2Acesso';
import { SELO_TEXTO } from '@/lib/orcamento/tons';
import { useSidebar } from '@/context/SidebarContext';
import { useCashflowYear } from '@/context/CashflowYearContext';
import React, { useEffect, useState } from 'react';

type Modo = 'planilha' | 'orcamento';

/**
 * Aba Orçamento: o Orçamento v2 só para `liberada && ativado` (desenho técnico §8); quem a
 * resposta diz que não usa o v2 — flag desligada, fora do beta, não ativado — vê a tela de hoje,
 * sem mudança. A tela de hoje só aparece com a resposta em mãos: sem ela, esqueleto enquanto
 * carrega e, se a consulta falhar, um erro com "Tentar de novo" (a tela antiga nunca aparece
 * para quem já está ativado). O acesso só é consultado com a aba aberta (a Planilha não paga a
 * chamada).
 */
function AbaOrcamento() {
  const acesso = useOrcamentoV2Acesso();
  if (!acesso.data) {
    if (acesso.loading || !acesso.error) return <EsqueletoOrcamentoV2 />;
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
        <p role="alert" className={`text-sm ${SELO_TEXTO.estourou}`}>
          Não foi possível carregar o orçamento.
        </p>
        <button
          type="button"
          onClick={() => void acesso.refetch()}
          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-200 dark:hover:bg-white/5"
        >
          Tentar de novo
        </button>
      </div>
    );
  }
  return acesso.usarV2 ? <OrcamentoV2Section /> : <OrcamentoVsRealSection />;
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
      className={`${cardWidth} min-w-0 transition-all duration-300 -mx-6 -my-[30px] max-lg:m-0 h-[calc(100vh-60px)] max-lg:h-auto flex flex-col overflow-hidden max-lg:overflow-visible`}
    >
      <ComponentCard
        title={modo === 'planilha' ? `Fluxo de Caixa · ${year}` : `Orçamento vs Real · ${year}`}
        className="flex-1 flex flex-col min-w-0 mx-6 my-[30px] max-lg:m-0 overflow-hidden max-lg:overflow-visible max-[359px]:-mx-4 max-[359px]:rounded-none max-[359px]:border-x-0"
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
            // Abaixo de lg sem rolagem própria: a barra do mês do Orçamento gruda na da página.
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 max-lg:overflow-visible max-lg:pr-0">
              <AbaOrcamento />
            </div>
          )}
        </div>
      </ComponentCard>
    </div>
  );
}
