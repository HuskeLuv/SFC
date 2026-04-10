import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CashflowGroup, CashflowValue, AlertState, NewRowData } from '@/types/cashflow';
import { isReceitaGroupByType } from '@/utils/formatters';
import { queryKeys } from '@/lib/queryKeys';

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
        console.warn('Erro ao buscar investimentos calculados:', invError);
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
  return useMemo(() => {
    const groupTotals: Record<string, number[]> = {};
    const groupAnnualTotals: Record<string, number> = {};
    const groupPercentages: Record<string, number> = {};
    const itemTotals: Record<string, number[]> = {};
    const itemAnnualTotals: Record<string, number> = {};
    const itemPercentages: Record<string, number> = {};

    let entradasTotal = 0;
    let despesasTotal = 0;
    const entradasByMonth = Array(12).fill(0);
    const despesasByMonth = Array(12).fill(0);

    const findGroupById = (groupId: string): CashflowGroup | undefined => {
      const findInGroups = (groups: CashflowGroup[]): CashflowGroup | undefined => {
        for (const group of groups) {
          if (group.id === groupId) return group;
          if (group.children) {
            const found = findInGroups(group.children);
            if (found) return found;
          }
        }
        return undefined;
      };
      return findInGroups(data);
    };

    const processGroup = (group: CashflowGroup, isInvestmentGroup: boolean = false) => {
      const isInvestment = isInvestmentGroup || group.type === 'investimento';

      if (group.items?.length) {
        group.items.forEach((item) => {
          const itemValues = Array(12).fill(0);
          if (item.values?.length) {
            item.values.forEach((val: CashflowValue & { mes?: number; valor?: number }) => {
              const month = val.month !== undefined ? val.month : val.mes;
              const value = val.value !== undefined ? val.value : val.valor;
              if (
                typeof month === 'number' &&
                month >= 0 &&
                month < 12 &&
                typeof value === 'number'
              ) {
                itemValues[month] = value;
              }
            });
          }
          itemTotals[item.id] = itemValues;
          const annualTotal = itemValues.reduce((a, b) => a + b, 0);
          itemAnnualTotals[item.id] = annualTotal;

          if (isReceitaGroupByType(group.type)) {
            entradasTotal += annualTotal;
            itemValues.forEach((value, month) => {
              entradasByMonth[month] += value;
            });
          } else {
            despesasTotal += annualTotal;
            if (!isInvestment) {
              itemValues.forEach((value, month) => {
                despesasByMonth[month] += value;
              });
            }
          }
        });
      }

      groupTotals[group.id] = Array(12).fill(0);
      groupAnnualTotals[group.id] = 0;

      if (group.items?.length) {
        group.items.forEach((item) => {
          const itemValues = itemTotals[item.id];
          if (itemValues) {
            itemValues.forEach((value, month) => {
              groupTotals[group.id][month] += value;
              groupAnnualTotals[group.id] += value;
            });
          }
        });
      }

      if (group.children?.length) {
        group.children.forEach((child) => {
          processGroup(child, isInvestment);
          const childTotals = groupTotals[child.id];
          if (childTotals) {
            childTotals.forEach((value, month) => {
              groupTotals[group.id][month] += value;
              groupAnnualTotals[group.id] += value;
            });
          }
        });
      }
    };

    data.forEach((group) => {
      processGroup(group);
    });

    const receitaTotalBase = entradasTotal;

    Object.entries(groupAnnualTotals).forEach(([groupId, annualTotal]) => {
      const group = findGroupById(groupId);
      if (group) {
        const base = receitaTotalBase > 0 ? receitaTotalBase : 0;
        groupPercentages[groupId] = base > 0 ? (annualTotal / base) * 100 : 0;
      }
    });

    Object.entries(itemAnnualTotals).forEach(([itemId, annualTotal]) => {
      let itemGroup: CashflowGroup | undefined;
      for (const group of data) {
        const findItemInGroup = (g: CashflowGroup): CashflowGroup | undefined => {
          if (g.items?.some((item) => item.id === itemId)) return g;
          for (const child of g.children || []) {
            const found = findItemInGroup(child);
            if (found) return found;
          }
          return undefined;
        };
        itemGroup = findItemInGroup(group);
        if (itemGroup) break;
      }

      if (itemGroup) {
        const base = receitaTotalBase > 0 ? receitaTotalBase : 0;
        itemPercentages[itemId] = base > 0 ? (annualTotal / base) * 100 : 0;
      }
    });

    const totalByMonth = Array(12).fill(0);
    data.forEach((group) => {
      if (group.type === 'investimento') return;
      const arr = groupTotals[group.id];
      if (arr) {
        const isReceita = isReceitaGroupByType(group.type);
        arr.forEach((v, i) => {
          totalByMonth[i] += isReceita ? v : -v;
        });
      }
    });

    const totalAnnual = totalByMonth.reduce((a, b) => a + b, 0);

    return {
      groups: data,
      groupTotals,
      groupAnnualTotals,
      groupPercentages,
      itemTotals,
      itemAnnualTotals,
      itemPercentages,
      totalByMonth,
      totalAnnual,
      entradasTotal,
      despesasTotal,
      entradasByMonth,
      despesasByMonth,
    };
  }, [data]);
};
