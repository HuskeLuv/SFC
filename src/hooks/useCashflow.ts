import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthOptional } from '@/context/AuthContext';
import { CashflowGroup, AlertState, NewRowData } from '@/types/cashflow';
import { queryKeys } from '@/lib/queryKeys';
import { aggregateCashflow } from '@/services/cashflow/cashflowAggregation';
import {
  injectInvestimentosIntoGroups,
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

  const investimentosQuery = useQuery<{
    investimentos: InvestimentoCalculado[];
    totaisPlanejamentoPorMes: number[];
  }>({
    queryKey: queryKeys.cashflow.investimentos(currentYear),
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/cashflow/investimentos?year=${currentYear}`, {
        credentials: 'include',
        signal,
      });
      if (!response.ok) throw new Error('Erro ao buscar investimentos calculados');
      const responseData = await response.json();
      return {
        investimentos: responseData.investimentos || [],
        totaisPlanejamentoPorMes: responseData.totaisPlanejamentoPorMes || Array(12).fill(0),
      };
    },
  });

  // Composição pura: injeta os investimentos calculados na árvore. Se a query
  // de investimentos falhar, a planilha renderiza sem o grupo automático
  // (mesmo comportamento tolerante da versão anterior).
  const data = useMemo(() => {
    const groups = groupsQuery.data;
    if (!groups) return [];
    if (!investimentosQuery.data) return groups;
    // Todas as categorias aparecem sempre, mesmo zeradas (decisão 29/07/2026 —
    // o usuário recém-criado já vê a estrutura completa do Aporte/Resgate).
    return injectInvestimentosIntoGroups(groups, investimentosQuery.data.investimentos);
  }, [groupsQuery.data, investimentosQuery.data]);

  const refetch = useCallback(async () => {
    await Promise.all([groupsQuery.refetch(), investimentosQuery.refetch()]);
  }, [groupsQuery, investimentosQuery]);

  return {
    data,
    // Aportes de ativos vinculados a sonho (fora do Aporte/Resgate) — a
    // Evolução do Patrimônio precisa da série cheia.
    planejamentoPorMes: investimentosQuery.data?.totaisPlanejamentoPorMes,
    loading: groupsQuery.isLoading || investimentosQuery.isLoading,
    error: groupsQuery.error ? (groupsQuery.error as Error).message : null,
    refetch,
  };
};

export const useCollapsibleState = () => {
  // Tolerante à ausência do AuthProvider (testes de hook isolado): sem user,
  // o colapso funciona normal, só não persiste.
  const auth = useAuthOptional();
  const user = auth?.user ?? null;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addingRow, setAddingRow] = useState<Record<string, boolean>>({});
  const [newRow, setNewRow] = useState<Record<string, NewRowData>>({});

  // Lembra quais grupos estavam abertos/colapsados entre visitas (pedido
  // ago/2026). Persistência em localStorage por usuário — preferência de UI
  // local, sem custo de rede; ids de grupo são estáveis por usuário.
  const storageKey = user?.id ? `cashflow:collapsed:${user.id}` : null;
  const loadedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!storageKey || loadedKeyRef.current === storageKey) return;
    loadedKeyRef.current = storageKey;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setCollapsed(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      // storage indisponível/corrompido — segue com estado vazio
    }
  }, [storageKey]);

  const toggleCollapse = useCallback(
    (groupId: string) => {
      setCollapsed((prev) => {
        const next = { ...prev, [groupId]: !prev[groupId] };
        if (storageKey) {
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(next));
          } catch {
            // quota/navegador restrito — a preferência só não persiste
          }
        }
        return next;
      });
    },
    [storageKey],
  );

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
