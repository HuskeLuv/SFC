import { useMemo } from 'react';
import { useCashflowData, useCollapsibleState, useProcessedData } from '@/hooks/useCashflow';
import { useProventos } from '@/hooks/useProventos';
import { useCashflowDerivedRows } from '@/hooks/useCashflowDerivedRows';

/**
 * Modelo de LEITURA do fluxo de caixa de um ano (PWA fase 2): a mesma composição que a planilha
 * de desktop sempre fez — árvore + investimentos calculados, proventos do ano, agregação,
 * linhas calculadas e o estado de recolher/expandir (mesma chave de localStorage).
 *
 * Usado pelo DataTableTwo (desktop) e pela visão do mês (celular): as duas telas leem os mesmos
 * números, sem duplicar regra.
 */
export function useCashflowView(year: number) {
  const { data, planejamentoPorMes, reinvestimentosPorMes, loading, error, refetch } =
    useCashflowData(year);
  // Mesmas datas do DataTableTwo: o ano inteiro no fuso local.
  const startDateISO = useMemo(() => new Date(year, 0, 1).toISOString(), [year]);
  const endDateISO = useMemo(() => new Date(year, 11, 31, 23, 59, 59).toISOString(), [year]);
  const { proventos } = useProventos(startDateISO, endDateISO);
  const collapsible = useCollapsibleState();
  const processedData = useProcessedData(data);
  const derived = useCashflowDerivedRows({
    processedData,
    currentYear: year,
    proventos,
    planejamentoPorMes,
    reinvestimentosPorMes,
  });

  return { data, loading, error, refetch, processedData, derived, collapsible };
}

export type CashflowView = ReturnType<typeof useCashflowView>;
