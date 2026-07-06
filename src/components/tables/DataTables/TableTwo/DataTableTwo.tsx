'use client';

import { logger } from '@/lib/logger';
import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
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
import { useCashflowYear } from '@/context/CashflowYearContext';
import { validateNewRow } from '@/utils/validation';
import {
  TableHeaderComponent,
  GroupHeader,
  ItemRow,
  TotalRow,
  SavingsIndexRow,
  FinancialPeaceIndexRow,
  InflationPedroRow,
  InvestmentIncomeRow,
  EvolutionRow,
  ExpenseRatioRow,
  SummaryRow,
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
import { GroupRenderContext } from './dataTableTwoTypes';

export default function DataTableTwo() {
  const { csrfFetch } = useCsrf();
  const queryClient = useQueryClient();
  const { year: currentYear } = useCashflowYear();
  const { data, loading, error, refetch } = useCashflowData(currentYear);
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

  // Regra Pedro Haddad: os proventos automáticos ("Rendimentos Recebidos")
  // NÃO somam nas entradas nem no saldo do mês — rodam de forma independente
  // no fim da planilha. Receitas de investimentos lançadas manualmente pelo
  // cliente continuam entrando normalmente pelos itens de Entradas.

  const investimentosByMonth = useMemo(() => {
    const findInvestimentosGroup = (groups: CashflowGroup[]): CashflowGroup | null => {
      for (const group of groups) {
        if (group.type === 'investimento') {
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

  // Total anual de despesas SEM o grupo de investimentos (despesasTotal da
  // agregação inclui o anual de investimentos por quirk histórico).
  const despesasAnnualSemInvestimentos = useMemo(
    () => processedData.despesasByMonth.reduce((sum, value) => sum + value, 0),
    [processedData.despesasByMonth],
  );

  const evolucaoPatrimonioByMonth = useMemo(
    () =>
      processedData.totalByMonth.map((value, index) => value + (investimentosByMonth[index] || 0)),
    [processedData.totalByMonth, investimentosByMonth],
  );
  const evolucaoPatrimonioAnnual = useMemo(
    () => evolucaoPatrimonioByMonth.reduce((sum, value) => sum + value, 0),
    [evolucaoPatrimonioByMonth],
  );

  // Bloco "Conta Corrente" (type='saldo'): o cliente informa manualmente o que
  // ficou parado em cada banco no fim de cada mês.
  const contaCorrenteGroup = useMemo(() => {
    const findSaldoGroup = (groups: CashflowGroup[]): CashflowGroup | null => {
      for (const group of groups) {
        if (group.type === 'saldo') return group;
        if (group.children) {
          const found = findSaldoGroup(group.children);
          if (found) return found;
        }
      }
      return null;
    };
    return findSaldoGroup(processedData.groups);
  }, [processedData.groups]);

  const contaCorrenteByMonth = useMemo(
    () =>
      contaCorrenteGroup
        ? processedData.groupTotals[contaCorrenteGroup.id] || Array(12).fill(0)
        : Array(12).fill(0),
    [contaCorrenteGroup, processedData.groupTotals],
  );

  // Carry-over cross-year: saldo da Conta Corrente em dezembro do ano anterior
  // entra como "Saldo Conta Corrente Mês Anterior" de janeiro.
  const { data: saldoAnteriorData } = useQuery({
    queryKey: queryKeys.cashflow.contaCorrenteAnterior(currentYear),
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/cashflow/conta-corrente-anterior?year=${currentYear}`, {
        credentials: 'include',
        signal,
      });
      if (!response.ok) throw new Error('Erro ao buscar saldo do ano anterior');
      return response.json() as Promise<{ saldoDezembroAnterior: number }>;
    },
  });
  const saldoDezembroAnterior = saldoAnteriorData?.saldoDezembroAnterior ?? 0;

  // Saldo Conta Corrente Mês Anterior: jan puxa dez do ano anterior; os demais
  // meses puxam o bloco Conta Corrente do mês anterior. Não soma nas entradas —
  // só compõe o Fluxo de Caixa livre (regra Pedro Haddad).
  const saldoContaCorrenteAnteriorByMonth = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) =>
        index === 0 ? saldoDezembroAnterior : contaCorrenteByMonth[index - 1] || 0,
      ),
    [saldoDezembroAnterior, contaCorrenteByMonth],
  );

  // Fluxo de Caixa livre = saldo do mês + saldo conta corrente do mês anterior
  // − aportes/resgates (fórmula da planilha, não acumulado: a sobra que ficou
  // na conta entra no mês seguinte via Conta Corrente preenchida pelo cliente).
  const fluxoCaixaLivreByMonth = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const saldoMes =
          processedData.entradasByMonth[index] - processedData.despesasByMonth[index];
        return (
          saldoMes +
          (saldoContaCorrenteAnteriorByMonth[index] || 0) -
          (investimentosByMonth[index] || 0)
        );
      }),
    [
      processedData.entradasByMonth,
      processedData.despesasByMonth,
      saldoContaCorrenteAnteriorByMonth,
      investimentosByMonth,
    ],
  );

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

    // Run immediately, then retry with a single delayed attempt for late-rendering content
    ensureJanuaryVisible();
    const timeout = setTimeout(ensureJanuaryVisible, 300);

    return () => {
      clearTimeout(timeout);
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
    year: currentYear,
    initialComment: null,
    updatedAt: null,
  });

  // Reset comment modal on unmount
  useEffect(() => {
    return () => {
      setCommentModal((prev) => ({ ...prev, isOpen: false }));
    };
  }, []);

  // Função para buscar comentário
  const fetchComment = useCallback(async (itemId: string, month: number, year: number) => {
    try {
      const response = await fetch(
        `/api/cashflow/comments?itemId=${itemId}&month=${month}&year=${year}`,
        {
          credentials: 'include',
          signal: AbortSignal.timeout(10000),
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
      logger.error(
        `Erro ao buscar comentário (item=${itemId}, month=${month}, year=${year}):`,
        error,
      );
      throw error;
    }
  }, []);

  // Handler para clicar no botão de comentário
  // setIsCommentModeActive already clears color mode via unified UIMode
  const handleCommentButtonClick = useCallback(() => {
    setIsCommentModeActive((prev: boolean) => !prev);
  }, [setIsCommentModeActive]);

  // Handler para clicar em uma célula quando em modo de comentário
  const handleCommentCellClick = useCallback(
    async (itemId: string, monthIndex: number) => {
      if (!isCommentModeActive) return;

      try {
        const item = findItemById(processedData.groups, itemId);
        if (!item) {
          logger.warn(`Item não encontrado: ${itemId}`);
          showAlert(
            'error',
            'Item não encontrado',
            'Não foi possível encontrar o item selecionado.',
          );
          return;
        }

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
        logger.error('Erro ao buscar comentário:', error);
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
    [
      isCommentModeActive,
      processedData.groups,
      fetchComment,
      setIsCommentModeActive,
      showAlert,
      currentYear,
    ],
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
        logger.error('Erro ao salvar comentário:', error);

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
      logger.error('Erro ao atualizar item:', error);
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
            year: currentYear,
            updates: changes.updates,
            deletes: changes.deletes,
          }),
        });

        if (!response.ok) {
          throw new Error('Erro ao salvar alterações');
        }

        await refetch();
        // Editar a linha-espelho de um sonho re-deriva o "Realizado" no backend;
        // invalida a query de sonhos pra a tela de Planejamento refletir na hora.
        queryClient.invalidateQueries({ queryKey: queryKeys.planejamento.all });
        queryClient.invalidateQueries({ queryKey: ['planejamento-sonhos'] });
        stopGroupEditing(group.id, allItems);
        showAlert('success', 'Alterações salvas', 'As alterações foram salvas com sucesso.');
      } catch (error) {
        logger.error('Erro ao salvar alterações:', error);
        showAlert('error', 'Erro ao salvar', 'Erro ao salvar as alterações. Tente novamente.');
      } finally {
        setSavingGroups((prev) => {
          const newSet = new Set(prev);
          newSet.delete(group.id);
          return newSet;
        });
      }
    },
    [getChangesForGroup, stopGroupEditing, refetch, showAlert, csrfFetch, queryClient, currentYear],
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
      // Linhas vinculadas a um sonho (🎯) entram no modo de edição, mas só os
      // VALORES/CORES são editáveis (o cliente lança o realizado e pinta de
      // verde). Nome/rank/exclusão ficam travados (`objetivoLocked`) — a fonte é
      // o Planejamento de Sonhos.
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
            currentYear={currentYear}
            isLastItem={isLastItem}
            objetivoLocked={!!item.objetivoId}
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
            currentYear={currentYear}
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
      currentYear,
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
              .filter((group) => group.type !== 'investimento' && group.type !== 'saldo')
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
                      <SummaryRow
                        label="Saldo Conta Corrente Mês Anterior"
                        cells={saldoContaCorrenteAnteriorByMonth}
                        annual={saldoContaCorrenteAnteriorByMonth.reduce(
                          (sum, val) => sum + val,
                          0,
                        )}
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
              totalByMonth={processedData.totalByMonth}
              totalAnnual={processedData.totalAnnual}
              showActionsColumn={anyGroupEditing}
            />

            <SpacingRow />

            <SavingsIndexRow
              totalByMonth={processedData.totalByMonth}
              entradasByMonth={processedData.entradasByMonth}
              totalAnnual={processedData.totalAnnual}
              entradasAnnual={processedData.entradasTotal}
              showActionsColumn={anyGroupEditing}
            />

            <ExpenseRatioRow
              despesasByMonth={processedData.despesasByMonth}
              entradasByMonth={processedData.entradasByMonth}
              despesasAnnual={despesasAnnualSemInvestimentos}
              entradasAnnual={processedData.entradasTotal}
              showActionsColumn={anyGroupEditing}
            />

            <SpacingRow />

            {/* Conta Corrente: saldo parado nos bancos, preenchido manualmente */}
            {contaCorrenteGroup && (
              <React.Fragment key={contaCorrenteGroup.id}>
                <GroupHeader {...renderGroupHeaderProps(contaCorrenteGroup, ctx)} />
                {!collapsed[contaCorrenteGroup.id] && (
                  <DataTableTwoGroupRenderer group={contaCorrenteGroup} ctx={ctx} />
                )}
                <SpacingRow />
              </React.Fragment>
            )}

            {/* Aporte/Resgate (grupo Investimentos, automático da carteira) */}
            {processedData.groups
              .filter((group) => group.type === 'investimento')
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

            <SummaryRow
              label="Fluxo de Caixa livre"
              cells={fluxoCaixaLivreByMonth}
              annual={fluxoCaixaLivreByMonth.reduce((sum, val) => sum + val, 0)}
              negativeRed
              showActionsColumn={anyGroupEditing}
            />

            <SpacingRow />

            <EvolutionRow
              valuesByMonth={evolucaoPatrimonioByMonth}
              totalAnnual={evolucaoPatrimonioAnnual}
              showActionsColumn={anyGroupEditing}
            />

            <SpacingRow />

            {/* Proventos automáticos da carteira — independentes, não somam nas entradas */}
            <InvestmentIncomeRow
              valuesByMonth={proventosByMonth}
              totalAnnual={proventosAnnual}
              showActionsColumn={anyGroupEditing}
            />

            <FinancialPeaceIndexRow
              proventosByMonth={proventosByMonth}
              despesasFixasByMonth={despesasFixasData.byMonth}
              proventosAnnual={proventosAnnual}
              despesasFixasAnnual={despesasFixasData.annual}
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
