"use client";
import { useCallback, useState } from "react";
import React from "react";
import Alert from "@/components/ui/alert/Alert";
import { Table, TableBody } from "@/components/ui/table";
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
  InflationPedroRow,
  NewItemRow
} from "@/components/cashflow";
import { EditableItemRow } from "@/components/cashflow/EditableItemRow";
import { CashflowItem, CashflowGroup } from "@/types/cashflow";
import { createCashflowItem } from "@/utils/cashflowUpdate";
import { useCellEditing } from "@/hooks/useCellEditing";
import { useGroupEditMode } from "@/hooks/useGroupEditMode";
import { getAllItemsInGroup } from "@/utils/cashflowHelpers";
import { isReceitaGroupByType } from "@/utils/formatters";

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
  } = useGroupEditMode();

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
    itemPercentage: number
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
        />
      );
    }
  }, [isGroupEditing, isItemDeleted, getEditedItem, updateItemField, deleteItem, handleItemUpdate, startEditing, stopEditing, isEditing]);

  if (loading) return <div className="py-8 text-center">Carregando...</div>;
  if (error) return <div className="py-8 text-center text-red-500">{error}</div>;
  if (!data?.length) return <div className="py-8 text-center text-red-500">Dados inválidos</div>;

  return (
    <div className="overflow-hidden rounded-xl bg-white dark:bg-white/[0.03]">
      {alert && (
        <div className="mb-4">
          <Alert variant={alert.type} title={alert.title} message={alert.message} />
        </div>
      )}
      
      <div className="max-w-full overflow-x-auto custom-scrollbar">
        <Table>
          <TableHeaderComponent showActionsColumn={processedData.groups.some(g => isGroupEditing(g.id))} />
          <TableBody>
            {processedData.groups
              .filter((group) => group.name !== 'Investimentos')
              .map((group, groupIndex, groups) => {
                // Verificar se este é o primeiro grupo de despesas
                const isFirstDespesaGroup = !isReceitaGroupByType(group.type) && 
                  groups.slice(0, groupIndex).every(g => isReceitaGroupByType(g.type));
                
                return (
                <React.Fragment key={group.id}>
                  {/* Renderizar Inflação Pedro antes do primeiro grupo de Despesas */}
                  {isFirstDespesaGroup && (
                    <InflationPedroRow
                      despesasByMonth={processedData.despesasByMonth}
                      despesasAnnual={processedData.despesasTotal}
                      showActionsColumn={processedData.groups.some(g => isGroupEditing(g.id))}
                    />
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
                        />
                        
                        {!collapsed[subgroup.id] && (
                          <>
                            {/* Renderizar sub-subgrupos */}
                            {subgroup.children?.map((subsubgroup) => (
                              <React.Fragment key={subsubgroup.id}>
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
                                />
                                
                                {!collapsed[subsubgroup.id] && subsubgroup.items?.map((item) => 
                                  renderItemRowConditional(
                                    item,
                                    subsubgroup,
                                    processedData.itemTotals[item.id] || Array(12).fill(0),
                                    processedData.itemAnnualTotals[item.id] || 0,
                                    processedData.itemPercentages[item.id] || 0
                                  )
                                )}
                                
                                {/* Renderizar novos itens criados */}
                                {Object.entries(newItems)
                                  .filter(([, item]) => item.groupId === subsubgroup.id)
                                  .map(([itemId, item]) => (
                                    <NewItemRow
                                      key={itemId}
                                      item={item}
                                      group={subsubgroup}
                                      onItemUpdate={handleItemUpdate}
                                      startEditing={startEditing}
                                      stopEditing={stopEditing}
                                      isEditing={isEditing}
                                  />
                                ))}
                                
                                {!collapsed[subsubgroup.id] && addingRow[subsubgroup.id] && (
                                  <AddRowForm
                                    newRow={newRow[subsubgroup.id] || { name: "", significado: "" }}
                                    onUpdateField={(field, value) => updateNewRow(subsubgroup.id, field, value)}
                                    onSave={() => handleSaveRow(subsubgroup.id)}
                                    onCancel={() => cancelAddingRow(subsubgroup.id)}
                                  />
                                )}
                              </React.Fragment>
                            ))}
                            
                            {/* Renderizar itens do subgrupo */}
                            {subgroup.items?.map((item) => 
                              renderItemRowConditional(
                                item,
                                subgroup,
                                processedData.itemTotals[item.id] || Array(12).fill(0),
                                processedData.itemAnnualTotals[item.id] || 0,
                                processedData.itemPercentages[item.id] || 0
                              )
                            )}
                            
                            {/* Renderizar novos itens criados */}
                            {Object.entries(newItems)
                              .filter(([, item]) => item.groupId === subgroup.id)
                              .map(([itemId, item]) => (
                                <NewItemRow
                                  key={itemId}
                                  item={item}
                                  group={subgroup}
                                  onItemUpdate={handleItemUpdate}
                                  startEditing={startEditing}
                                  stopEditing={stopEditing}
                                  isEditing={isEditing}
                              />
                            ))}
                            
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
                      </React.Fragment>
                    ))}
                    
                    {/* Renderizar itens do grupo principal */}
                    {group.items?.map((item) => 
                      renderItemRowConditional(
                        item,
                        group,
                        processedData.itemTotals[item.id] || Array(12).fill(0),
                        processedData.itemAnnualTotals[item.id] || 0,
                        processedData.itemPercentages[item.id] || 0
                      )
                    )}
                    
                    {/* Renderizar novos itens criados */}
                    {Object.entries(newItems)
                      .filter(([, item]) => item.groupId === group.id)
                      .map(([itemId, item]) => (
                        <NewItemRow
                          key={itemId}
                          item={item}
                          group={group}
                          onItemUpdate={handleItemUpdate}
                          startEditing={startEditing}
                          stopEditing={stopEditing}
                          isEditing={isEditing}
                      />
                    ))}
                    
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
              );
            })}
            
            {/* Renderizar Saldo antes de Investimentos */}
            <TotalRow
              totalByMonth={processedData.totalByMonth}
              totalAnnual={processedData.totalAnnual}
              showActionsColumn={processedData.groups.some(g => isGroupEditing(g.id))}
            />
            
            {/* Renderizar Índice de Poupança após o Saldo */}
            <SavingsIndexRow
              totalByMonth={processedData.totalByMonth}
              entradasByMonth={processedData.entradasByMonth}
              totalAnnual={processedData.totalAnnual}
              entradasAnnual={processedData.entradasTotal}
              showActionsColumn={processedData.groups.some(g => isGroupEditing(g.id))}
            />
            
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
                        />
                        
                        {!collapsed[subgroup.id] && (
                          <>
                            {/* Renderizar sub-subgrupos */}
                            {subgroup.children?.map((subsubgroup) => (
                              <React.Fragment key={subsubgroup.id}>
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
                                />
                                
                                {!collapsed[subsubgroup.id] && subsubgroup.items?.map((item) => 
                                  renderItemRowConditional(
                                    item,
                                    subsubgroup,
                                    processedData.itemTotals[item.id] || Array(12).fill(0),
                                    processedData.itemAnnualTotals[item.id] || 0,
                                    processedData.itemPercentages[item.id] || 0
                                  )
                                )}
                                
                                {/* Renderizar novos itens criados */}
                                {Object.entries(newItems)
                                  .filter(([, item]) => item.groupId === subsubgroup.id)
                                  .map(([itemId, item]) => (
                                    <NewItemRow
                                      key={itemId}
                                      item={item}
                                      group={subsubgroup}
                                      onItemUpdate={handleItemUpdate}
                                      startEditing={startEditing}
                                      stopEditing={stopEditing}
                                      isEditing={isEditing}
                                  />
                                ))}
                                
                                {!collapsed[subsubgroup.id] && addingRow[subsubgroup.id] && (
                                  <AddRowForm
                                    newRow={newRow[subsubgroup.id] || { name: "", significado: "" }}
                                    onUpdateField={(field, value) => updateNewRow(subsubgroup.id, field, value)}
                                    onSave={() => handleSaveRow(subsubgroup.id)}
                                    onCancel={() => cancelAddingRow(subsubgroup.id)}
                                  />
                                )}
                              </React.Fragment>
                            ))}
                            
                            {/* Renderizar itens do subgrupo */}
                            {subgroup.items?.map((item) => 
                              renderItemRowConditional(
                                item,
                                subgroup,
                                processedData.itemTotals[item.id] || Array(12).fill(0),
                                processedData.itemAnnualTotals[item.id] || 0,
                                processedData.itemPercentages[item.id] || 0
                              )
                            )}
                            
                            {/* Renderizar novos itens criados */}
                            {Object.entries(newItems)
                              .filter(([, item]) => item.groupId === subgroup.id)
                              .map(([itemId, item]) => (
                                <NewItemRow
                                  key={itemId}
                                  item={item}
                                  group={subgroup}
                                  onItemUpdate={handleItemUpdate}
                                  startEditing={startEditing}
                                  stopEditing={stopEditing}
                                  isEditing={isEditing}
                              />
                            ))}
                            
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
                      </React.Fragment>
                    ))}
                    
                    {/* Renderizar itens do grupo principal */}
                    {group.items?.map((item) => 
                      renderItemRowConditional(
                        item,
                        group,
                        processedData.itemTotals[item.id] || Array(12).fill(0),
                        processedData.itemAnnualTotals[item.id] || 0,
                        processedData.itemPercentages[item.id] || 0
                      )
                    )}
                    
                    {/* Renderizar novos itens criados */}
                    {Object.entries(newItems)
                      .filter(([, item]) => item.groupId === group.id)
                      .map(([itemId, item]) => (
                        <NewItemRow
                          key={itemId}
                          item={item}
                          group={group}
                          onItemUpdate={handleItemUpdate}
                          startEditing={startEditing}
                          stopEditing={stopEditing}
                          isEditing={isEditing}
                      />
                    ))}
                    
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
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
