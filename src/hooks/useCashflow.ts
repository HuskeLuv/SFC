import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CashflowGroup, AlertState, NewRowData } from '@/types/cashflow';
import { queryKeys } from '@/lib/queryKeys';
import { aggregateCashflow } from '@/services/cashflow/cashflowAggregation';
import {
  injectInvestimentosIntoGroups,
  filterInvestimentosComMovimento,
  type InvestimentoCalculado,
} from '@/services/cashflow/injectInvestimentos';

export const useCashflowData = (year?: number) => {
  const currentYear = year ?? new Date().getFullYear();

  // Duas queries em PARALELO (antes eram sequenciais dentro de um queryFn):
  // árvore do fluxo de caixa + aportes/resgates calculados da carteira.
  const groupsQuery = useQuery<CashflowGroup[]>({
    queryKey: queryKeys.cashflow.year(currentYear),
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/cashflow?year=${currentYear}`, {
        credentials: 'include',
        signal,
      });
      if (!response.ok) throw new Error('Erro ao buscar dados do cashflow');
      const responseData = await response.json();
      return responseData.groups || responseData;
    },
  });

  const investimentosQuery = useQuery<InvestimentoCalculado[]>({
    queryKey: queryKeys.cashflow.investimentos(currentYear),
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/cashflow/investimentos?year=${currentYear}`, {
        credentials: 'include',
        signal,
      });
      if (!response.ok) throw new Error('Erro ao buscar investimentos calculados');
      const responseData = await response.json();
      return responseData.investimentos || [];
    },
  });

  // Composição pura: injeta os investimentos calculados na árvore. Se a query
  // de investimentos falhar, a planilha renderiza sem o grupo automático
  // (mesmo comportamento tolerante da versão anterior).
  const data = useMemo(() => {
    const groups = groupsQuery.data;
    if (!groups) return [];
    if (!investimentosQuery.data) return groups;
    return injectInvestimentosIntoGroups(
      groups,
      filterInvestimentosComMovimento(investimentosQuery.data),
    );
  }, [groupsQuery.data, investimentosQuery.data]);

  const refetch = useCallback(async () => {
    await Promise.all([groupsQuery.refetch(), investimentosQuery.refetch()]);
  }, [groupsQuery, investimentosQuery]);

  return {
    data,
    loading: groupsQuery.isLoading || investimentosQuery.isLoading,
    error: groupsQuery.error ? (groupsQuery.error as Error).message : null,
    refetch,
  };
};

export const useCollapsibleState = () => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addingRow, setAddingRow] = useState<Record<string, boolean>>({});
  const [newRow, setNewRow] = useState<Record<string, NewRowData>>({});

  const toggleCollapse = useCallback((groupId: string) => {
    setCollapsed((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const startAddingRow = useCallback((groupId: string) => {
    setAddingRow((prev) => ({ ...prev, [groupId]: true }));
    setNewRow((prev) => ({
      ...prev,
      [groupId]: {
        name: '',
        significado: '',
      },
    }));
  }, []);

  const cancelAddingRow = useCallback((groupId: string) => {
    setAddingRow((prev) => ({ ...prev, [groupId]: false }));
    setNewRow((prev) => {
      const newState = { ...prev };
      delete newState[groupId];
      return newState;
    });
  }, []);

  const updateNewRow = useCallback(
    (groupId: string, field: keyof NewRowData, value: string | number) => {
      setNewRow((prev) => ({
        ...prev,
        [groupId]: { ...prev[groupId], [field]: value },
      }));
    },
    [],
  );

  return {
    collapsed,
    addingRow,
    newRow,
    toggleCollapse,
    startAddingRow,
    cancelAddingRow,
    updateNewRow,
  };
};

export const useAlert = () => {
  const [alert, setAlert] = useState<AlertState | null>(null);

  const showAlert = useCallback((type: 'success' | 'error', title: string, message: string) => {
    setAlert({ type, title, message });
    setTimeout(() => setAlert(null), 3000);
  }, []);

  return { alert, showAlert };
};

export const useProcessedData = (data: CashflowGroup[]) => {
  // A agregação vive em `@/services/cashflow/cashflowAggregation` (pura e
  // isomórfica) para que a planilha e o contexto de planejamento server-side
  // compartilhem exatamente a mesma semântica de sobra/despesa/despesa fixa.
  return useMemo(() => ({ groups: data, ...aggregateCashflow(data) }), [data]);
};
