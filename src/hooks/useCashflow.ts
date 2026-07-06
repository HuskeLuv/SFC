import { logger } from '@/lib/logger';
import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CashflowGroup, CashflowValue, AlertState, NewRowData } from '@/types/cashflow';
import { queryKeys } from '@/lib/queryKeys';
import { aggregateCashflow } from '@/services/cashflow/cashflowAggregation';

interface InvestimentoItem {
  id: string;
  name?: string;
  descricao?: string;
  significado?: string | null;
  order?: string | null;
  rank?: string | null;
  valores?: CashflowValue[];
  values?: CashflowValue[];
}

export const useCashflowData = (year?: number) => {
  const currentYear = year ?? new Date().getFullYear();

  const {
    data = [],
    isLoading: loading,
    error: queryError,
    refetch: queryRefetch,
  } = useQuery<CashflowGroup[]>({
    queryKey: queryKeys.cashflow.year(currentYear),
    queryFn: async ({ signal }) => {
      const cashflowResponse = await fetch(`/api/cashflow?year=${currentYear}`, {
        credentials: 'include',
        signal,
      });

      if (!cashflowResponse.ok) {
        throw new Error('Erro ao buscar dados do cashflow');
      }

      const responseData = await cashflowResponse.json();
      const groups = responseData.groups || responseData;

      // Fetch calculated investments
      try {
        const investimentosResponse = await fetch(
          `/api/cashflow/investimentos?year=${currentYear}`,
          {
            credentials: 'include',
            signal,
          },
        );

        if (investimentosResponse.ok) {
          const investimentosData = await investimentosResponse.json();
          // Oculta categorias sem movimento no ano — a planilha só mostra as
          // classes em que o cliente de fato aportou/resgatou.
          investimentosData.investimentos = (investimentosData.investimentos || []).filter(
            (inv: InvestimentoItem & { totalAnual?: number }) =>
              (inv.values || inv.valores || []).some(
                (v: CashflowValue & { valor?: number }) => (v.value ?? v.valor ?? 0) !== 0,
              ),
          );
          let investimentosJaAdicionados = false;

          const findInvestmentGroup = (groupList: CashflowGroup[]): CashflowGroup | null => {
            for (const group of groupList) {
              if (group.type === 'investimento') return group;
              if (group.children && group.children.length > 0) {
                const found = findInvestmentGroup(group.children);
                if (found) return found;
              }
            }
            return null;
          };

          const findAndUpdateInvestmentGroup = (group: CashflowGroup): CashflowGroup => {
            const isInvestment = group.type === 'investimento';

            if (isInvestment && !investimentosJaAdicionados) {
              investimentosJaAdicionados = true;

              const itensCalculados = investimentosData.investimentos.map(
                (inv: InvestimentoItem) => {
                  const values = inv.values || inv.valores || [];
                  return {
                    id: inv.id,
                    userId: null,
                    groupId: group.id,
                    name: inv.descricao || inv.name,
                    significado: null,
                    rank: null,
                    values: values,
                  };
                },
              );

              return {
                ...group,
                items: itensCalculados,
                children: group.children?.map((child) => findAndUpdateInvestmentGroup(child)) || [],
              };
            }

            const updatedChildren =
              group.children?.map((child) => findAndUpdateInvestmentGroup(child)) || [];

            const filteredChildren =
              group.type === 'despesa'
                ? updatedChildren.filter(
                    (child: CashflowGroup) =>
                      !(child.name === 'Investimentos' && child.type === 'despesa'),
                  )
                : updatedChildren;

            return { ...group, children: filteredChildren };
          };

          let gruposComInvestimentos = groups.map((group: CashflowGroup) =>
            findAndUpdateInvestmentGroup(group),
          );

          if (!investimentosJaAdicionados && investimentosData.investimentos.length > 0) {
            const investmentGroup = findInvestmentGroup(groups);

            if (investmentGroup) {
              gruposComInvestimentos = gruposComInvestimentos.map((group: CashflowGroup) => {
                if (group.id === investmentGroup.id || group.type === 'investimento') {
                  const itensCalculados = investimentosData.investimentos.map(
                    (inv: InvestimentoItem) => ({
                      id: inv.id,
                      userId: null,
                      groupId: group.id,
                      name: inv.descricao || inv.name,
                      significado: inv.significado || null,
                      rank: inv.order || inv.rank || null,
                      values: inv.valores || inv.values || [],
                    }),
                  );
                  return { ...group, items: itensCalculados };
                }
                return group;
              });
            } else {
              const novoGrupo: CashflowGroup = {
                id: 'investimentos-calculados',
                userId: null,
                name: 'Investimentos',
                type: 'investimento',
                orderIndex: 999,
                parentId: null,
                items: investimentosData.investimentos.map((inv: InvestimentoItem) => ({
                  id: inv.id,
                  userId: null,
                  groupId: 'investimentos-calculados',
                  name: inv.descricao || inv.name,
                  significado: inv.significado || null,
                  rank: inv.order || inv.rank || null,
                  values: inv.valores || inv.values || [],
                })),
                children: [],
              };
              gruposComInvestimentos.push(novoGrupo);
            }
          }

          return gruposComInvestimentos;
        }
      } catch (invError) {
        logger.warn('Erro ao buscar investimentos calculados:', invError);
      }

      return groups;
    },
  });

  const refetch = useCallback(async () => {
    await queryRefetch();
  }, [queryRefetch]);

  return { data, loading, error: queryError ? (queryError as Error).message : null, refetch };
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
