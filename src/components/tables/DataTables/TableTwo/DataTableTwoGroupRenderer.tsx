'use client';
import React from 'react';
import { GroupHeader, AddRowForm, NewItemRow } from '@/components/cashflow';
import { CashflowGroup, CashflowItem } from '@/types/cashflow';
import { GroupRenderContext } from './dataTableTwoTypes';
import { SpacingRow } from '@/components/cashflow/GridCells';
import { groupLevel } from '@/components/cashflow/groupLevel';

interface GroupItemsRendererProps {
  group: CashflowGroup;
  ctx: GroupRenderContext;
}

function renderGroupHeaderProps(group: CashflowGroup, ctx: GroupRenderContext) {
  return {
    group,
    isCollapsed: ctx.collapsed[group.id] || false,
    groupTotals: ctx.processedData.groupTotals[group.id] || Array(12).fill(0),
    groupAnnualTotal: ctx.processedData.groupAnnualTotals[group.id] || 0,
    groupPercentage: ctx.processedData.groupPercentages[group.id] || 0,
    onToggleCollapse: () => ctx.toggleCollapse(group.id),
    onAddRow: () => ctx.startAddingRow(group.id),
    isEditing: ctx.isGroupEditing(group.id),
    onStartEdit: () => ctx.handleStartGroupEdit(group),
    onSave: () => ctx.handleSaveGroup(group),
    onCancel: () => ctx.handleCancelGroupEdit(group),
    saving: ctx.savingGroups.has(group.id),
    selectedColor: ctx.isGroupEditing(group.id) ? ctx.selectedColor : null,
    onColorSelect: ctx.isGroupEditing(group.id) ? ctx.setSelectedColor : undefined,
    isCommentModeActive: ctx.isGroupEditing(group.id) ? ctx.isCommentModeActive : false,
    onCommentClick: ctx.isGroupEditing(group.id) ? ctx.handleCommentButtonClick : undefined,
  };
}

function renderItems(
  items: CashflowItem[] | undefined,
  group: CashflowGroup,
  ctx: GroupRenderContext,
) {
  return items?.map((item) =>
    ctx.renderItemRowConditional(
      item,
      group,
      ctx.processedData.itemTotals[item.id] || Array(12).fill(0),
      ctx.processedData.itemAnnualTotals[item.id] || 0,
      ctx.processedData.itemPercentages[item.id] || 0,
    ),
  );
}

function renderNewItems(group: CashflowGroup, ctx: GroupRenderContext) {
  return Object.entries(ctx.newItems)
    .filter(([, item]) => item.groupId === group.id)
    .map(([itemId, item]) => <NewItemRow key={itemId} item={item} />);
}

function renderAddRowForm(group: CashflowGroup, ctx: GroupRenderContext) {
  if (!ctx.addingRow[group.id]) return null;
  return (
    <AddRowForm
      newRow={ctx.newRow[group.id] || { name: '', significado: '' }}
      onUpdateField={(field, value) => ctx.updateNewRow(group.id, field, value)}
      onSave={() => ctx.handleSaveRow(group.id)}
      onCancel={() => ctx.cancelAddingRow(group.id)}
    />
  );
}

function SubSubGroupRendererComponent({
  subsubgroup,
  ctx,
}: {
  subsubgroup: CashflowGroup;
  ctx: GroupRenderContext;
}) {
  return (
    <React.Fragment key={subsubgroup.id}>
      {groupLevel(subsubgroup) <= 2 && <SpacingRow />}
      <GroupHeader {...renderGroupHeaderProps(subsubgroup, ctx)} />
      {!ctx.collapsed[subsubgroup.id] && renderItems(subsubgroup.items, subsubgroup, ctx)}
      {renderNewItems(subsubgroup, ctx)}
      {!ctx.collapsed[subsubgroup.id] && renderAddRowForm(subsubgroup, ctx)}
    </React.Fragment>
  );
}

function SubGroupRendererComponent({
  subgroup,
  ctx,
  extraAfterItems,
}: {
  subgroup: CashflowGroup;
  ctx: GroupRenderContext;
  extraAfterItems?: React.ReactNode;
}) {
  return (
    <React.Fragment key={subgroup.id}>
      {/* Respiro antes de seções de nível 1 e 2 (substitui as listas de
          nomes needsSpacingBefore/After e seus casos especiais). */}
      {groupLevel(subgroup) <= 2 && <SpacingRow />}
      <GroupHeader {...renderGroupHeaderProps(subgroup, ctx)} />

      {!ctx.collapsed[subgroup.id] && (
        <>
          {subgroup.children?.map((subsubgroup) => (
            <SubSubGroupRenderer key={subsubgroup.id} subsubgroup={subsubgroup} ctx={ctx} />
          ))}
          {renderItems(subgroup.items, subgroup, ctx)}
          {renderNewItems(subgroup, ctx)}
          {renderAddRowForm(subgroup, ctx)}
          {extraAfterItems}
        </>
      )}
    </React.Fragment>
  );
}

function DataTableTwoGroupRendererComponent({ group, ctx }: GroupItemsRendererProps) {
  return (
    <>
      {renderItems(group.items, group, ctx)}
      {renderNewItems(group, ctx)}
      {renderAddRowForm(group, ctx)}
    </>
  );
}

export { renderGroupHeaderProps };

// Memo nos renderers de grupo: quando o ctx (memoizado no DataTableTwo) e os
// grupos não mudam, subtrees inteiras são puladas em re-renders globais.
export const SubSubGroupRenderer = React.memo(SubSubGroupRendererComponent);
export const SubGroupRenderer = React.memo(SubGroupRendererComponent);
const DataTableTwoGroupRenderer = React.memo(DataTableTwoGroupRendererComponent);
export default DataTableTwoGroupRenderer;
