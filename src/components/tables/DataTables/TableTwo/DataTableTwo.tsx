"use client";
import { useCallback, useState, useEffect, useRef, useMemo } from "react";
import React from "react";
import Alert from "@/components/ui/alert/Alert";
import { Table, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { 
  useCashflowData, 
  useCollapsibleState, 
  useAlert, 
  useProcessedData 
} from "@/hooks/useCashflow";
import { validateNewRow } from "@/utils/validation";
import {
  TableHeaderComponent,
  GroupHeader,
  ItemRow,
  AddRowForm,
  TotalRow,
  SavingsIndexRow,
  FinancialPeaceIndexRow,
  InflationPedroRow,
  NewItemRow,
  PreviousMonthBalanceRow
} from "@/components/cashflow";
import { EditableItemRow } from "@/components/cashflow/EditableItemRow";
import { CashflowItem, CashflowGroup } from "@/types/cashflow";
import { createCashflowItem } from "@/utils/cashflowUpdate";
import { useCellEditing } from "@/hooks/useCellEditing";
import { useGroupEditMode } from "@/hooks/useGroupEditMode";
import { getAllItemsInGroup, findItemById } from "@/utils/cashflowHelpers";
import { isReceitaGroupByType, formatCurrency } from "@/utils/formatters";
import { FIXED_COLUMN_BODY_STYLES } from "@/components/cashflow/fixedColumns";
import { CommentModal } from "@/components/cashflow/CommentModal";

export default function DataTableTwo() {
  const { data, loading, error, refetch } = useCashflowData();
  const { 
    collapsed, 
    addingRow, 
    newRow, 
    toggleCollapse, 
    startAddingRow, 
    cancelAddingRow, 
    updateNewRow 
  } = useCollapsibleState();
  const { alert, showAlert } = useAlert();
  const processedData = useProcessedData(data);
  const [newItems, setNewItems] = useState<Record<string, CashflowItem>>({});
  const [savingGroups, setSavingGroups] = useState<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Função auxiliar para encontrar grupo "Despesas Fixas" recursivamente
  const findDespesasFixasGroup = useMemo(() => {
    const findGroup = (groups: CashflowGroup[]): CashflowGroup | null => {
      for (const group of groups) {
        if (group.name === 'Despesas Fixas') {
          return group;
        }
        if (group.children && group.children.length > 0) {
          const found = findGroup(group.children);
          if (found) return found;
        }
      }
      return null;
    };
    return findGroup(processedData.groups);
  }, [processedData.groups]);

  // Calcular valores de Despesas Fixas por mês e anual
  const despesasFixasData = useMemo(() => {
    if (!findDespesasFixasGroup) {
      return {
        byMonth: Array(12).fill(0),
        annual: 0
      };
    }
    const groupTotals = processedData.groupTotals[findDespesasFixasGroup.id] || Array(12).fill(0);
    const annualTotal = processedData.groupAnnualTotals[findDespesasFixasGroup.id] || 0;
    return {
      byMonth: groupTotals,
      annual: annualTotal
    };
  }, [findDespesasFixasGroup, processedData.groupTotals, processedData.groupAnnualTotals]);

  // Proventos recebidos (por enquanto vazio, preparado para futuro)
  const proventosByMonth = useMemo(() => Array(12).fill(0), []);
  const proventosAnnual = useMemo(() => 0, []);

  // Calcular Saldo Não Investido no Mês Anterior = Fluxo de caixa livre do mês anterior
  const previousMonthBalance = useMemo(() => {
    // Encontrar o grupo "Investimentos" para obter valores de aportes/resgates
    const findInvestimentosGroup = (groups: CashflowGroup[]): CashflowGroup | null => {
      for (const group of groups) {
        if (group.name === 'Investimentos' || group.type === 'investimento') {
          return group;
        }
        if (group.children) {
          const found = findInvestimentosGroup(group.children);
          if (found) return found;
        }
      }
      return null;
    };
    
    const investimentosGroup = findInvestimentosGroup(processedData.groups);
    const investimentosByMonth = investimentosGroup 
      ? (processedData.groupTotals[investimentosGroup.id] || Array(12).fill(0))
      : Array(12).fill(0);
    
    const saldo: number[] = [];
    // Calcular fluxo de caixa livre acumulado usando a fórmula:
    // Fluxo de Caixa Livre = (Saldo do mês atual) - (Aportes/Resgates) + (Saldo do mês anterior)
    const fluxoCaixaLivreAcumulado: number[] = [];
    for (let index = 0; index < 12; index++) {
      // Saldo do mês atual = Entradas - Despesas
      const saldoMesAtual = processedData.entradasByMonth[index] - processedData.despesasByMonth[index];
      // Aportes/Resgates do mês atual
      const aportesResgates = investimentosByMonth[index] || 0;
      // Saldo Não Investido no Mês Anterior = Fluxo de caixa livre do mês anterior
      const saldoNaoInvestidoMesAnterior = index === 0 ? 0 : (fluxoCaixaLivreAcumulado[index - 1] || 0);
      
      // Fórmula: (Saldo do mês atual) - (Aportes/Resgates) + (Saldo Não Investido no Mês Anterior)
      const fluxoCaixaLivre = saldoMesAtual - aportesResgates + saldoNaoInvestidoMesAnterior;
      fluxoCaixaLivreAcumulado.push(fluxoCaixaLivre);
      
      // Saldo Não Investido no Mês Anterior = Fluxo de caixa livre do mês anterior
      saldo.push(saldoNaoInvestidoMesAnterior);
    }
    return saldo;
  }, [processedData.entradasByMonth, processedData.despesasByMonth, processedData.groups, processedData.groupTotals]);

  // Garantir que o scroll inicial mostre janeiro (primeira coluna de mês)
  useEffect(() => {
    if (!scrollContainerRef.current || loading || !data?.length) return;
    
    const container = scrollContainerRef.current;
    
    // Função para garantir que janeiro seja visível
    const ensureJanuaryVisible = () => {
      if (!container) return;
      
      // Primeiro, garantir que o scroll seja 0
      container.scrollLeft = 0;
      
      // Usar requestAnimationFrame para garantir que o layout esteja pronto
      requestAnimationFrame(() => {
        if (!container) return;
        
        // Tentar encontrar a primeira célula de mês (janeiro)
        const firstMonthCell = container.querySelector('#first-month-cell') as HTMLElement;
        if (firstMonthCell) {
          // Calcular a posição necessária para mostrar janeiro
          const fixedColumnsWidth = 416; // 128 + 160 + 64 + 64
          const containerWidth = container.clientWidth;
          
          if (containerWidth > 0 && containerWidth < fixedColumnsWidth + 48) {
            // Em telas menores, ajustar scroll para mostrar janeiro
            const scrollPosition = fixedColumnsWidth - containerWidth + 48;
            container.scrollLeft = Math.max(0, scrollPosition);
          } else {
            // Em telas maiores, manter scroll = 0
            container.scrollLeft = 0;
          }
        } else {
          // Se não encontrar a célula, apenas resetar para 0
          container.scrollLeft = 0;
        }
      });
    };
    
    // Executar após renderização
    const timeout1 = setTimeout(ensureJanuaryVisible, 0);
    const timeout2 = setTimeout(ensureJanuaryVisible, 100);
    const timeout3 = setTimeout(ensureJanuaryVisible, 300);
    const timeout4 = setTimeout(ensureJanuaryVisible, 500);
    const timeout5 = setTimeout(ensureJanuaryVisible, 1000);
    
    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
      clearTimeout(timeout4);
      clearTimeout(timeout5);
    };
  }, [loading, data]);

  // Shared editing state for all ItemRow components (legacy - mantido para compatibilidade)
  const { startEditing, stopEditing, isEditing } = useCellEditing();

  // Novo sistema de edição por grupo
  const {
    startEditing: startGroupEditing,
    stopEditing: stopGroupEditing,
    isEditing: isGroupEditing,
    updateItemField,
    deleteItem,
    cancelEditing,
    getEditedItem,
    isItemDeleted,
    getChangesForGroup,
    selectedColor,
    setSelectedColor,
    applyColorToCell,
    isCommentModeActive,
    setIsCommentModeActive,
  } = useGroupEditMode();

  // Estado para modal de comentário
  const [commentModal, setCommentModal] = useState<{
    isOpen: boolean;
    itemId: string | null;
    itemName: string;
    month: number;
    year: number;
    initialComment: string | null;
    updatedAt: Date | null;
  }>({
    isOpen: false,
    itemId: null,
    itemName: "",
    month: 0,
    year: new Date().getFullYear(),
    initialComment: null,
    updatedAt: null,
  });

  // Função para buscar comentário
  const fetchComment = useCallback(async (itemId: string, month: number, year: number) => {
    try {
      const response = await fetch(
        `/api/cashflow/comments?itemId=${itemId}&month=${month}&year=${year}`,
        {
          credentials: 'include',
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro ao buscar comentário' }));
        
        if (response.status === 401) {
          throw new Error('Sessão inválida');
        }
        
        throw new Error(errorData.error || 'Erro ao buscar comentário');
      }
      const data = await response.json();
      return {
        comment: data.comment || null,
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : null,
      };
    } catch (error: any) {
      console.error('Erro ao buscar comentário:', error);
      // Re-throw para que o handler possa mostrar o alert apropriado
      throw error;
    }
  }, []);

  // Handler para clicar no botão de comentário
  const handleCommentButtonClick = useCallback(() => {
    setIsCommentModeActive((prev) => !prev);
    // Desativar modo de cor quando ativar modo de comentário
    if (!isCommentModeActive) {
      setSelectedColor(null);
    }
  }, [isCommentModeActive, setIsCommentModeActive, setSelectedColor]);

  // Handler para clicar em uma célula quando em modo de comentário
  const handleCommentCellClick = useCallback(async (itemId: string, monthIndex: number) => {
    if (!isCommentModeActive) return;

    try {
      // Encontrar o item para obter o nome
      const item = findItemById(processedData.groups, itemId);
      if (!item) {
        console.warn(`Item não encontrado: ${itemId}`);
        showAlert("error", "Item não encontrado", "Não foi possível encontrar o item selecionado.");
        return;
      }

      const currentYear = new Date().getFullYear();
      
      // Buscar comentário existente
      const { comment, updatedAt } = await fetchComment(itemId, monthIndex, currentYear);

      // Abrir modal
      setCommentModal({
        isOpen: true,
        itemId,
        itemName: item.name,
        month: monthIndex,
        year: currentYear,
        initialComment: comment,
        updatedAt,
      });

      // Desativar modo de comentário após abrir modal
      setIsCommentModeActive(false);
    } catch (error: any) {
      console.error('Erro ao buscar comentário:', error);
      if (error.message && error.message.includes('Sessão inválida')) {
        showAlert(
          "error", 
          "Sessão inválida", 
          "Sua sessão expirou ou está inválida. Por favor, faça logout e login novamente."
        );
      } else {
        showAlert("error", "Erro", "Erro ao abrir comentário. Tente novamente.");
      }
      setIsCommentModeActive(false);
    }
  }, [isCommentModeActive, processedData.groups, fetchComment, setIsCommentModeActive, showAlert]);

  // Handler para salvar comentário
  const handleSaveComment = useCallback(async (comment: string) => {
    if (!commentModal.itemId) return;

    try {
      const response = await fetch('/api/cashflow/comments', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          itemId: commentModal.itemId,
          month: commentModal.month,
          year: commentModal.year,
          comment: comment.trim() || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro ao salvar comentário' }));
        
        if (response.status === 401) {
          showAlert(
            "error", 
            "Sessão inválida", 
            errorData.error || "Sua sessão expirou ou está inválida. Por favor, faça logout e login novamente."
          );
          throw new Error('Sessão inválida');
        }
        
        throw new Error(errorData.error || 'Erro ao salvar comentário');
      }

      // Recarregar dados para atualizar comentários
      await refetch();
      
      showAlert("success", "Comentário salvo", "O comentário foi salvo com sucesso.");
    } catch (error: any) {
      console.error('Erro ao salvar comentário:', error);
      
      if (error.message === 'Sessão inválida') {
        // Já mostrou o alert acima
        throw error;
      }
      
      showAlert("error", "Erro ao salvar", error.message || "Erro ao salvar o comentário. Tente novamente.");
      throw error;
    }
  }, [commentModal, refetch, showAlert]);

  const handleSaveRow = useCallback(async (groupId: string) => {
    const row = newRow[groupId];
    if (!row) return;

    const error = validateNewRow(row);
    if (error) {
      showAlert("error", "Erro ao adicionar", error);
      return;
    }

    try {
      const newItem = await createCashflowItem(groupId, row.name, row.significado);
      setNewItems(prev => ({ ...prev, [newItem.id]: newItem as unknown as CashflowItem }));
      cancelAddingRow(groupId);
      showAlert("success", "Linha adicionada", "A linha foi adicionada com sucesso.");
    } catch {
      showAlert("error", "Erro ao adicionar", "Erro ao criar a nova linha.");
    }
  }, [newRow, cancelAddingRow, showAlert]);

  const handleItemUpdate = useCallback(async () => {
    try {
      // Refresh the data to reflect the changes
      await refetch();
    } catch (error) {
      console.error('Erro ao atualizar item:', error);
      showAlert("error", "Erro ao atualizar", "Erro ao atualizar o item.");
    }
  }, [refetch, showAlert]);

  // Handler para iniciar edição de grupo
  const handleStartGroupEdit = useCallback((group: CashflowGroup) => {
    const allItems = getAllItemsInGroup(group);
    startGroupEditing(group.id, allItems);
  }, [startGroupEditing]);

  // Handler para salvar alterações do grupo
  const handleSaveGroup = useCallback(async (group: CashflowGroup) => {
    setSavingGroups((prev) => new Set(prev).add(group.id));
    
    try {
      const allItems = getAllItemsInGroup(group);
      const changes = getChangesForGroup(group.id, allItems);
      
      // Se não há mudanças, apenas sair do modo de edição
      if (changes.updates.length === 0 && changes.deletes.length === 0) {
        stopGroupEditing(group.id, allItems);
        setSavingGroups((prev) => {
          const newSet = new Set(prev);
          newSet.delete(group.id);
          return newSet;
        });
        return;
      }

      // Enviar alterações para API
      const response = await fetch('/api/cashflow/batch-update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          groupId: group.id,
          updates: changes.updates,
          deletes: changes.deletes,
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao salvar alterações');
      }

      // Recarregar dados
      await refetch();
      
      // Sair do modo de edição
      stopGroupEditing(group.id, allItems);
      
      showAlert("success", "Alterações salvas", "As alterações foram salvas com sucesso.");
    } catch (error) {
      console.error('Erro ao salvar alterações:', error);
      showAlert("error", "Erro ao salvar", "Erro ao salvar as alterações. Tente novamente.");
    } finally {
      setSavingGroups((prev) => {
        const newSet = new Set(prev);
        newSet.delete(group.id);
        return newSet;
      });
    }
  }, [getChangesForGroup, stopGroupEditing, refetch, showAlert]);

  // Handler para cancelar edição do grupo
  const handleCancelGroupEdit = useCallback((group: CashflowGroup) => {
    const allItems = getAllItemsInGroup(group);
    cancelEditing(group.id, allItems);
    showAlert("success", "Edição cancelada", "As alterações foram descartadas.");
  }, [cancelEditing, showAlert]);

  // Helper para renderizar ItemRow condicionalmente
  const renderItemRowConditional = useCallback((
    item: CashflowItem,
    group: CashflowGroup,
    itemTotals: number[],
    itemAnnualTotal: number,
    itemPercentage: number,
    isLastItem: boolean = false
  ) => {
    const groupId = group.id;
    if (isGroupEditing(groupId)) {
      // Modo de edição controlada
      if (isItemDeleted(item.id)) {
        return null; // Não renderizar itens deletados
      }
      return (
        <EditableItemRow
          key={item.id}
          item={item}
          editedData={getEditedItem(item.id)}
          group={group}
          itemTotals={itemTotals}
          itemAnnualTotal={itemAnnualTotal}
          itemPercentage={itemPercentage}
          isEditing={true}
          onUpdateField={updateItemField}
          onDeleteItem={deleteItem}
          onApplyColor={applyColorToCell}
          isColorModeActive={selectedColor !== null}
          isCommentModeActive={isCommentModeActive}
          onCommentCellClick={handleCommentCellClick}
          currentYear={new Date().getFullYear()}
          isLastItem={isLastItem}
        />
      );
    } else {
      // Modo normal (read-only)
      return (
        <ItemRow
          key={item.id}
          item={item}
          itemTotals={itemTotals}
          itemAnnualTotal={itemAnnualTotal}
          itemPercentage={itemPercentage}
          group={group}
          onItemUpdate={handleItemUpdate}
          startEditing={startEditing}
          stopEditing={stopEditing}
          isEditing={isEditing}
          currentYear={new Date().getFullYear()}
          isLastItem={isLastItem}
        />
      );
    }
  }, [isGroupEditing, isItemDeleted, getEditedItem, updateItemField, deleteItem, handleItemUpdate, startEditing, stopEditing, isEditing, selectedColor]);

  if (loading) return <div className="py-8 text-center">Carregando...</div>;
  if (error) return <div className="py-8 text-center text-red-500">{error}</div>;
  if (!data?.length) return <div className="py-8 text-center text-red-500">Dados inválidos</div>;

  // Função auxiliar para determinar espaçamento antes do grupo
  const needsSpacingBefore = (groupName: string) => {
    const groupsWithSpacingBefore = [
      'Sem Tributação',
      'Despesas',
      'Despesas Fixas',
      'Habitação',
      'Transporte',
      'Saúde',
      'Educação',
      'Animais de Estimação',
      'Despesas Pessoais',
      'Lazer',
      'Impostos',
      'Despesas Empresa',
      'Planejamento Financeiro',
      'Despesas Variáveis',
    ];
    return groupsWithSpacingBefore.includes(groupName);
  };
  
  // Função auxiliar para determinar espaçamento depois do grupo
  const needsSpacingAfter = (groupName: string) => {
    const groupsWithSpacingAfter = [
      'Entradas Fixas',
      'Entradas Variáveis',
      'Sem Tributação',
      'Com Tributação',
      'Despesas',
      'Despesas Fixas',
    ];
    return groupsWithSpacingAfter.includes(groupName);
  };

  return (
    <div className="bg-white dark:bg-white/[0.03] flex-1 flex flex-col min-h-0">
      {alert && (
        <div className="mb-4 flex-shrink-0">
          <Alert variant={alert.type} title={alert.title} message={alert.message} />
        </div>
      )}
      
      <div 
        ref={scrollContainerRef}
        className="w-full h-full overflow-x-auto overflow-y-auto custom-scrollbar cashflow-table"
        style={{ 
          scrollBehavior: 'auto',
          position: 'relative'
        }}
      >
        <Table className="relative table-fixed" style={{ minWidth: 'max-content', borderCollapse: 'separate', borderSpacing: 0 }}>
          <TableHeaderComponent 
            showActionsColumn={processedData.groups.some(g => isGroupEditing(g.id))} 
          />
          <TableBody>
            {processedData.groups
              .filter((group) => group.name !== 'Investimentos')
              .map((group, groupIndex, groups) => {
                // Verificar se este é o primeiro grupo de despesas
                const isFirstDespesaGroup = !isReceitaGroupByType(group.type) && 
                  groups.slice(0, groupIndex).every(g => isReceitaGroupByType(g.type));
                
                // Verificar se é um grupo principal (sem parentId)
                const isMainGroup = !group.parentId;
                // Verificar se é o grupo principal "Despesas"
                const isMainDespesasGroup = group.name === 'Despesas' && !group.parentId;
                
                return (
                <React.Fragment key={group.id}>
                  {/* Espaçamento de 10px acima do grupo principal "Entradas" */}
                  {group.name === 'Entradas' && !group.parentId && (
                    <TableRow>
                      <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
                    </TableRow>
                  )}
                  {/* Renderizar "Saldo do mês anterior" antes do primeiro grupo de despesas */}
                  {isFirstDespesaGroup && (
                    <>
                      <PreviousMonthBalanceRow
                        valuesByMonth={previousMonthBalance}
                        totalAnnual={previousMonthBalance.reduce((sum, val) => sum + val, 0)}
                        showActionsColumn={processedData.groups.some(g => isGroupEditing(g.id))}
                      />
                    </>
                  )}
                  {/* Espaçamento antes de grupos principais com margem em cima */}
                  {isMainGroup && needsSpacingBefore(group.name) && group.name !== 'Entradas' && (
                    <TableRow>
                      <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
                    </TableRow>
                  )}
                  <GroupHeader
                  group={group}
                  isCollapsed={collapsed[group.id] || false}
                  groupTotals={processedData.groupTotals[group.id] || Array(12).fill(0)}
                  groupAnnualTotal={processedData.groupAnnualTotals[group.id] || 0}
                  groupPercentage={processedData.groupPercentages[group.id] || 0}
                  onToggleCollapse={() => toggleCollapse(group.id)}
                  onAddRow={() => startAddingRow(group.id)}
                  isEditing={isGroupEditing(group.id)}
                  onStartEdit={() => handleStartGroupEdit(group)}
                  onSave={() => handleSaveGroup(group)}
                  onCancel={() => handleCancelGroupEdit(group)}
                  saving={savingGroups.has(group.id)}
                  showActionsColumn={isGroupEditing(group.id)}
                  selectedColor={isGroupEditing(group.id) ? selectedColor : null}
                  onColorSelect={isGroupEditing(group.id) ? setSelectedColor : undefined}
                  isCommentModeActive={isGroupEditing(group.id) ? isCommentModeActive : false}
                  onCommentClick={isGroupEditing(group.id) ? handleCommentButtonClick : undefined}
                />
                {/* Renderizar Inflação Pedro depois do grupo principal "Despesas" */}
                {isMainDespesasGroup && (
                  <>
                    {/* Espaçamento após Despesas e antes de Inflação Pedro */}
                    <TableRow>
                      <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
                    </TableRow>
                    <InflationPedroRow
                      despesasByMonth={processedData.despesasByMonth}
                      despesasAnnual={processedData.despesasTotal}
                      showActionsColumn={processedData.groups.some(g => isGroupEditing(g.id))}
                    />
                  </>
                )}
                {/* Espaçamento de 10px abaixo do header do grupo principal "Entradas" */}
                {group.name === 'Entradas' && !group.parentId && (
                  <TableRow>
                    <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
                  </TableRow>
                )}
                
                {!collapsed[group.id] && (
                  <>
                    {/* Renderizar subgrupos */}
                    {group.children?.map((subgroup, subgroupIndex, subgroups) => {
                      // Aplicar espaçamento antes: sempre aplicar se o subgrupo precisa
                      // Exceções:
                      // - "Despesas Fixas" sempre precisa de espaçamento antes
                      // - Não aplicar se for o primeiro e o pai também precisa
                      // - "Despesas Variáveis" não precisa se o subgrupo anterior já tem espaçamento depois (evita duplicação)
                      const previousSubgroup = subgroupIndex > 0 ? subgroups[subgroupIndex - 1] : null;
                      const shouldSpaceBefore = needsSpacingBefore(subgroup.name) && 
                        (subgroup.name === 'Despesas Fixas' || 
                         (subgroup.name === 'Despesas Variáveis' ? !(previousSubgroup && needsSpacingAfter(previousSubgroup.name)) : true) &&
                         !(subgroupIndex === 0 && needsSpacingBefore(group.name)));
                      
                      return (
                        <React.Fragment key={subgroup.id}>
                          {/* Espaçamento antes de subgrupos com margem em cima */}
                          {shouldSpaceBefore && (
                            <TableRow>
                              <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
                            </TableRow>
                          )}
                          <GroupHeader
                            group={subgroup}
                            isCollapsed={collapsed[subgroup.id] || false}
                            groupTotals={processedData.groupTotals[subgroup.id] || Array(12).fill(0)}
                            groupAnnualTotal={processedData.groupAnnualTotals[subgroup.id] || 0}
                            groupPercentage={processedData.groupPercentages[subgroup.id] || 0}
                            onToggleCollapse={() => toggleCollapse(subgroup.id)}
                            onAddRow={() => startAddingRow(subgroup.id)}
                            isEditing={isGroupEditing(subgroup.id)}
                            onStartEdit={() => handleStartGroupEdit(subgroup)}
                            onSave={() => handleSaveGroup(subgroup)}
                            onCancel={() => handleCancelGroupEdit(subgroup)}
                            saving={savingGroups.has(subgroup.id)}
                            showActionsColumn={isGroupEditing(subgroup.id)}
                            selectedColor={isGroupEditing(subgroup.id) ? selectedColor : null}
                            onColorSelect={isGroupEditing(subgroup.id) ? setSelectedColor : undefined}
                            isCommentModeActive={isGroupEditing(subgroup.id) ? isCommentModeActive : false}
                            onCommentClick={isGroupEditing(subgroup.id) ? handleCommentButtonClick : undefined}
                          />
                          
                          {!collapsed[subgroup.id] && (
                            <>
                              {/* Renderizar sub-subgrupos */}
                              {subgroup.children?.map((subsubgroup, subsubgroupIndex, subsubgroups) => {
                                // Aplicar espaçamento antes: sempre aplicar se o sub-subgrupo precisa
                                // Exceção: não aplicar se for o primeiro e o pai também precisa, EXCETO para "Habitação" que sempre precisa
                                const shouldSpaceSubSubBefore = needsSpacingBefore(subsubgroup.name) && 
                                  (subsubgroup.name === 'Habitação' || !(subsubgroupIndex === 0 && needsSpacingBefore(subgroup.name)));
                                
                                return (
                                <React.Fragment key={subsubgroup.id}>
                                  {/* Espaçamento antes de sub-subgrupos com margem em cima */}
                                  {shouldSpaceSubSubBefore && (
                                    <TableRow>
                                      <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
                                    </TableRow>
                                  )}
                                  <GroupHeader
                                    group={subsubgroup}
                                    isCollapsed={collapsed[subsubgroup.id] || false}
                                    groupTotals={processedData.groupTotals[subsubgroup.id] || Array(12).fill(0)}
                                    groupAnnualTotal={processedData.groupAnnualTotals[subsubgroup.id] || 0}
                                    groupPercentage={processedData.groupPercentages[subsubgroup.id] || 0}
                                    onToggleCollapse={() => toggleCollapse(subsubgroup.id)}
                                    onAddRow={() => startAddingRow(subsubgroup.id)}
                                    isEditing={isGroupEditing(subsubgroup.id)}
                                    onStartEdit={() => handleStartGroupEdit(subsubgroup)}
                                    onSave={() => handleSaveGroup(subsubgroup)}
                                    onCancel={() => handleCancelGroupEdit(subsubgroup)}
                                    saving={savingGroups.has(subsubgroup.id)}
                                    showActionsColumn={isGroupEditing(subsubgroup.id)}
                                    selectedColor={isGroupEditing(subsubgroup.id) ? selectedColor : null}
                                    onColorSelect={isGroupEditing(subsubgroup.id) ? setSelectedColor : undefined}
                                    isCommentModeActive={isGroupEditing(subsubgroup.id) ? isCommentModeActive : false}
                                    onCommentClick={isGroupEditing(subsubgroup.id) ? handleCommentButtonClick : undefined}
                                  />
                                  
                                  {!collapsed[subsubgroup.id] && subsubgroup.items?.map((item, itemIndex, items) => {
                                    const hasNewItems = Object.entries(newItems).some(([, newItem]) => newItem.groupId === subsubgroup.id);
                                    const isLastItem = !hasNewItems && !addingRow[subsubgroup.id] && itemIndex === items.length - 1;
                                    return renderItemRowConditional(
                                      item,
                                      subsubgroup,
                                      processedData.itemTotals[item.id] || Array(12).fill(0),
                                      processedData.itemAnnualTotals[item.id] || 0,
                                      processedData.itemPercentages[item.id] || 0,
                                      isLastItem
                                    );
                                  })}
                                  
                                  {/* Renderizar novos itens criados */}
                                  {Object.entries(newItems)
                                    .filter(([, item]) => item.groupId === subsubgroup.id)
                                    .map(([itemId, item], itemIndex, entries) => {
                                      const isLastNewItem = !addingRow[subsubgroup.id] && itemIndex === entries.length - 1;
                                      return (
                                        <NewItemRow
                                          key={itemId}
                                          item={item}
                                          group={subsubgroup}
                                          onItemUpdate={handleItemUpdate}
                                          startEditing={startEditing}
                                          stopEditing={stopEditing}
                                          isEditing={isEditing}
                                          isLastItem={isLastNewItem}
                                        />
                                      );
                                    })}
                                  
                                  {!collapsed[subsubgroup.id] && addingRow[subsubgroup.id] && (
                                    <AddRowForm
                                      newRow={newRow[subsubgroup.id] || { name: "", significado: "" }}
                                      onUpdateField={(field, value) => updateNewRow(subsubgroup.id, field, value)}
                                      onSave={() => handleSaveRow(subsubgroup.id)}
                                      onCancel={() => cancelAddingRow(subsubgroup.id)}
                                    />
                                  )}
                                  {/* Espaçamento depois de sub-subgrupos com margem embaixo (após todos os itens) */}
                                  {needsSpacingAfter(subsubgroup.name) && (
                                    <TableRow>
                                      <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
                                    </TableRow>
                                  )}
                                </React.Fragment>
                                );
                              })}
                              
                              {/* Renderizar itens do subgrupo */}
                              {subgroup.items?.map((item, itemIndex, items) => {
                                const hasNewItems = Object.entries(newItems).some(([, newItem]) => newItem.groupId === subgroup.id);
                                const isLastItem = !hasNewItems && !addingRow[subgroup.id] && itemIndex === items.length - 1;
                                return renderItemRowConditional(
                                  item,
                                  subgroup,
                                  processedData.itemTotals[item.id] || Array(12).fill(0),
                                  processedData.itemAnnualTotals[item.id] || 0,
                                  processedData.itemPercentages[item.id] || 0,
                                  isLastItem
                                );
                              })}
                              
                              {/* Renderizar novos itens criados */}
                              {Object.entries(newItems)
                                .filter(([, item]) => item.groupId === subgroup.id)
                                .map(([itemId, item], itemIndex, entries) => {
                                  const isLastNewItem = !addingRow[subgroup.id] && itemIndex === entries.length - 1;
                                  return (
                                    <NewItemRow
                                      key={itemId}
                                      item={item}
                                      group={subgroup}
                                      onItemUpdate={handleItemUpdate}
                                      startEditing={startEditing}
                                      stopEditing={stopEditing}
                                      isEditing={isEditing}
                                      isLastItem={isLastNewItem}
                                    />
                                  );
                                })}
                              
                              {addingRow[subgroup.id] && (
                                <AddRowForm
                                  newRow={newRow[subgroup.id] || { name: "", significado: "" }}
                                  onUpdateField={(field, value) => updateNewRow(subgroup.id, field, value)}
                                  onSave={() => handleSaveRow(subgroup.id)}
                                  onCancel={() => cancelAddingRow(subgroup.id)}
                                />
                              )}
                            </>
                          )}
                          {/* Espaçamento depois de subgrupos com margem embaixo (após todos os itens) */}
                          {needsSpacingAfter(subgroup.name) && (
                            <TableRow>
                              <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                    
                    {/* Renderizar itens do grupo principal */}
                    {group.items?.map((item, itemIndex, items) => {
                      const hasNewItems = Object.entries(newItems).some(([, newItem]) => newItem.groupId === group.id);
                      const isLastItem = !hasNewItems && !addingRow[group.id] && itemIndex === items.length - 1;
                      return renderItemRowConditional(
                        item,
                        group,
                        processedData.itemTotals[item.id] || Array(12).fill(0),
                        processedData.itemAnnualTotals[item.id] || 0,
                        processedData.itemPercentages[item.id] || 0,
                        isLastItem
                      );
                    })}
                    
                    {/* Renderizar novos itens criados */}
                    {Object.entries(newItems)
                      .filter(([, item]) => item.groupId === group.id)
                      .map(([itemId, item], itemIndex, entries) => {
                        const isLastNewItem = !addingRow[group.id] && itemIndex === entries.length - 1;
                        return (
                          <NewItemRow
                            key={itemId}
                            item={item}
                            group={group}
                            onItemUpdate={handleItemUpdate}
                            startEditing={startEditing}
                            stopEditing={stopEditing}
                            isEditing={isEditing}
                            isLastItem={isLastNewItem}
                          />
                        );
                      })}
                    
                    {addingRow[group.id] && (
                      <AddRowForm
                        newRow={newRow[group.id] || { name: "", significado: "" }}
                        onUpdateField={(field, value) => updateNewRow(group.id, field, value)}
                        onSave={() => handleSaveRow(group.id)}
                        onCancel={() => cancelAddingRow(group.id)}
                      />
                    )}
                  </>
                )}
                {/* Espaçamento depois de grupos principais com margem embaixo (após todos os itens e subgrupos) */}
                {/* Não aplicar espaçamento depois de "Entradas Variáveis" se o próximo grupo é "Despesas" (que terá Inflação Pedro antes) */}
                {isMainGroup && needsSpacingAfter(group.name) && group.name !== 'Entradas' && 
                  !(group.name === 'Entradas Variáveis' && groupIndex < groups.length - 1 && 
                    !isReceitaGroupByType(groups[groupIndex + 1].type)) && (
                  <TableRow>
                    <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
                  </TableRow>
                )}
                </React.Fragment>
              );
            })}
            
            {/* Renderizar Saldo antes de Investimentos */}
            <TotalRow
              totalByMonth={processedData.totalByMonth}
              totalAnnual={processedData.totalAnnual}
              showActionsColumn={processedData.groups.some(g => isGroupEditing(g.id))}
            />
            
            {/* Espaçamento depois do Saldo */}
            <TableRow>
              <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
            </TableRow>
            
            {/* Renderizar Índice de Poupança após o Saldo */}
            <SavingsIndexRow
              totalByMonth={processedData.totalByMonth}
              entradasByMonth={processedData.entradasByMonth}
              totalAnnual={processedData.totalAnnual}
              entradasAnnual={processedData.entradasTotal}
              showActionsColumn={processedData.groups.some(g => isGroupEditing(g.id))}
            />
            
            {/* Espaçamento entre Índice de Poupança e Índice Paz Financeira */}
            <TableRow>
              <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
            </TableRow>
            
            {/* Renderizar Índice Paz Financeira após o Índice de Poupança */}
            <FinancialPeaceIndexRow
              proventosByMonth={proventosByMonth}
              despesasFixasByMonth={despesasFixasData.byMonth}
              proventosAnnual={proventosAnnual}
              despesasFixasAnnual={despesasFixasData.annual}
              showActionsColumn={processedData.groups.some(g => isGroupEditing(g.id))}
            />
            
            {/* Espaçamento entre Índice Paz Financeira e Investimentos */}
            <TableRow>
              <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
            </TableRow>
            
            {/* Renderizar grupo de Investimentos após o Saldo */}
            {processedData.groups
              .filter((group) => group.name === 'Investimentos')
              .map((group) => (
              <React.Fragment key={group.id}>
                <GroupHeader
                  group={group}
                  isCollapsed={collapsed[group.id] || false}
                  groupTotals={processedData.groupTotals[group.id] || Array(12).fill(0)}
                  groupAnnualTotal={processedData.groupAnnualTotals[group.id] || 0}
                  groupPercentage={processedData.groupPercentages[group.id] || 0}
                  onToggleCollapse={() => toggleCollapse(group.id)}
                  onAddRow={() => startAddingRow(group.id)}
                />
                
                {!collapsed[group.id] && (
                  <>
                    {/* Renderizar subgrupos */}
                    {group.children?.map((subgroup) => (
                      <React.Fragment key={subgroup.id}>
                        <GroupHeader
                          group={subgroup}
                          isCollapsed={collapsed[subgroup.id] || false}
                          groupTotals={processedData.groupTotals[subgroup.id] || Array(12).fill(0)}
                          groupAnnualTotal={processedData.groupAnnualTotals[subgroup.id] || 0}
                          groupPercentage={processedData.groupPercentages[subgroup.id] || 0}
                          onToggleCollapse={() => toggleCollapse(subgroup.id)}
                          onAddRow={() => startAddingRow(subgroup.id)}
                          isEditing={isGroupEditing(subgroup.id)}
                          onStartEdit={() => handleStartGroupEdit(subgroup)}
                          onSave={() => handleSaveGroup(subgroup)}
                          onCancel={() => handleCancelGroupEdit(subgroup)}
                          saving={savingGroups.has(subgroup.id)}
                          showActionsColumn={isGroupEditing(subgroup.id)}
                          selectedColor={isGroupEditing(subgroup.id) ? selectedColor : null}
                          onColorSelect={isGroupEditing(subgroup.id) ? setSelectedColor : undefined}
                          isCommentModeActive={isGroupEditing(subgroup.id) ? isCommentModeActive : false}
                          onCommentClick={isGroupEditing(subgroup.id) ? handleCommentButtonClick : undefined}
                        />
                        
                        {!collapsed[subgroup.id] && (
                          <>
                            {/* Renderizar sub-subgrupos */}
                            {subgroup.children?.map((subsubgroup, subsubgroupIndex, subsubgroups) => {
                              // Aplicar espaçamento antes: sempre aplicar se o sub-subgrupo precisa
                              // Exceção: não aplicar se for o primeiro e o pai também precisa, EXCETO para "Habitação" que sempre precisa
                              const shouldSpaceSubSubBefore = needsSpacingBefore(subsubgroup.name) && 
                                (subsubgroup.name === 'Habitação' || !(subsubgroupIndex === 0 && needsSpacingBefore(subgroup.name)));
                              
                              return (
                              <React.Fragment key={subsubgroup.id}>
                                {/* Espaçamento antes de sub-subgrupos com margem em cima */}
                                {shouldSpaceSubSubBefore && (
                                  <TableRow>
                                    <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
                                  </TableRow>
                                )}
                                <GroupHeader
                                  group={subsubgroup}
                                  isCollapsed={collapsed[subsubgroup.id] || false}
                                  groupTotals={processedData.groupTotals[subsubgroup.id] || Array(12).fill(0)}
                                  groupAnnualTotal={processedData.groupAnnualTotals[subsubgroup.id] || 0}
                                  groupPercentage={processedData.groupPercentages[subsubgroup.id] || 0}
                                  onToggleCollapse={() => toggleCollapse(subsubgroup.id)}
                                  onAddRow={() => startAddingRow(subsubgroup.id)}
                                  isEditing={isGroupEditing(subsubgroup.id)}
                                  onStartEdit={() => handleStartGroupEdit(subsubgroup)}
                                  onSave={() => handleSaveGroup(subsubgroup)}
                                  onCancel={() => handleCancelGroupEdit(subsubgroup)}
                                  saving={savingGroups.has(subsubgroup.id)}
                                  showActionsColumn={isGroupEditing(subsubgroup.id)}
                                  selectedColor={isGroupEditing(subsubgroup.id) ? selectedColor : null}
                                  onColorSelect={isGroupEditing(subsubgroup.id) ? setSelectedColor : undefined}
                                  isCommentModeActive={isGroupEditing(subsubgroup.id) ? isCommentModeActive : false}
                                  onCommentClick={isGroupEditing(subsubgroup.id) ? handleCommentButtonClick : undefined}
                                />
                                
                                {!collapsed[subsubgroup.id] && subsubgroup.items?.map((item, itemIndex, items) => {
                                  const hasNewItems = Object.entries(newItems).some(([, newItem]) => newItem.groupId === subsubgroup.id);
                                  const isLastItem = !hasNewItems && !addingRow[subsubgroup.id] && itemIndex === items.length - 1;
                                  return renderItemRowConditional(
                                    item,
                                    subsubgroup,
                                    processedData.itemTotals[item.id] || Array(12).fill(0),
                                    processedData.itemAnnualTotals[item.id] || 0,
                                    processedData.itemPercentages[item.id] || 0,
                                    isLastItem
                                  );
                                })}
                                
                                {/* Renderizar novos itens criados */}
                                {Object.entries(newItems)
                                  .filter(([, item]) => item.groupId === subsubgroup.id)
                                  .map(([itemId, item], itemIndex, entries) => {
                                    const isLastNewItem = !addingRow[subsubgroup.id] && itemIndex === entries.length - 1;
                                    return (
                                      <NewItemRow
                                        key={itemId}
                                        item={item}
                                        group={subsubgroup}
                                        onItemUpdate={handleItemUpdate}
                                        startEditing={startEditing}
                                        stopEditing={stopEditing}
                                        isEditing={isEditing}
                                        isLastItem={isLastNewItem}
                                      />
                                    );
                                  })}
                                
                                {!collapsed[subsubgroup.id] && addingRow[subsubgroup.id] && (
                                  <AddRowForm
                                    newRow={newRow[subsubgroup.id] || { name: "", significado: "" }}
                                    onUpdateField={(field, value) => updateNewRow(subsubgroup.id, field, value)}
                                    onSave={() => handleSaveRow(subsubgroup.id)}
                                    onCancel={() => cancelAddingRow(subsubgroup.id)}
                                  />
                                )}
                                {/* Espaçamento depois de sub-subgrupos com margem embaixo (após todos os itens) */}
                                {needsSpacingAfter(subsubgroup.name) && (
                                  <TableRow>
                                    <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
                                  </TableRow>
                                )}
                              </React.Fragment>
                              );
                            })}
                            
                            {/* Renderizar itens do subgrupo */}
                            {subgroup.items?.map((item, itemIndex, items) => {
                              const hasNewItems = Object.entries(newItems).some(([, newItem]) => newItem.groupId === subgroup.id);
                              const isLastItem = !hasNewItems && !addingRow[subgroup.id] && itemIndex === items.length - 1;
                              return renderItemRowConditional(
                                item,
                                subgroup,
                                processedData.itemTotals[item.id] || Array(12).fill(0),
                                processedData.itemAnnualTotals[item.id] || 0,
                                processedData.itemPercentages[item.id] || 0,
                                isLastItem
                              );
                            })}
                            
                            {/* Renderizar novos itens criados */}
                            {Object.entries(newItems)
                              .filter(([, item]) => item.groupId === subgroup.id)
                              .map(([itemId, item], itemIndex, entries) => {
                                const isLastNewItem = !addingRow[subgroup.id] && itemIndex === entries.length - 1;
                                return (
                                  <NewItemRow
                                    key={itemId}
                                    item={item}
                                    group={subgroup}
                                    onItemUpdate={handleItemUpdate}
                                    startEditing={startEditing}
                                    stopEditing={stopEditing}
                                    isEditing={isEditing}
                                    isLastItem={isLastNewItem}
                                  />
                                );
                              })}
                            
                            {addingRow[subgroup.id] && (
                              <AddRowForm
                                newRow={newRow[subgroup.id] || { name: "", significado: "" }}
                                onUpdateField={(field, value) => updateNewRow(subgroup.id, field, value)}
                                onSave={() => handleSaveRow(subgroup.id)}
                                onCancel={() => cancelAddingRow(subgroup.id)}
                              />
                            )}
                          </>
                        )}
                        {/* Espaçamento depois de subgrupos com margem embaixo (após todos os itens) */}
                        {needsSpacingAfter(subgroup.name) && (
                          <TableRow>
                            <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                    
                    {/* Renderizar itens do grupo principal */}
                    {group.items?.map((item, itemIndex, items) => {
                      const hasNewItems = Object.entries(newItems).some(([, newItem]) => newItem.groupId === group.id);
                      const isLastItem = !hasNewItems && !addingRow[group.id] && itemIndex === items.length - 1;
                      return renderItemRowConditional(
                        item,
                        group,
                        processedData.itemTotals[item.id] || Array(12).fill(0),
                        processedData.itemAnnualTotals[item.id] || 0,
                        processedData.itemPercentages[item.id] || 0,
                        isLastItem
                      );
                    })}
                    
                    {/* Renderizar novos itens criados */}
                    {Object.entries(newItems)
                      .filter(([, item]) => item.groupId === group.id)
                      .map(([itemId, item], itemIndex, entries) => {
                        const isLastNewItem = !addingRow[group.id] && itemIndex === entries.length - 1;
                        return (
                          <NewItemRow
                            key={itemId}
                            item={item}
                            group={group}
                            onItemUpdate={handleItemUpdate}
                            startEditing={startEditing}
                            stopEditing={stopEditing}
                            isEditing={isEditing}
                            isLastItem={isLastNewItem}
                          />
                        );
                      })}
                    
                    {addingRow[group.id] && (
                      <AddRowForm
                        newRow={newRow[group.id] || { name: "", significado: "" }}
                        onUpdateField={(field, value) => updateNewRow(group.id, field, value)}
                        onSave={() => handleSaveRow(group.id)}
                        onCancel={() => cancelAddingRow(group.id)}
                      />
                    )}
                  </>
                )}
              </React.Fragment>
            ))}
            
            {/* Espaçamento entre Investimentos e Fluxo de Caixa livre */}
            <TableRow>
              <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
            </TableRow>
            
            {/* Linha Fluxo de Caixa livre */}
            {(() => {
              // Encontrar o grupo "Investimentos" para obter valores de aportes/resgates
              const findInvestimentosGroup = (groups: CashflowGroup[]): CashflowGroup | null => {
                for (const group of groups) {
                  if (group.name === 'Investimentos' || group.type === 'investimento') {
                    return group;
                  }
                  if (group.children) {
                    const found = findInvestimentosGroup(group.children);
                    if (found) return found;
                  }
                }
                return null;
              };
              
              const investimentosGroup = findInvestimentosGroup(processedData.groups);
              const investimentosByMonth = investimentosGroup 
                ? (processedData.groupTotals[investimentosGroup.id] || Array(12).fill(0))
                : Array(12).fill(0);
              
              // Calcular Fluxo de Caixa Livre usando a fórmula:
              // Fluxo de Caixa Livre = (Saldo do mês atual) - (Aportes/Resgates) + (Saldo Não Investido no Mês Anterior)
              const fluxoCaixaLivreAcumulado: number[] = [];
              for (let index = 0; index < 12; index++) {
                // Saldo do mês atual = Entradas - Despesas
                const saldoMesAtual = processedData.entradasByMonth[index] - processedData.despesasByMonth[index];
                // Aportes/Resgates do mês atual
                const aportesResgates = investimentosByMonth[index] || 0;
                // Saldo Não Investido no Mês Anterior = Fluxo de caixa livre do mês anterior
                const saldoNaoInvestidoMesAnterior = index === 0 ? 0 : (fluxoCaixaLivreAcumulado[index - 1] || 0);
                
                // Fórmula: (Saldo do mês atual) - (Aportes/Resgates) + (Saldo Não Investido no Mês Anterior)
                const fluxoCaixaLivre = saldoMesAtual - aportesResgates + saldoNaoInvestidoMesAnterior;
                fluxoCaixaLivreAcumulado.push(fluxoCaixaLivre);
              }
              
              const totalAnual = fluxoCaixaLivreAcumulado[11] || 0;
              
              return (
                <TableRow className="h-6" style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px', backgroundColor: '#998256' }}>
                  <TableCell 
                    className="px-2 font-bold text-white text-xs text-left h-6 leading-6 whitespace-nowrap border-t border-b border-l border-gray-200 border-r-0"
                    style={{ 
                      position: 'sticky',
                      backgroundColor: '#998256',
                      ...FIXED_COLUMN_BODY_STYLES[0],
                      overflow: 'hidden',
                      flexShrink: 0,
                      borderRight: 'none'
                    }}
                  >
                    Fluxo de Caixa livre
                  </TableCell>
                  <TableCell 
                    className="px-2 font-bold text-white text-xs h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0"
                    style={{ 
                      position: 'sticky',
                      backgroundColor: '#998256',
                      ...FIXED_COLUMN_BODY_STYLES[1],
                      overflow: 'hidden',
                      flexShrink: 0,
                      borderLeft: 'none',
                      borderRight: 'none'
                    }}
                  >
                    -
                  </TableCell>
                  <TableCell 
                    className="px-2 font-bold text-white text-xs text-center h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0"
                    style={{ 
                      position: 'sticky',
                      backgroundColor: '#998256',
                      ...FIXED_COLUMN_BODY_STYLES[2],
                      overflow: 'hidden',
                      flexShrink: 0,
                      borderLeft: 'none',
                      borderRight: 'none'
                    }}
                  >
                    -
                  </TableCell>
                  <TableCell 
                    className="px-2 font-bold text-white text-xs text-right h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r border-gray-300"
                    style={{ 
                      position: 'sticky',
                      backgroundColor: '#998256',
                      ...FIXED_COLUMN_BODY_STYLES[3],
                      overflow: 'hidden',
                      flexShrink: 0,
                      borderLeft: 'none'
                    }}
                  >
                    -
                  </TableCell>
                  {fluxoCaixaLivreAcumulado.map((valor, index) => (
                    <TableCell key={index} className={`px-1 font-bold text-white border-t border-b border-gray-200 border-r border-gray-200 text-xs text-right h-6 leading-6 ${
                      index === 0 ? 'border-l-0' : 'border-l border-gray-200'
                    }`} style={{ minWidth: '3rem' }}>
                      {formatCurrency(valor || 0)}
                    </TableCell>
                  ))}
                  {/* Coluna vazia para espaçamento */}
                  <TableCell className="px-0 w-[10px] h-6 leading-6 bg-white dark:bg-white"></TableCell>
                  <TableCell className="px-2 font-bold text-white border border-gray-200 text-xs text-right h-6 leading-6" style={{ minWidth: '4rem' }}>
                    {formatCurrency(totalAnual)}
                  </TableCell>
                  {processedData.groups.some(g => isGroupEditing(g.id)) && (
                    <TableCell className="px-2 border border-gray-200 w-8 h-6 leading-6"></TableCell>
                  )}
                </TableRow>
              );
            })()}
          </TableBody>
        </Table>
      </div>
      
      {/* Modal de Comentários */}
      <CommentModal
        isOpen={commentModal.isOpen}
        onClose={() => setCommentModal({ ...commentModal, isOpen: false })}
        onSave={handleSaveComment}
        initialComment={commentModal.initialComment}
        updatedAt={commentModal.updatedAt}
        itemName={commentModal.itemName}
        month={commentModal.month}
        year={commentModal.year}
      />
    </div>
  );
}
