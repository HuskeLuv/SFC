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
        // Novo endpoint retorna { year, groups }
        const cashflowResponse = await fetch("/api/cashflow", { credentials: "include" });
        
        if (!cashflowResponse.ok) {
          throw new Error("Erro ao buscar dados do cashflow");
        }
        
        const responseData = await cashflowResponse.json();
        // Extrair grupos e ano da resposta
        const groups = responseData.groups || responseData; // Compatibilidade com formato antigo
        const year = responseData.year || new Date().getFullYear(); // Ano do fluxo de caixa

        // Buscar investimentos calculados a partir das transações
        try {
          const investimentosResponse = await fetch(`/api/cashflow/investimentos?year=${year}`, { 
            credentials: "include" 
          });
          
          if (investimentosResponse.ok) {
            const investimentosData = await investimentosResponse.json();
            
            // Flag para garantir que só adicionamos aos investimentos uma vez
            let investimentosJaAdicionados = false;
            
            // Função auxiliar para encontrar grupo de Investimentos (recursiva)
            const findInvestmentGroup = (groupList: CashflowGroup[]): CashflowGroup | null => {
              for (const group of groupList) {
                // Verificar se este grupo é o de Investimentos
                const isInvestmentGroup = (group.name === 'Investimentos' || group.type === 'investimento');
                if (isInvestmentGroup) {
                  return group;
                }
                // Buscar recursivamente nos filhos
                if (group.children && group.children.length > 0) {
                  const found = findInvestmentGroup(group.children);
                  if (found) return found;
                }
              }
              return null;
            };
            
            // Função recursiva para encontrar e atualizar grupo de Investimentos
            const findAndUpdateInvestmentGroup = (group: CashflowGroup): CashflowGroup => {
              // Verificar se este grupo é o de Investimentos (top-level ou não)
              const isInvestmentGroup = (group.name === 'Investimentos' || group.type === 'investimento');
              
              if (isInvestmentGroup && !investimentosJaAdicionados) {
                investimentosJaAdicionados = true;
                
                console.log('[Cashflow] Grupo Investimentos encontrado:', group.id, group.name);
                console.log('[Cashflow] Itens calculados a adicionar:', investimentosData.investimentos.length);
                
                // SUBSTITUIR completamente os itens do grupo de Investimentos
                // Remover TODOS os itens antigos e usar apenas os calculados
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const itensCalculados = investimentosData.investimentos.map((inv: any) => {
                  // Priorizar 'values' que é o formato novo, depois 'valores' para compatibilidade
                  const values = inv.values || inv.valores || [];
                  
                  console.log(`[Cashflow] Mapeando item ${inv.name || inv.descricao}: ${values.length} valores`);
                  if (values.length > 0) {
                    console.log(`[Cashflow] Primeiro valor:`, values[0]);
                  }
                  
                  return {
                    id: inv.id,
                    userId: null, // Itens calculados são como templates
                    groupId: group.id,
                    name: inv.descricao || inv.name,
                    significado: null, // Investimentos não têm significado
                    rank: null, // Investimentos não têm rank
                    values: values,
                  };
                });

                console.log('[Cashflow] Itens calculados mapeados:', itensCalculados.length);

                // Usar APENAS os itens calculados (substituir tudo)
                return {
                  ...group,
                  items: itensCalculados,
                  children: group.children?.map(child => findAndUpdateInvestmentGroup(child)) || [],
                };
              }
              
              // Processar filhos recursivamente
              const updatedChildren = group.children?.map(child => findAndUpdateInvestmentGroup(child)) || [];
              
              // Remover subgrupo "Investimentos" de dentro de "Despesas" se existir
              const filteredChildren = group.type === 'despesa' 
                ? updatedChildren.filter(
                    (child: CashflowGroup) => !(child.name === 'Investimentos' && child.type === 'despesa')
                  )
                : updatedChildren;
              
              return {
                ...group,
                children: filteredChildren,
              };
            };
            
            // Integrar investimentos ao grupo de Investimentos (recursivamente)
            let gruposComInvestimentos = groups.map((group: CashflowGroup) => findAndUpdateInvestmentGroup(group));
            
            // Se não encontrou o grupo, criar um novo grupo de Investimentos no top-level
            if (!investimentosJaAdicionados && investimentosData.investimentos.length > 0) {
              console.warn('[Cashflow] Grupo Investimentos não encontrado! Criando novo grupo.');
              
              // Buscar novamente de forma simples para garantir
              const investmentGroup = findInvestmentGroup(groups);
              
              if (investmentGroup) {
                // Se encontrou mas não foi atualizado, atualizar agora
                gruposComInvestimentos = gruposComInvestimentos.map((group: CashflowGroup) => {
                  if (group.id === investmentGroup.id || 
                      (group.name === 'Investimentos' || group.type === 'investimento')) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const itensCalculados = investimentosData.investimentos.map((inv: any) => ({
                      id: inv.id,
                      userId: null,
                      groupId: group.id,
                      name: inv.descricao || inv.name,
                      significado: inv.significado || null,
                      rank: inv.order || inv.rank || null,
                      values: inv.valores || inv.values || [],
                    }));
                    
                    return {
                      ...group,
                      items: itensCalculados,
                    };
                  }
                  return group;
                });
              } else {
                // Criar novo grupo de Investimentos se não existir
                console.warn('[Cashflow] Criando novo grupo Investimentos no top-level');
                const novoGrupo: CashflowGroup = {
                  id: 'investimentos-calculados',
                  userId: null,
                  name: 'Investimentos',
                  type: 'investimento',
                  orderIndex: 999,
                  parentId: null,
                  items: investimentosData.investimentos.map((inv: any) => ({
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
          name: "",
          significado: ""
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
    const entradasByMonth = Array(12).fill(0);
    const despesasByMonth = Array(12).fill(0);

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
    const processGroup = (group: CashflowGroup, isInvestmentGroup: boolean = false) => {
      // Verificar se este grupo é de Investimentos
      const isInvestment = isInvestmentGroup || group.name === 'Investimentos' || group.type === 'investimento';
      
      // Calcular totais dos itens
      if (      group.items?.length) {
        group.items.forEach(item => {
          const itemValues = Array(12).fill(0);
          if (item.values?.length) {
            item.values.forEach(val => {
              // Suportar formato novo (month/value) e formato antigo (mes/valor) para compatibilidade
              const month = (val as any).month !== undefined ? (val as any).month : (val as any).mes;
              const value = (val as any).value !== undefined ? (val as any).value : (val as any).valor;
              if (typeof month === 'number' && month >= 0 && month < 12 && typeof value === 'number') {
                itemValues[month] = value;
              }
            });
          }
          itemTotals[item.id] = itemValues;
          const annualTotal = itemValues.reduce((a, b) => a + b, 0);
          itemAnnualTotals[item.id] = annualTotal;
          
          // Add to section totals using simplified type check
          if (isReceitaGroupByType(group.type)) {
            entradasTotal += annualTotal;
            // Somar entradas por mês
            itemValues.forEach((value, month) => {
              entradasByMonth[month] += value;
            });
          } else {
            despesasTotal += annualTotal;
            // Somar despesas por mês apenas se NÃO for grupo de Investimentos
            if (!isInvestment) {
              itemValues.forEach((value, month) => {
                despesasByMonth[month] += value;
              });
            }
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
          processGroup(child, isInvestment);
          // Somar totais dos subgrupos ao grupo pai
          const childTotals = groupTotals[child.id];
          if (childTotals) {
            childTotals.forEach((value, month) => {
              groupTotals[group.id][month] += value;
              groupAnnualTotals[group.id] += value;
            });
          }
          // Nota: As entradas e despesas dos subgrupos já foram somadas quando processamos os itens dos subgrupos recursivamente
          // Não precisamos somar novamente aqui para evitar duplicação
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

    // Calculate general totals (excluding Investimentos)
    // Only sum top-level groups to avoid double counting (subgroups are already included in parent totals)
    const totalByMonth = Array(12).fill(0);
    data.forEach(group => {
      // Exclude Investimentos from total calculation
      if (group.name === 'Investimentos') {
        return;
      }
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
      despesasByMonth
    };
  }, [data]);
}; 