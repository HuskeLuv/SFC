'use client';

import { logger } from '@/lib/logger';
import { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import React from 'react';
import Alert from '@/components/ui/alert/Alert';
import { Table, TableBody } from '@/components/ui/table';
import { useAlert } from '@/hooks/useCashflow';
import { useCashflowView } from '@/hooks/useCashflowView';
import { useCashflowMutations } from '@/hooks/useCashflowMutations';
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
  SummaryRow,
  SaldoContaCorrenteAnteriorRow,
} from '@/components/cashflow';
import { FIXED_COLUMNS_TOTAL_WIDTH, ANNUAL_COLUMN_WIDTH } from '@/components/cashflow/fixedColumns';
import { GRID, currentMonthIndex } from '@/components/cashflow/cashflowGridStyles';
import { SpacingRow } from '@/components/cashflow/GridCells';
import { CashflowToolbar } from '@/components/cashflow/CashflowToolbar';
import { TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { CANONICAL_GROUPS, isCanonical } from '@/services/cashflow/groupMatchers';
import { EditableItemRow } from '@/components/cashflow/EditableItemRow';
import { CashflowItem, CashflowGroup } from '@/types/cashflow';
import { useCommentModal } from '@/hooks/useCommentModal';
import { useGroupEditMode } from '@/hooks/useGroupEditMode';
import { getAllItemsInGroup } from '@/utils/cashflowHelpers';
import { isReceitaGroupByType } from '@/utils/formatters';
import { CommentModal } from '@/components/cashflow/CommentModal';
import { ImportPlanilhaModal } from '@/components/cashflow/ImportPlanilhaModal';
import { SubGroupRenderer, renderGroupHeaderProps } from './DataTableTwoGroupRenderer';
import DataTableTwoGroupRenderer from './DataTableTwoGroupRenderer';
import { GroupRenderContext } from './dataTableTwoTypes';
import { CashflowDndProvider } from '@/components/cashflow/CashflowDnd';

/** Largura da coluna de mês da grade do ano no celular (5.25rem, ver globals.css). */
const YEAR_GRID_MONTH_PX = 84;

export interface DataTableTwoProps {
  /**
   * 'default' (padrão) = a planilha de sempre, DOM idêntico. 'mobile-year' = "Ano inteiro" do
   * celular (PWA fase 2): só leitura, sem barra de ferramentas, sem arrastar, sem modais, e cada mês
   * do cabeçalho vira botão (`onPickMonth`).
   */
  presentation?: 'default' | 'mobile-year';
  /** 'mobile-year': mês (0..11) que a rolagem inicial deixa à vista. */
  initialMonth?: number;
  /** 'mobile-year': toque no nome do mês no cabeçalho. */
  onPickMonth?: (month: number) => void;
}

export default function DataTableTwo({
  presentation = 'default',
  initialMonth,
  onPickMonth,
}: DataTableTwoProps = {}) {
  const isYearGrid = presentation === 'mobile-year';
  const { year: currentYear } = useCashflowYear();
  const [importModalOpen, setImportModalOpen] = useState(false);
  // Modelo de leitura compartilhado com a visão do mês (PWA fase 2): árvore, proventos,
  // agregação, linhas calculadas e recolher/expandir.
  const {
    data,
    loading,
    error,
    processedData,
    derived,
    collapsible: {
      collapsed,
      addingRow,
      newRow,
      toggleCollapse,
      setCollapsedAll,
      startAddingRow,
      cancelAddingRow,
      updateNewRow,
    },
  } = useCashflowView(currentYear);
  const { alert, showAlert } = useAlert();
  // Mutações compartilhadas com os sheets do celular (mesmas rotas, csrf e invalidações).
  const { saveItemChanges, createItem, reorderItem, moveItem, fetchCellComment, saveCellComment } =
    useCashflowMutations(currentYear);
  const [newItems, setNewItems] = useState<Record<string, CashflowItem>>({});
  const [savingGroups, setSavingGroups] = useState<Set<string>>(new Set());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Linhas calculadas (Saldo C/C anterior, Fluxo livre, Evolução, Rendimentos,
  // Paz financeira): séries e regras vivem no hook — aqui só render.
  const {
    despesasFixasData,
    proventosByMonth,
    proventosAnnual,
    contaCorrenteGroup,
    saldoContaCorrenteAnteriorByMonth,
    fluxoCaixaLivreByMonth,
    fluxoCaixaLivreAnnual,
    evolucaoPatrimonioByMonth,
  } = derived;

  // Garantir que o scroll inicial mostre janeiro (primeira coluna de mês)
  useEffect(() => {
    if (isYearGrid) return;
    if (!scrollContainerRef.current || loading || !data?.length) return;

    const container = scrollContainerRef.current;

    const ensureJanuaryVisible = () => {
      if (!container) return;

      container.scrollLeft = 0;

      requestAnimationFrame(() => {
        if (!container) return;

        const firstMonthCell = container.querySelector('#first-month-cell') as HTMLElement;
        if (firstMonthCell) {
          const fixedColumnsWidth = FIXED_COLUMNS_TOTAL_WIDTH;
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
  }, [loading, data, isYearGrid]);

  // Grade do ano no celular: abre com o mês em foco logo depois da coluna de itens fixa (128px).
  // Só na montagem com dados — depois a rolagem é do usuário.
  const initialScrollDoneRef = useRef(false);
  useEffect(() => {
    if (!isYearGrid || initialScrollDoneRef.current) return;
    const container = scrollContainerRef.current;
    if (!container || loading || !data?.length) return;
    initialScrollDoneRef.current = true;
    const month = Math.min(11, Math.max(0, initialMonth ?? 0));
    container.scrollLeft = month * YEAR_GRID_MONTH_PX;
  }, [isYearGrid, initialMonth, loading, data]);

  // Barra de ferramentas: recolher/expandir tudo e rolar meses.
  const collapseAll = useCallback(() => {
    const ids: string[] = [];
    const walk = (groups: CashflowGroup[]) => {
      for (const g of groups) {
        ids.push(g.id);
        if (g.children?.length) walk(g.children);
      }
    };
    walk(processedData.groups);
    setCollapsedAll(Object.fromEntries(ids.map((id) => [id, true])));
  }, [processedData.groups, setCollapsedAll]);
  const expandAll = useCallback(() => setCollapsedAll({}), [setCollapsedAll]);
  const scrollMonths = useCallback((direction: -1 | 1) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    // Uma "página" = a largura visível entre as colunas fixas da esquerda e o Total Anual.
    const visible = container.clientWidth - FIXED_COLUMNS_TOTAL_WIDTH - ANNUAL_COLUMN_WIDTH;
    container.scrollBy({ left: direction * Math.max(visible, 96), behavior: 'smooth' });
  }, []);

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
    addItemToEdit,
  } = useGroupEditMode();

  // Itens do grupo + linhas criadas nesta sessão (ainda fora da árvore até o
  // refetch): a edição/salvamento do grupo precisa enxergar as duas.
  const itemsInGroup = useCallback(
    (group: CashflowGroup): CashflowItem[] => {
      const tree = getAllItemsInGroup(group);
      const ids = new Set(tree.map((item) => item.id));
      const extra = Object.values(newItems).filter(
        (item) => item.groupId === group.id && !ids.has(item.id),
      );
      return extra.length ? [...tree, ...extra] : tree;
    },
    [newItems],
  );

  // Modal de comentários por célula (estado + handlers extraídos p/ hook)
  const {
    commentModal,
    closeCommentModal,
    handleCommentButtonClick,
    handleCommentCellClick,
    handleSaveComment,
  } = useCommentModal({
    groups: processedData.groups,
    currentYear,
    isCommentModeActive,
    setIsCommentModeActive,
    showAlert,
    fetchCellComment,
    saveCellComment,
  });

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
        const newItem = await createItem(groupId, row.name, row.significado);
        setNewItems((prev) => ({ ...prev, [newItem.id]: newItem }));
        // Criada com o grupo em edição: já entra editável na sessão.
        if (isGroupEditing(groupId)) addItemToEdit(newItem);
        cancelAddingRow(groupId);
        showAlert('success', 'Linha adicionada', 'A linha foi adicionada com sucesso.');
      } catch {
        showAlert('error', 'Erro ao adicionar', 'Erro ao criar a nova linha.');
      }
    },
    [newRow, cancelAddingRow, showAlert, isGroupEditing, addItemToEdit, createItem],
  );

  // Drag-and-drop (16/09/2026): reordena no mesmo grupo (otimista; refetch na falha).
  const handleReorder = useCallback(
    async (groupId: string, activeId: string, overId: string) => {
      const ok = await reorderItem(groupId, activeId, overId);
      if (!ok) showAlert('error', 'Erro ao reordenar', 'Não foi possível mover a linha.');
    },
    [reorderItem, showAlert],
  );

  // Drag-and-drop entre seções (pedido do Pedro 24/09/2026): solta numa linha
  // ou no cabeçalho de outro grupo (otimista; refetch sempre).
  const handleMove = useCallback(
    async (activeId: string, toGroupId: string, overId: string | null, after: boolean) => {
      const res = await moveItem(activeId, toGroupId, overId, after);
      if (!res.ok) showAlert('error', 'Erro ao mover', res.error);
    },
    [moveItem, showAlert],
  );

  const handleStartGroupEdit = useCallback(
    (group: CashflowGroup) => startGroupEditing(group.id, itemsInGroup(group)),
    [startGroupEditing, itemsInGroup],
  );

  const handleSaveGroup = useCallback(
    async (group: CashflowGroup) => {
      setSavingGroups((prev) => new Set(prev).add(group.id));

      try {
        const allItems = itemsInGroup(group);
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

        const res = await saveItemChanges({
          groupId: group.id,
          updates: changes.updates,
          deletes: changes.deletes,
        });

        // Desktop: 2xx = sucesso (linhas recusadas pelo servidor seguem como sempre).
        if (!res.httpOk) {
          throw new Error('Erro ao salvar alterações');
        }

        if (res.treeUpdated) {
          // A árvore salva já traz as linhas criadas nesta sessão.
          setNewItems((prev) =>
            Object.fromEntries(
              Object.entries(prev).filter(([, item]) => item.groupId !== group.id),
            ),
          );
        }
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
    [getChangesForGroup, stopGroupEditing, showAlert, saveItemChanges, itemsInGroup],
  );

  const handleCancelGroupEdit = useCallback(
    (group: CashflowGroup) => {
      cancelEditing(group.id, itemsInGroup(group));
      showAlert('success', 'Edição cancelada', 'As alterações foram descartadas.');
    },
    [cancelEditing, showAlert, itemsInGroup],
  );

  // Helper para renderizar ItemRow condicionalmente
  const renderItemRowConditional = useCallback(
    (
      item: CashflowItem,
      group: CashflowGroup,
      itemTotals: number[],
      itemAnnualTotal: number,
      itemPercentage: number,
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
            currentYear={currentYear}
            // Grupos calculados (Aporte/Resgate da carteira, Conta Corrente)
            // não têm linhas no banco — sem alça.
            reorderable={!isYearGrid && group.type !== 'investimento' && group.type !== 'saldo'}
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
      selectedColor,
      applyColorToCell,
      handleCommentCellClick,
      isCommentModeActive,
      currentYear,
      isYearGrid,
    ],
  );

  // Contexto compartilhado dos renderers de grupo, memoizado: junto com o
  // React.memo dos renderers/linhas, evita re-render das subtrees quando um
  // estado não relacionado muda (ex.: modal de comentário, queries chegando).
  const ctx: GroupRenderContext = useMemo(
    () => ({
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
      readOnly: isYearGrid || undefined,
    }),
    [
      isYearGrid,
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
    ],
  );

  if (loading) return <div className="py-8 text-center">Carregando...</div>;
  if (error) return <div className="py-8 text-center text-red-500">{error}</div>;
  if (!data?.length) return <div className="py-8 text-center text-red-500">Dados inválidos</div>;

  const currentMonth = currentMonthIndex(currentYear);
  const mainGroups = processedData.groups.filter(
    (group) => group.type !== 'investimento' && group.type !== 'saldo',
  );
  const investimentoGroups = processedData.groups.filter((group) => group.type === 'investimento');

  return (
    <div className="bg-white dark:bg-white/[0.03] flex-1 flex flex-col min-h-0 min-w-0">
      {alert && (
        <div className="mb-4 flex-shrink-0">
          <Alert variant={alert.type} title={alert.title} message={alert.message} />
        </div>
      )}

      {isYearGrid ? null : (
        <CashflowToolbar
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
          onScrollMonths={scrollMonths}
          onImport={() => setImportModalOpen(true)}
        />
      )}

      {/* pb-24: garante que as últimas linhas rolem acima do banner de cookies */}
      <div
        ref={scrollContainerRef}
        // min-w-0 + max-w-full: a rolagem horizontal acontece AQUI (e não na página),
        // senão as colunas sticky somem ao rolar (feedback 15/09/2026).
        // isolate + z-0: os z-index internos das células sticky (30-58, cabeçalho 400+)
        // ficam presos neste contexto e nunca passam por cima do menu lateral (z-50)
        // nem do backdrop mobile — modais/tooltips da grade saem por portal, não são
        // afetados. TABLE_STYLES.wrapper: cantos arredondados + borda, padrão do app.
        className={`${TABLE_STYLES.wrapper} relative isolate z-0 w-full max-w-full min-w-0 h-full overflow-y-auto custom-scrollbar cashflow-table pb-24`}
        style={{ scrollBehavior: 'auto', position: 'relative' }}
        {...(isYearGrid
          ? { tabIndex: 0, 'aria-label': 'Planilha do ano', 'data-mf-year-grid-scroll': '' }
          : {})}
      >
        <CashflowDndProvider onReorder={handleReorder} onMove={handleMove} disabled={isYearGrid}>
          <Table
            className={`relative ${GRID.table}`}
            style={GRID.tableStyle}
            aria-label="Planilha de fluxo de caixa"
          >
            <TableHeaderComponent
              currentMonth={currentMonth}
              onPickMonth={isYearGrid ? onPickMonth : undefined}
            />
            <TableBody>
              {mainGroups.map((group, groupIndex, groups) => {
                const isFirstDespesaGroup =
                  !isReceitaGroupByType(group.type) &&
                  groups.slice(0, groupIndex).every((g) => isReceitaGroupByType(g.type));
                const isMainDespesasGroup =
                  isCanonical(group, CANONICAL_GROUPS.DESPESAS) && !group.parentId;

                return (
                  <React.Fragment key={group.id}>
                    {isFirstDespesaGroup && (
                      <>
                        <SpacingRow />
                        <SaldoContaCorrenteAnteriorRow cells={saldoContaCorrenteAnteriorByMonth} />
                      </>
                    )}
                    {groupIndex > 0 && <SpacingRow />}
                    <GroupHeader {...renderGroupHeaderProps(group, ctx)} />
                    {isMainDespesasGroup && (
                      <InflationPedroRow
                        despesasByMonth={processedData.despesasByMonth}
                        despesasAnnual={processedData.despesasTotal}
                      />
                    )}

                    {!collapsed[group.id] && (
                      <>
                        {group.children?.map((subgroup) => (
                          <SubGroupRenderer key={subgroup.id} subgroup={subgroup} ctx={ctx} />
                        ))}
                        <DataTableTwoGroupRenderer group={group} ctx={ctx} />
                      </>
                    )}
                  </React.Fragment>
                );
              })}

              <SpacingRow />
              <TotalRow
                totalByMonth={processedData.totalByMonth}
                totalAnnual={processedData.totalAnnual}
              />
              <SavingsIndexRow
                totalByMonth={processedData.totalByMonth}
                entradasByMonth={processedData.entradasByMonth}
                totalAnnual={processedData.totalAnnual}
                entradasAnnual={processedData.entradasTotal}
              />

              {/* Conta Corrente: saldo parado nos bancos, preenchido manualmente */}
              {contaCorrenteGroup && (
                <React.Fragment key={contaCorrenteGroup.id}>
                  <SpacingRow />
                  <GroupHeader {...renderGroupHeaderProps(contaCorrenteGroup, ctx)} />
                  {!collapsed[contaCorrenteGroup.id] && (
                    <DataTableTwoGroupRenderer group={contaCorrenteGroup} ctx={ctx} />
                  )}
                </React.Fragment>
              )}

              {/* Aporte/Resgate (grupo Investimentos, automático da carteira) */}
              {investimentoGroups.map((group) => (
                <React.Fragment key={group.id}>
                  <SpacingRow />
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
                      {group.children?.map((subgroup) => (
                        <SubGroupRenderer key={subgroup.id} subgroup={subgroup} ctx={ctx} />
                      ))}
                      <DataTableTwoGroupRenderer group={group} ctx={ctx} />
                    </>
                  )}
                </React.Fragment>
              ))}

              <SpacingRow />
              <SummaryRow
                label="Fluxo de Caixa livre"
                tooltip="Saldo do mês + Saldo Conta Corrente do mês anterior − aportes/resgates do mês. Mês com aporte grande fica negativo: o dinheiro saiu do caixa livre e virou patrimônio investido."
                cells={fluxoCaixaLivreByMonth}
                annual={fluxoCaixaLivreAnnual}
                variant="highlight"
                negativeRed
                positiveBlue
              />
              <SummaryRow
                label="Evolução do Patrimônio"
                cells={evolucaoPatrimonioByMonth}
                annual={evolucaoPatrimonioByMonth[11] ?? null}
                variant="highlight"
                negativeRed
              />

              <SpacingRow />
              {/* Proventos automáticos da carteira — independentes, não somam nas entradas */}
              <InvestmentIncomeRow valuesByMonth={proventosByMonth} totalAnnual={proventosAnnual} />
              <FinancialPeaceIndexRow
                proventosByMonth={proventosByMonth}
                despesasFixasByMonth={despesasFixasData.byMonth}
                proventosAnnual={proventosAnnual}
                despesasFixasAnnual={despesasFixasData.annual}
              />
            </TableBody>
          </Table>
        </CashflowDndProvider>
      </div>

      {isYearGrid ? null : (
        <>
          <ImportPlanilhaModal
            isOpen={importModalOpen}
            onClose={() => setImportModalOpen(false)}
            year={currentYear}
          />

          <CommentModal
            isOpen={commentModal.isOpen}
            onClose={closeCommentModal}
            onSave={handleSaveComment}
            initialComment={commentModal.initialComment}
            updatedAt={commentModal.updatedAt}
            itemName={commentModal.itemName}
            month={commentModal.month}
            year={commentModal.year}
          />
        </>
      )}
    </div>
  );
}
