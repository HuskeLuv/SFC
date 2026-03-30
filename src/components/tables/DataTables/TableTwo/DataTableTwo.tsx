'use client';
import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import React from 'react';
import Alert from '@/components/ui/alert/Alert';
import { Table, TableBody } from '@/components/ui/table';
import {
  useCashflowData,
  useCollapsibleState,
  useAlert,
  useProcessedData,
} from '@/hooks/useCashflow';
import { useProventos } from '@/hooks/useProventos';
import { useCsrf } from '@/hooks/useCsrf';
import { validateNewRow } from '@/utils/validation';
import {
  TableHeaderComponent,
  GroupHeader,
  ItemRow,
  TotalRow,
  SavingsIndexRow,
  FinancialPeaceIndexRow,
  InflationPedroRow,
  PreviousMonthBalanceRow,
  InvestmentIncomeRow,
  EvolutionRow,
} from '@/components/cashflow';
import { EditableItemRow } from '@/components/cashflow/EditableItemRow';
import { CashflowItem, CashflowGroup } from '@/types/cashflow';
import { createCashflowItem } from '@/utils/cashflowUpdate';
import { useCellEditing } from '@/hooks/useCellEditing';
import { useGroupEditMode } from '@/hooks/useGroupEditMode';
import { getAllItemsInGroup, findItemById } from '@/utils/cashflowHelpers';
import { isReceitaGroupByType } from '@/utils/formatters';
import { CommentModal } from '@/components/cashflow/CommentModal';
import {
  SubGroupRenderer,
  SpacingRow,
  needsSpacingBefore,
  needsSpacingAfter,
  renderGroupHeaderProps,
} from './DataTableTwoGroupRenderer';
import DataTableTwoGroupRenderer from './DataTableTwoGroupRenderer';
import DataTableTwoFreeCashflowRow from './DataTableTwoFreeCashflowRow';
import { GroupRenderContext } from './dataTableTwoTypes';

export default function DataTableTwo() {
  const { csrfFetch } = useCsrf();
  const { data, loading, error, refetch } = useCashflowData();
  const currentYear = new Date().getFullYear();
  const startDateISO = useMemo(() => new Date(currentYear, 0, 1).toISOString(), [currentYear]);
  const endDateISO = useMemo(
    () => new Date(currentYear, 11, 31, 23, 59, 59).toISOString(),
    [currentYear],
  );
  const { proventos } = useProventos(startDateISO, endDateISO);
  const {
    collapsed,
    addingRow,
    newRow,
    toggleCollapse,
    startAddingRow,
    cancelAddingRow,
    updateNewRow,
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
        annual: 0,
      };
    }
    const groupTotals = processedData.groupTotals[findDespesasFixasGroup.id] || Array(12).fill(0);
    const annualTotal = processedData.groupAnnualTotals[findDespesasFixasGroup.id] || 0;
    return {
      byMonth: groupTotals,
      annual: annualTotal,
    };
  }, [findDespesasFixasGroup, processedData.groupTotals, processedData.groupAnnualTotals]);

  // Proventos recebidos (apenas realizados no ano atual)
  const proventosByMonth = useMemo(() => {
    const totals = Array(12).fill(0);
    proventos.forEach((provento) => {
      if (provento.status !== 'realizado') {
        return;
      }
      const date = new Date(provento.data);
      if (Number.isNaN(date.getTime()) || date.getFullYear() !== currentYear) {
        return;
      }
      totals[date.getMonth()] += provento.valor;
    });
    return totals;
  }, [proventos, currentYear]);
  const proventosAnnual = useMemo(
    () => proventosByMonth.reduce((sum, value) => sum + value, 0),
    [proventosByMonth],
  );

  const entradasByMonthWithProventos = useMemo(
    () =>
      processedData.entradasByMonth.map((value, index) => value + (proventosByMonth[index] || 0)),
    [processedData.entradasByMonth, proventosByMonth],
  );
  const entradasAnnualWithProventos = useMemo(
    () => processedData.entradasTotal + proventosAnnual,
    [processedData.entradasTotal, proventosAnnual],
  );
  const totalByMonthWithProventos = useMemo(
    () => processedData.totalByMonth.map((value, index) => value + (proventosByMonth[index] || 0)),
    [processedData.totalByMonth, proventosByMonth],
  );
  const totalAnnualWithProventos = useMemo(
    () => totalByMonthWithProventos.reduce((sum, value) => sum + value, 0),
    [totalByMonthWithProventos],
  );

  const investimentosByMonth = useMemo(() => {
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
    return investimentosGroup
      ? processedData.groupTotals[investimentosGroup.id] || Array(12).fill(0)
      : Array(12).fill(0);
  }, [processedData.groups, processedData.groupTotals]);

  const evolucaoPatrimonioByMonth = useMemo(
    () =>
      totalByMonthWithProventos.map((value, index) => value + (investimentosByMonth[index] || 0)),
    [totalByMonthWithProventos, investimentosByMonth],
  );
  const evolucaoPatrimonioAnnual = useMemo(
    () => evolucaoPatrimonioByMonth.reduce((sum, value) => sum + value, 0),
    [evolucaoPatrimonioByMonth],
  );

  // Calcular Saldo Não Investido no Mês Anterior = Fluxo de caixa livre do mês anterior
  const previousMonthBalance = useMemo(() => {
    const saldo: number[] = [];
    const fluxoCaixaLivreAcumulado: number[] = [];
    for (let index = 0; index < 12; index++) {
      const saldoMesAtual =
        entradasByMonthWithProventos[index] - processedData.despesasByMonth[index];
      const aportesResgates = investimentosByMonth[index] || 0;
      const saldoNaoInvestidoMesAnterior =
        index === 0 ? 0 : fluxoCaixaLivreAcumulado[index - 1] || 0;
      const fluxoCaixaLivre = saldoMesAtual - aportesResgates + saldoNaoInvestidoMesAnterior;
      fluxoCaixaLivreAcumulado.push(fluxoCaixaLivre);
      saldo.push(saldoNaoInvestidoMesAnterior);
    }
    return saldo;
  }, [entradasByMonthWithProventos, processedData.despesasByMonth, investimentosByMonth]);

  // Garantir que o scroll inicial mostre janeiro (primeira coluna de mês)
  useEffect(() => {
    if (!scrollContainerRef.current || loading || !data?.length) return;

    const container = scrollContainerRef.current;

    const ensureJanuaryVisible = () => {
      if (!container) return;

      container.scrollLeft = 0;

      requestAnimationFrame(() => {
        if (!container) return;

        const firstMonthCell = container.querySelector('#first-month-cell') as HTMLElement;
        if (firstMonthCell) {
          const fixedColumnsWidth = 416;
          const containerWidth = container.clientWidth;

          if (containerWidth > 0 && containerWidth < fixedColumnsWidth + 48) {
            const scrollPosition = fixedColumnsWidth - containerWidth + 48;
            container.scrollLeft = Math.max(0, scrollPosition);
          } else {
            container.scrollLeft = 0;
          }
        } else {
          container.scrollLeft = 0;
        }
      });
    };

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
    itemName: '',
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
        },
      );
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Erro ao buscar comentário' }));

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
    } catch (error: unknown) {
      console.error('Erro ao buscar comentário:', error);
      throw error;
    }
  }, []);

  // Handler para clicar no botão de comentário
  const handleCommentButtonClick = useCallback(() => {
    setIsCommentModeActive((prev) => !prev);
    if (!isCommentModeActive) {
      setSelectedColor(null);
    }
  }, [isCommentModeActive, setIsCommentModeActive, setSelectedColor]);

  // Handler para clicar em uma célula quando em modo de comentário
  const handleCommentCellClick = useCallback(
    async (itemId: string, monthIndex: number) => {
      if (!isCommentModeActive) return;

      try {
        const item = findItemById(processedData.groups, itemId);
        if (!item) {
          console.warn(`Item não encontrado: ${itemId}`);
          showAlert(
            'error',
            'Item não encontrado',
            'Não foi possível encontrar o item selecionado.',
          );
          return;
        }

        const currentYear = new Date().getFullYear();
        const { comment, updatedAt } = await fetchComment(itemId, monthIndex, currentYear);

        setCommentModal({
          isOpen: true,
          itemId,
          itemName: item.name,
          month: monthIndex,
          year: currentYear,
          initialComment: comment,
          updatedAt,
        });

        setIsCommentModeActive(false);
      } catch (error: unknown) {
        console.error('Erro ao buscar comentário:', error);
        if (error instanceof Error && error.message.includes('Sessão inválida')) {
          showAlert(
            'error',
            'Sessão inválida',
            'Sua sessão expirou ou está inválida. Por favor, faça logout e login novamente.',
          );
        } else {
          showAlert('error', 'Erro', 'Erro ao abrir comentário. Tente novamente.');
        }
        setIsCommentModeActive(false);
      }
    },
    [isCommentModeActive, processedData.groups, fetchComment, setIsCommentModeActive, showAlert],
  );

  // Handler para salvar comentário
  const handleSaveComment = useCallback(
    async (comment: string) => {
      if (!commentModal.itemId) return;

      try {
        const response = await csrfFetch('/api/cashflow/comments', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            itemId: commentModal.itemId,
            month: commentModal.month,
            year: commentModal.year,
            comment: comment.trim() || null,
          }),
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: 'Erro ao salvar comentário' }));

          if (response.status === 401) {
            showAlert(
              'error',
              'Sessão inválida',
              errorData.error ||
                'Sua sessão expirou ou está inválida. Por favor, faça logout e login novamente.',
            );
            throw new Error('Sessão inválida');
          }

          throw new Error(errorData.error || 'Erro ao salvar comentário');
        }

        await refetch();
        showAlert('success', 'Comentário salvo', 'O comentário foi salvo com sucesso.');
      } catch (error: unknown) {
        console.error('Erro ao salvar comentário:', error);

        if (error instanceof Error && error.message === 'Sessão inválida') {
          throw error;
        }

        showAlert(
          'error',
          'Erro ao salvar',
          (error instanceof Error ? error.message : undefined) ||
            'Erro ao salvar o comentário. Tente novamente.',
        );
        throw error;
      }
    },
    [commentModal, refetch, showAlert, csrfFetch],
  );

  const handleSaveRow = useCallback(
    async (groupId: string) => {
      const row = newRow[groupId];
      if (!row) return;

      const error = validateNewRow(row);
      if (error) {
        showAlert('error', 'Erro ao adicionar', error);
        return;
      }

      try {
        const newItem = await createCashflowItem(groupId, row.name, row.significado);
        setNewItems((prev) => ({ ...prev, [newItem.id]: newItem as unknown as CashflowItem }));
        cancelAddingRow(groupId);
        showAlert('success', 'Linha adicionada', 'A linha foi adicionada com sucesso.');
      } catch {
        showAlert('error', 'Erro ao adicionar', 'Erro ao criar a nova linha.');
      }
    },
    [newRow, cancelAddingRow, showAlert],
  );

  const handleItemUpdate = useCallback(async () => {
    try {
      await refetch();
    } catch (error) {
      console.error('Erro ao atualizar item:', error);
      showAlert('error', 'Erro ao atualizar', 'Erro ao atualizar o item.');
    }
  }, [refetch, showAlert]);

  const handleStartGroupEdit = useCallback(
    (group: CashflowGroup) => {
      const allItems = getAllItemsInGroup(group);
      startGroupEditing(group.id, allItems);
    },
    [startGroupEditing],
  );

  const handleSaveGroup = useCallback(
    async (group: CashflowGroup) => {
      setSavingGroups((prev) => new Set(prev).add(group.id));

      try {
        const allItems = getAllItemsInGroup(group);
        const changes = getChangesForGroup(group.id, allItems);

        if (changes.updates.length === 0 && changes.deletes.length === 0) {
          stopGroupEditing(group.id, allItems);
          setSavingGroups((prev) => {
            const newSet = new Set(prev);
            newSet.delete(group.id);
            return newSet;
          });
          return;
        }

        const response = await csrfFetch('/api/cashflow/batch-update', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            groupId: group.id,
            updates: changes.updates,
            deletes: changes.deletes,
          }),
        });

        if (!response.ok) {
          throw new Error('Erro ao salvar alterações');
        }

        await refetch();
        stopGroupEditing(group.id, allItems);
        showAlert('success', 'Alterações salvas', 'As alterações foram salvas com sucesso.');
      } catch (error) {
        console.error('Erro ao salvar alterações:', error);
        showAlert('error', 'Erro ao salvar', 'Erro ao salvar as alterações. Tente novamente.');
      } finally {
        setSavingGroups((prev) => {
          const newSet = new Set(prev);
          newSet.delete(group.id);
          return newSet;
        });
      }
    },
    [getChangesForGroup, stopGroupEditing, refetch, showAlert, csrfFetch],
  );

  const handleCancelGroupEdit = useCallback(
    (group: CashflowGroup) => {
      const allItems = getAllItemsInGroup(group);
      cancelEditing(group.id, allItems);
      showAlert('success', 'Edição cancelada', 'As alterações foram descartadas.');
    },
    [cancelEditing, showAlert],
  );

  // Helper para renderizar ItemRow condicionalmente
  const renderItemRowConditional = useCallback(
    (
      item: CashflowItem,
      group: CashflowGroup,
      itemTotals: number[],
      itemAnnualTotal: number,
      itemPercentage: number,
      isLastItem: boolean = false,
    ) => {
      const groupId = group.id;
      if (isGroupEditing(groupId)) {
        if (isItemDeleted(item.id)) {
          return null;
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
    },
    [
      isGroupEditing,
      isItemDeleted,
      getEditedItem,
      updateItemField,
      deleteItem,
      handleItemUpdate,
      startEditing,
      stopEditing,
      isEditing,
      selectedColor,
      applyColorToCell,
      handleCommentCellClick,
      isCommentModeActive,
    ],
  );

  if (loading) return <div className="py-8 text-center">Carregando...</div>;
  if (error) return <div className="py-8 text-center text-red-500">{error}</div>;
  if (!data?.length) return <div className="py-8 text-center text-red-500">Dados inválidos</div>;

  const anyGroupEditing = processedData.groups.some((g) => isGroupEditing(g.id));

  // Build the shared context for group renderers
  const ctx: GroupRenderContext = {
    collapsed,
    addingRow,
    newRow,
    newItems,
    savingGroups,
    processedData,
    toggleCollapse,
    startAddingRow,
    cancelAddingRow,
    updateNewRow,
    handleSaveRow,
    handleItemUpdate,
    startEditing,
    stopEditing,
    isEditing,
    isGroupEditing,
    handleStartGroupEdit,
    handleSaveGroup,
    handleCancelGroupEdit,
    selectedColor,
    setSelectedColor,
    isCommentModeActive,
    handleCommentButtonClick,
    handleCommentCellClick,
    renderItemRowConditional,
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
          position: 'relative',
        }}
      >
        <Table
          className="relative table-fixed"
          style={{ minWidth: 'max-content', borderCollapse: 'separate', borderSpacing: 0 }}
        >
          <TableHeaderComponent showActionsColumn={anyGroupEditing} />
          <TableBody>
            {processedData.groups
              .filter((group) => group.name !== 'Investimentos')
              .map((group, groupIndex, groups) => {
                const isFirstDespesaGroup =
                  !isReceitaGroupByType(group.type) &&
                  groups.slice(0, groupIndex).every((g) => isReceitaGroupByType(g.type));
                const isMainGroup = !group.parentId;
                const isMainDespesasGroup = group.name === 'Despesas' && !group.parentId;

                return (
                  <React.Fragment key={group.id}>
                    {group.name === 'Entradas' && !group.parentId && <SpacingRow />}
                    {isFirstDespesaGroup && (
                      <PreviousMonthBalanceRow
                        valuesByMonth={previousMonthBalance}
                        totalAnnual={previousMonthBalance.reduce((sum, val) => sum + val, 0)}
                        showActionsColumn={anyGroupEditing}
                      />
                    )}
                    {isMainGroup && needsSpacingBefore(group.name) && group.name !== 'Entradas' && (
                      <SpacingRow />
                    )}
                    <GroupHeader {...renderGroupHeaderProps(group, ctx)} />
                    {isMainDespesasGroup && (
                      <>
                        <SpacingRow />
                        <InflationPedroRow
                          despesasByMonth={processedData.despesasByMonth}
                          despesasAnnual={processedData.despesasTotal}
                          showActionsColumn={anyGroupEditing}
                        />
                      </>
                    )}
                    {group.name === 'Entradas' && !group.parentId && <SpacingRow />}

                    {!collapsed[group.id] && (
                      <>
                        {group.children?.map((subgroup, subgroupIndex, subgroups) => (
                          <SubGroupRenderer
                            key={subgroup.id}
                            subgroup={subgroup}
                            subgroupIndex={subgroupIndex}
                            subgroups={subgroups}
                            ctx={ctx}
                            extraAfterItems={
                              subgroup.name === 'Entradas Variáveis' ? (
                                <InvestmentIncomeRow
                                  valuesByMonth={proventosByMonth}
                                  totalAnnual={proventosAnnual}
                                  showActionsColumn={anyGroupEditing}
                                />
                              ) : undefined
                            }
                          />
                        ))}
                        <DataTableTwoGroupRenderer group={group} ctx={ctx} />
                      </>
                    )}
                    {isMainGroup &&
                      needsSpacingAfter(group.name) &&
                      group.name !== 'Entradas' &&
                      !(
                        group.name === 'Entradas Variáveis' &&
                        groupIndex < groups.length - 1 &&
                        !isReceitaGroupByType(groups[groupIndex + 1].type)
                      ) && <SpacingRow />}
                  </React.Fragment>
                );
              })}

            <TotalRow
              totalByMonth={totalByMonthWithProventos}
              totalAnnual={totalAnnualWithProventos}
              showActionsColumn={anyGroupEditing}
            />

            <SpacingRow />

            <EvolutionRow
              valuesByMonth={evolucaoPatrimonioByMonth}
              totalAnnual={evolucaoPatrimonioAnnual}
              showActionsColumn={anyGroupEditing}
            />

            <SpacingRow />

            <SavingsIndexRow
              totalByMonth={totalByMonthWithProventos}
              entradasByMonth={entradasByMonthWithProventos}
              totalAnnual={totalAnnualWithProventos}
              entradasAnnual={entradasAnnualWithProventos}
              showActionsColumn={anyGroupEditing}
            />

            <SpacingRow />

            <FinancialPeaceIndexRow
              proventosByMonth={proventosByMonth}
              despesasFixasByMonth={despesasFixasData.byMonth}
              proventosAnnual={proventosAnnual}
              despesasFixasAnnual={despesasFixasData.annual}
              showActionsColumn={anyGroupEditing}
            />

            <SpacingRow />

            {/* Investimentos group */}
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
                      {group.children?.map((subgroup, subgroupIndex, subgroups) => (
                        <SubGroupRenderer
                          key={subgroup.id}
                          subgroup={subgroup}
                          subgroupIndex={subgroupIndex}
                          subgroups={subgroups}
                          ctx={ctx}
                        />
                      ))}
                      <DataTableTwoGroupRenderer group={group} ctx={ctx} />
                    </>
                  )}
                </React.Fragment>
              ))}

            <SpacingRow />

            <DataTableTwoFreeCashflowRow
              entradasByMonthWithProventos={entradasByMonthWithProventos}
              despesasByMonth={processedData.despesasByMonth}
              investimentosByMonth={investimentosByMonth}
              showActionsColumn={anyGroupEditing}
            />
          </TableBody>
        </Table>
      </div>

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
