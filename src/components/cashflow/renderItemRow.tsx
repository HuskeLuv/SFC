import React from "react";
import { CashflowItem, CashflowGroup } from "@/types/cashflow";
import { ItemRow } from "./ItemRow";
import { EditableItemRow } from "./EditableItemRow";

interface RenderItemRowProps {
  item: CashflowItem;
  group: CashflowGroup;
  itemTotals: number[];
  itemAnnualTotal: number;
  itemPercentage: number;
  isGroupEditing: boolean;
  editedData: ReturnType<typeof import("@/hooks/useGroupEditMode").useGroupEditMode>["getEditedItem"];
  isItemDeleted: ReturnType<typeof import("@/hooks/useGroupEditMode").useGroupEditMode>["isItemDeleted"];
  onUpdateField: ReturnType<typeof import("@/hooks/useGroupEditMode").useGroupEditMode>["updateItemField"];
  onDeleteItem: ReturnType<typeof import("@/hooks/useGroupEditMode").useGroupEditMode>["deleteItem"];
  onItemUpdate?: (updatedItem: CashflowItem) => void;
  startEditing: (itemId: string, field: string, monthIndex?: number) => void;
  stopEditing: () => void;
  isEditing: (itemId: string, field: string, monthIndex?: number) => boolean;
}

export const renderItemRow = ({
  item,
  group,
  itemTotals,
  itemAnnualTotal,
  itemPercentage,
  isGroupEditing,
  editedData,
  isItemDeleted,
  onUpdateField,
  onDeleteItem,
  onItemUpdate,
  startEditing,
  stopEditing,
  isEditing,
}: RenderItemRowProps) => {
  if (isGroupEditing) {
    // Modo de edição controlada
    if (isItemDeleted(item.id)) {
      return null; // Não renderizar itens deletados
    }
    return (
      <EditableItemRow
        key={item.id}
        item={item}
        editedData={editedData(item.id)}
        group={group}
        itemTotals={itemTotals}
        itemAnnualTotal={itemAnnualTotal}
        itemPercentage={itemPercentage}
        isEditing={true}
        onUpdateField={onUpdateField}
        onDeleteItem={onDeleteItem}
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
        onItemUpdate={onItemUpdate}
        startEditing={startEditing}
        stopEditing={stopEditing}
        isEditing={isEditing}
      />
    );
  }
};

