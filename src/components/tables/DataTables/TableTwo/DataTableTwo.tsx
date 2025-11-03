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
  NewItemRow
} from "@/components/cashflow";
import { CashflowItem } from "@/types/cashflow";
import { createCashflowItem } from "@/utils/cashflowUpdate";
import { useCellEditing } from "@/hooks/useCellEditing";

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

  // Shared editing state for all ItemRow components
  const { startEditing, stopEditing, isEditing } = useCellEditing();

  const handleSaveRow = useCallback(async (groupId: string) => {
    const row = newRow[groupId];
    if (!row) return;

    const error = validateNewRow(row);
    if (error) {
      showAlert("error", "Erro ao adicionar", error);
      return;
    }

    try {
      const newItem = await createCashflowItem(groupId, row.descricao, row.significado);
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
          <TableHeaderComponent />
          <TableBody>
            {processedData.groups
              .filter((group) => group.name !== 'Investimentos')
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
                                />
                                
                                {!collapsed[subsubgroup.id] && subsubgroup.items?.map((item) => (
                                  <ItemRow
                                    key={item.id}
                                    item={item}
                                    itemTotals={processedData.itemTotals[item.id] || Array(12).fill(0)}
                                    itemAnnualTotal={processedData.itemAnnualTotals[item.id] || 0}
                                    itemPercentage={processedData.itemPercentages[item.id] || 0}
                                    group={subsubgroup}
                                    onItemUpdate={handleItemUpdate}
                                    startEditing={startEditing}
                                    stopEditing={stopEditing}
                                    isEditing={isEditing}
                                  />
                                ))}
                                
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
                                    newRow={newRow[subsubgroup.id] || { descricao: "", significado: "", percentTotal: 0 }}
                                    onUpdateField={(field, value) => updateNewRow(subsubgroup.id, field, value)}
                                    onSave={() => handleSaveRow(subsubgroup.id)}
                                    onCancel={() => cancelAddingRow(subsubgroup.id)}
                                  />
                                )}
                              </React.Fragment>
                            ))}
                            
                            {/* Renderizar itens do subgrupo */}
                            {subgroup.items?.map((item) => (
                              <ItemRow
                                key={item.id}
                                item={item}
                                itemTotals={processedData.itemTotals[item.id] || Array(12).fill(0)}
                                itemAnnualTotal={processedData.itemAnnualTotals[item.id] || 0}
                                itemPercentage={processedData.itemPercentages[item.id] || 0}
                                group={subgroup}
                                onItemUpdate={handleItemUpdate}
                                startEditing={startEditing}
                                stopEditing={stopEditing}
                                isEditing={isEditing}
                              />
                            ))}
                            
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
                                newRow={newRow[subgroup.id] || { descricao: "", significado: "", percentTotal: 0 }}
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
                    {group.items?.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        itemTotals={processedData.itemTotals[item.id] || Array(12).fill(0)}
                        itemAnnualTotal={processedData.itemAnnualTotals[item.id] || 0}
                        itemPercentage={processedData.itemPercentages[item.id] || 0}
                        group={group}
                        onItemUpdate={handleItemUpdate}
                        startEditing={startEditing}
                        stopEditing={stopEditing}
                        isEditing={isEditing}
                      />
                    ))}
                    
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
                        newRow={newRow[group.id] || { descricao: "", significado: "", percentTotal: 0 }}
                        onUpdateField={(field, value) => updateNewRow(group.id, field, value)}
                        onSave={() => handleSaveRow(group.id)}
                        onCancel={() => cancelAddingRow(group.id)}
                      />
                    )}
                  </>
                )}
              </React.Fragment>
            ))}
            
            {/* Renderizar Saldo antes de Investimentos */}
            <TotalRow
              totalByMonth={processedData.totalByMonth}
              totalAnnual={processedData.totalAnnual}
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
                                />
                                
                                {!collapsed[subsubgroup.id] && subsubgroup.items?.map((item) => (
                                  <ItemRow
                                    key={item.id}
                                    item={item}
                                    itemTotals={processedData.itemTotals[item.id] || Array(12).fill(0)}
                                    itemAnnualTotal={processedData.itemAnnualTotals[item.id] || 0}
                                    itemPercentage={processedData.itemPercentages[item.id] || 0}
                                    group={subsubgroup}
                                    onItemUpdate={handleItemUpdate}
                                    startEditing={startEditing}
                                    stopEditing={stopEditing}
                                    isEditing={isEditing}
                                  />
                                ))}
                                
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
                                    newRow={newRow[subsubgroup.id] || { descricao: "", significado: "", percentTotal: 0 }}
                                    onUpdateField={(field, value) => updateNewRow(subsubgroup.id, field, value)}
                                    onSave={() => handleSaveRow(subsubgroup.id)}
                                    onCancel={() => cancelAddingRow(subsubgroup.id)}
                                  />
                                )}
                              </React.Fragment>
                            ))}
                            
                            {/* Renderizar itens do subgrupo */}
                            {subgroup.items?.map((item) => (
                              <ItemRow
                                key={item.id}
                                item={item}
                                itemTotals={processedData.itemTotals[item.id] || Array(12).fill(0)}
                                itemAnnualTotal={processedData.itemAnnualTotals[item.id] || 0}
                                itemPercentage={processedData.itemPercentages[item.id] || 0}
                                group={subgroup}
                                onItemUpdate={handleItemUpdate}
                                startEditing={startEditing}
                                stopEditing={stopEditing}
                                isEditing={isEditing}
                              />
                            ))}
                            
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
                                newRow={newRow[subgroup.id] || { descricao: "", significado: "", percentTotal: 0 }}
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
                    {group.items?.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        itemTotals={processedData.itemTotals[item.id] || Array(12).fill(0)}
                        itemAnnualTotal={processedData.itemAnnualTotals[item.id] || 0}
                        itemPercentage={processedData.itemPercentages[item.id] || 0}
                        group={group}
                        onItemUpdate={handleItemUpdate}
                        startEditing={startEditing}
                        stopEditing={stopEditing}
                        isEditing={isEditing}
                      />
                    ))}
                    
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
                        newRow={newRow[group.id] || { descricao: "", significado: "", percentTotal: 0 }}
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
