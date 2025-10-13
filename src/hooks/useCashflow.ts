import { useEffect, useState, useMemo, useCallback } from "react";
import { CashflowGroup, AlertState, NewRowData } from "@/types/cashflow";
import { isReceitaGroupByType } from "@/utils/formatters";

export const useCashflowData = () => {
  const [data, setData] = useState<CashflowGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
      try {
        setLoading(true);
        
        // Buscar dados do cashflow normal
        const cashflowResponse = await fetch("/api/cashflow", { credentials: "include" });
        
        if (!cashflowResponse.ok) {
          throw new Error("Erro ao buscar dados do cashflow");
        }
        
        const groups = await cashflowResponse.json();

        // Buscar investimentos calculados a partir das transações
        try {
          const investimentosResponse = await fetch("/api/cashflow/investimentos", { 
            credentials: "include" 
          });
          
          if (investimentosResponse.ok) {
            const investimentosData = await investimentosResponse.json();
            
            // Flag para garantir que só adicionamos aos investimentos uma vez
            let investimentosJaAdicionados = false;
            
            // Integrar investimentos ao grupo independente de Investimentos
            const gruposComInvestimentos = groups.map((group: CashflowGroup) => {
              // Encontrar grupo independente de Investimentos (primeiro que encontrar sem parentId)
              if (group.name === 'Investimentos' && !group.parentId && !investimentosJaAdicionados) {
                
                investimentosJaAdicionados = true;
                
                // SUBSTITUIR completamente os itens do grupo de Investimentos
                // Remover TODOS os itens antigos e usar apenas os calculados
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const itensCalculados = investimentosData.investimentos.map((inv: any) => ({
                  id: inv.id,
                  groupId: group.id,
                  descricao: inv.descricao,
                  significado: inv.significado,
                  categoria: inv.categoria,
                  order: inv.order, // Usar ordem definida na API
                  isActive: inv.isActive,
                  isInvestment: inv.isInvestment,
                  valores: inv.valores,
                }));

                // Usar APENAS os itens calculados (substituir tudo)
                return {
                  ...group,
                  items: itensCalculados,
                };
              }
              
              // Remover subgrupo "Investimentos" de dentro de "Despesas" se existir
              if (group.type === 'Despesas' && group.children) {
                return {
                  ...group,
                  children: group.children.filter(
                    (child: CashflowGroup) => !(child.name === 'Investimentos' && child.type === 'Despesas')
                  ),
                };
              }
              
              return group;
            });

            setData(gruposComInvestimentos);
          } else {
            // Se falhar ao buscar investimentos, usar apenas dados normais
            setData(groups);
          }
        } catch (invError) {
          console.warn('Erro ao buscar investimentos calculados:', invError);
          // Continuar com dados normais sem investimentos
          setData(groups);
        }
        
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro desconhecido");
      } finally {
        setLoading(false);
      }
  }, []);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch };
};

export const useCollapsibleState = () => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addingRow, setAddingRow] = useState<Record<string, boolean>>({});
  const [newRow, setNewRow] = useState<Record<string, NewRowData>>({});

  const toggleCollapse = useCallback((groupId: string) => {
    setCollapsed(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const startAddingRow = useCallback((groupId: string) => {
    setAddingRow(prev => ({ ...prev, [groupId]: true }));
    setNewRow(prev => ({ 
      ...prev, 
      [groupId]: {
        descricao: "",
        significado: "",
        percentTotal: 0
      }
    }));
  }, []);

  const cancelAddingRow = useCallback((groupId: string) => {
    setAddingRow(prev => ({ ...prev, [groupId]: false }));
    setNewRow(prev => {
      const newState = { ...prev };
      delete newState[groupId];
      return newState;
    });
  }, []);

  const updateNewRow = useCallback((groupId: string, field: keyof NewRowData, value: string | number) => {
    setNewRow(prev => ({
      ...prev,
      [groupId]: { ...prev[groupId], [field]: value }
    }));
  }, []);

  return {
    collapsed,
    addingRow,
    newRow,
    toggleCollapse,
    startAddingRow,
    cancelAddingRow,
    updateNewRow
  };
};

export const useAlert = () => {
  const [alert, setAlert] = useState<AlertState | null>(null);

  const showAlert = useCallback((type: "success" | "error", title: string, message: string) => {
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

    // Calculate section totals (Entradas and Despesas)
    let entradasTotal = 0;
    let despesasTotal = 0;

    // Helper function to find group by ID
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

    // Função recursiva para processar grupos e subgrupos
    const processGroup = (group: CashflowGroup) => {
      // Calcular totais dos itens
      if (group.items?.length) {
        group.items.forEach(item => {
          const itemValues = Array(12).fill(0);
          if (item.valores?.length) {
            item.valores.forEach(val => {
              if (typeof val.mes === 'number' && typeof val.valor === 'number') {
                itemValues[val.mes] = val.valor;
              }
            });
          }
          itemTotals[item.id] = itemValues;
          const annualTotal = itemValues.reduce((a, b) => a + b, 0);
          itemAnnualTotals[item.id] = annualTotal;
          
          // Add to section totals using simplified type check
          if (isReceitaGroupByType(group.type)) {
            entradasTotal += annualTotal;
          } else {
            despesasTotal += annualTotal;
          }
        });
      }

      // Calcular totais do grupo
      groupTotals[group.id] = Array(12).fill(0);
      groupAnnualTotals[group.id] = 0;
      
      // Somar itens do grupo
      if (group.items?.length) {
        group.items.forEach(item => {
          const itemValues = itemTotals[item.id];
          if (itemValues) {
            itemValues.forEach((value, month) => {
              groupTotals[group.id][month] += value;
              groupAnnualTotals[group.id] += value;
            });
          }
        });
      }

      // Processar subgrupos recursivamente
      if (group.children?.length) {
        group.children.forEach(child => {
          processGroup(child);
          // Somar totais dos subgrupos ao grupo pai
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

    // Processar todos os grupos principais
    data.forEach(group => {
      processGroup(group);
    });

    // Calculate percentages for each group
    Object.entries(groupAnnualTotals).forEach(([groupId, annualTotal]) => {
      const group = findGroupById(groupId);
      
      if (group) {
        const sectionTotal = isReceitaGroupByType(group.type) ? entradasTotal : despesasTotal;
        groupPercentages[groupId] = sectionTotal > 0 ? (annualTotal / sectionTotal) * 100 : 0;
      }
    });

    // Calculate percentages for each item
    Object.entries(itemAnnualTotals).forEach(([itemId, annualTotal]) => {
      // Find which group this item belongs to
      let itemGroup: CashflowGroup | undefined;
      for (const group of data) {
        const findItemInGroup = (g: CashflowGroup): CashflowGroup | undefined => {
          if (g.items?.some(item => item.id === itemId)) {
            return g;
          }
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
        const sectionTotal = isReceitaGroupByType(itemGroup.type) ? entradasTotal : despesasTotal;
        itemPercentages[itemId] = sectionTotal > 0 ? (annualTotal / sectionTotal) * 100 : 0;
      }
    });

    // Calculate general totals
    const totalByMonth = Array(12).fill(0);
    Object.entries(groupTotals).forEach(([groupId, arr]) => {
      const group = findGroupById(groupId);
      const isReceita = group ? isReceitaGroupByType(group.type) : false;
      arr.forEach((v, i) => {
        totalByMonth[i] += isReceita ? v : -v;
      });
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
      despesasTotal
    };
  }, [data]);
}; 