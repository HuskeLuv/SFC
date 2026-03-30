'use client';
import React from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { GroupHeader, AddRowForm, NewItemRow } from '@/components/cashflow';
import { CashflowGroup, CashflowItem } from '@/types/cashflow';
import { GroupRenderContext } from './dataTableTwoTypes';

interface GroupItemsRendererProps {
  group: CashflowGroup;
  ctx: GroupRenderContext;
}

function needsSpacingBefore(groupName: string) {
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
}

function needsSpacingAfter(groupName: string) {
  const groupsWithSpacingAfter = [
    'Entradas Fixas',
    'Entradas Variáveis',
    'Sem Tributação',
    'Com Tributação',
    'Despesas',
    'Despesas Fixas',
  ];
  return groupsWithSpacingAfter.includes(groupName);
}

export function SpacingRow() {
  return (
    <TableRow>
      <TableCell colSpan={100} className="h-[10px] p-0 border-0"></TableCell>
    </TableRow>
  );
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
    showActionsColumn: ctx.isGroupEditing(group.id),
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
  return items?.map((item, itemIndex, allItems) => {
    const hasNewItems = Object.entries(ctx.newItems).some(
      ([, newItem]) => newItem.groupId === group.id,
    );
    const isLastItem =
      !hasNewItems && !ctx.addingRow[group.id] && itemIndex === allItems.length - 1;
    return ctx.renderItemRowConditional(
      item,
      group,
      ctx.processedData.itemTotals[item.id] || Array(12).fill(0),
      ctx.processedData.itemAnnualTotals[item.id] || 0,
      ctx.processedData.itemPercentages[item.id] || 0,
      isLastItem,
    );
  });
}

function renderNewItems(group: CashflowGroup, ctx: GroupRenderContext) {
  return Object.entries(ctx.newItems)
    .filter(([, item]) => item.groupId === group.id)
    .map(([itemId, item], itemIndex, entries) => {
      const isLastNewItem = !ctx.addingRow[group.id] && itemIndex === entries.length - 1;
      return (
        <NewItemRow
          key={itemId}
          item={item}
          group={group}
          onItemUpdate={ctx.handleItemUpdate}
          startEditing={ctx.startEditing}
          stopEditing={ctx.stopEditing}
          isEditing={ctx.isEditing}
          isLastItem={isLastNewItem}
        />
      );
    });
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

export function SubSubGroupRenderer({
  subsubgroup,
  parentGroup,
  subsubgroupIndex,
  ctx,
}: {
  subsubgroup: CashflowGroup;
  parentGroup: CashflowGroup;
  subsubgroupIndex: number;
  ctx: GroupRenderContext;
}) {
  const shouldSpaceSubSubBefore =
    needsSpacingBefore(subsubgroup.name) &&
    (subsubgroup.name === 'Habitação' ||
      !(subsubgroupIndex === 0 && needsSpacingBefore(parentGroup.name)));

  return (
    <React.Fragment key={subsubgroup.id}>
      {shouldSpaceSubSubBefore && <SpacingRow />}
      <GroupHeader {...renderGroupHeaderProps(subsubgroup, ctx)} />

      {!ctx.collapsed[subsubgroup.id] && renderItems(subsubgroup.items, subsubgroup, ctx)}
      {renderNewItems(subsubgroup, ctx)}
      {!ctx.collapsed[subsubgroup.id] && renderAddRowForm(subsubgroup, ctx)}
      {needsSpacingAfter(subsubgroup.name) && <SpacingRow />}
    </React.Fragment>
  );
}

export function SubGroupRenderer({
  subgroup,
  subgroupIndex,
  subgroups,
  ctx,
  extraAfterItems,
}: {
  subgroup: CashflowGroup;
  subgroupIndex: number;
  subgroups: CashflowGroup[];
  ctx: GroupRenderContext;
  extraAfterItems?: React.ReactNode;
}) {
  const previousSubgroup = subgroupIndex > 0 ? subgroups[subgroupIndex - 1] : null;
  const shouldSpaceBefore =
    needsSpacingBefore(subgroup.name) &&
    (subgroup.name === 'Despesas Fixas' ||
      ((subgroup.name === 'Despesas Variáveis'
        ? !(previousSubgroup && needsSpacingAfter(previousSubgroup.name))
        : true) &&
        !(subgroupIndex === 0 && needsSpacingBefore(subgroup.name))));

  return (
    <React.Fragment key={subgroup.id}>
      {shouldSpaceBefore && <SpacingRow />}
      <GroupHeader {...renderGroupHeaderProps(subgroup, ctx)} />

      {!ctx.collapsed[subgroup.id] && (
        <>
          {subgroup.children?.map((subsubgroup, subsubgroupIndex) => (
            <SubSubGroupRenderer
              key={subsubgroup.id}
              subsubgroup={subsubgroup}
              parentGroup={subgroup}
              subsubgroupIndex={subsubgroupIndex}
              ctx={ctx}
            />
          ))}
          {renderItems(subgroup.items, subgroup, ctx)}
          {renderNewItems(subgroup, ctx)}
          {renderAddRowForm(subgroup, ctx)}
          {extraAfterItems}
        </>
      )}
      {needsSpacingAfter(subgroup.name) && <SpacingRow />}
    </React.Fragment>
  );
}

export default function DataTableTwoGroupRenderer({ group, ctx }: GroupItemsRendererProps) {
  return (
    <>
      {renderItems(group.items, group, ctx)}
      {renderNewItems(group, ctx)}
      {renderAddRowForm(group, ctx)}
    </>
  );
}

export { needsSpacingBefore, needsSpacingAfter, renderGroupHeaderProps };
