import { useState, useCallback } from "react";
import { CashflowItem, CashflowValue } from "@/types/cashflow";

export interface EditableItemData {
  id: string;
  name: string;
  significado: string | null;
  rank: number | null;
  monthlyValues: number[]; // 12 valores mensais
}

export interface GroupEditState {
  editingGroups: Set<string>;
  editedItems: Map<string, EditableItemData>;
  deletedItemIds: Set<string>;
}

export const useGroupEditMode = () => {
  const [editingGroups, setEditingGroups] = useState<Set<string>>(new Set());
  const [editedItems, setEditedItems] = useState<Map<string, EditableItemData>>(new Map());
  const [deletedItemIds, setDeletedItemIds] = useState<Set<string>>(new Set());

  const startEditing = useCallback((groupId: string, items: CashflowItem[]) => {
    setEditingGroups((prev) => new Set(prev).add(groupId));
    
    // Inicializar estado de edição com dados atuais
    const initialData = new Map<string, EditableItemData>();
    items.forEach((item) => {
      // Criar array de 12 valores mensais (0-11 para janeiro-dezembro)
      const monthlyValues = Array(12).fill(0);
      item.values?.forEach((value: CashflowValue) => {
        if (value.month >= 0 && value.month < 12) {
          monthlyValues[value.month] = value.value;
        }
      });

      initialData.set(item.id, {
        id: item.id,
        name: item.name,
        significado: item.significado,
        rank: item.rank,
        monthlyValues,
      });
    });
    
    setEditedItems((prev) => {
      const merged = new Map(prev);
      initialData.forEach((value, key) => {
        merged.set(key, value);
      });
      return merged;
    });
    setDeletedItemIds((prev) => {
      const newSet = new Set(prev);
      // Remover IDs que não estão mais no grupo
      newSet.forEach((id) => {
        if (!items.find((item) => item.id === id)) {
          newSet.delete(id);
        }
      });
      return newSet;
    });
  }, []);

  const stopEditing = useCallback((groupId: string, items: CashflowItem[]) => {
    setEditingGroups((prev) => {
      const newSet = new Set(prev);
      newSet.delete(groupId);
      return newSet;
    });
    
    // Limpar dados editados deste grupo
    setEditedItems((prev) => {
      const newMap = new Map(prev);
      // Remover itens que pertencem a este grupo
      items.forEach((item) => {
        if (item.groupId === groupId) {
          newMap.delete(item.id);
        }
      });
      return newMap;
    });
    
    setDeletedItemIds((prev) => {
      const newSet = new Set(prev);
      items.forEach((item) => {
        if (item.groupId === groupId) {
          newSet.delete(item.id);
        }
      });
      return newSet;
    });
  }, []);

  const isEditing = useCallback((groupId: string) => {
    return editingGroups.has(groupId);
  }, [editingGroups]);

  const updateItemField = useCallback((
    itemId: string,
    field: "name" | "significado" | "rank" | "monthlyValue",
    value: string | number | null,
    monthIndex?: number
  ) => {
    setEditedItems((prev) => {
      const newMap = new Map(prev);
      const current = newMap.get(itemId);
      
      if (!current) return prev;

      const updated: EditableItemData = { ...current };
      
      if (field === "name") {
        updated.name = value as string;
      } else if (field === "significado") {
        updated.significado = value as string | null;
      } else if (field === "rank") {
        updated.rank = value === null || value === "" ? null : parseInt(value.toString(), 10);
      } else if (field === "monthlyValue" && typeof monthIndex === "number") {
        updated.monthlyValues = [...updated.monthlyValues];
        updated.monthlyValues[monthIndex] = typeof value === "number" ? value : 0;
      }

      newMap.set(itemId, updated);
      return newMap;
    });
  }, []);

  const deleteItem = useCallback((itemId: string) => {
    setDeletedItemIds((prev) => new Set(prev).add(itemId));
    setEditedItems((prev) => {
      const newMap = new Map(prev);
      newMap.delete(itemId);
      return newMap;
    });
  }, []);

  const restoreItem = useCallback((itemId: string) => {
    setDeletedItemIds((prev) => {
      const newSet = new Set(prev);
      newSet.delete(itemId);
      return newSet;
    });
  }, []);

  const cancelEditing = useCallback((groupId: string, originalItems: CashflowItem[]) => {
    setEditingGroups((prev) => {
      const newSet = new Set(prev);
      newSet.delete(groupId);
      return newSet;
    });
    
    // Restaurar dados originais
    const initialData = new Map<string, EditableItemData>();
    originalItems.forEach((item) => {
      const monthlyValues = Array(12).fill(0);
      item.values?.forEach((value: CashflowValue) => {
        if (value.month >= 0 && value.month < 12) {
          monthlyValues[value.month] = value.value;
        }
      });

      initialData.set(item.id, {
        id: item.id,
        name: item.name,
        significado: item.significado,
        rank: item.rank,
        monthlyValues,
      });
    });
    
    setEditedItems((prev) => {
      const merged = new Map(prev);
      originalItems.forEach((item) => {
        if (item.groupId === groupId) {
          const original = initialData.get(item.id);
          if (original) {
            merged.set(item.id, original);
          } else {
            merged.delete(item.id);
          }
        }
      });
      return merged;
    });
    
    setDeletedItemIds((prev) => {
      const newSet = new Set(prev);
      originalItems.forEach((item) => {
        if (item.groupId === groupId) {
          newSet.delete(item.id);
        }
      });
      return newSet;
    });
  }, []);

  const getEditedItem = useCallback((itemId: string): EditableItemData | null => {
    return editedItems.get(itemId) || null;
  }, [editedItems]);

  const isItemDeleted = useCallback((itemId: string) => {
    return deletedItemIds.has(itemId);
  }, [deletedItemIds]);

  const getChangesForGroup = useCallback((groupId: string, allItems: CashflowItem[]) => {
    const groupItems = allItems.filter((item) => item.groupId === groupId);
    const changes: {
      updates: Array<{
        itemId: string;
        name?: string;
        significado?: string | null;
        rank?: number | null;
        values?: Array<{ month: number; value: number }>;
      }>;
      deletes: string[];
    } = {
      updates: [],
      deletes: [],
    };

    // Adicionar itens deletados
    groupItems.forEach((item) => {
      if (deletedItemIds.has(item.id)) {
        changes.deletes.push(item.id);
      }
    });

    // Adicionar itens modificados
    groupItems.forEach((item) => {
      if (deletedItemIds.has(item.id)) return;

      const edited = editedItems.get(item.id);
      if (!edited) return;

      const update: any = { itemId: item.id };
      let hasChanges = false;

      if (edited.name !== item.name) {
        update.name = edited.name;
        hasChanges = true;
      }

      if (edited.significado !== item.significado) {
        update.significado = edited.significado;
        hasChanges = true;
      }

      if (edited.rank !== item.rank) {
        update.rank = edited.rank;
        hasChanges = true;
      }

      // Verificar mudanças nos valores mensais
      const originalValues = new Map<number, number>();
      item.values?.forEach((value: CashflowValue) => {
        if (value.month >= 0 && value.month < 12) {
          originalValues.set(value.month, value.value);
        }
      });

      const valueChanges: Array<{ month: number; value: number }> = [];
      edited.monthlyValues.forEach((newValue, monthIndex) => {
        const originalValue = originalValues.get(monthIndex) || 0;
        if (Math.abs(newValue - originalValue) > 0.01) {
          valueChanges.push({ month: monthIndex, value: newValue });
          hasChanges = true;
        }
      });

      if (valueChanges.length > 0) {
        update.values = valueChanges;
      }

      if (hasChanges) {
        changes.updates.push(update);
      }
    });

    return changes;
  }, [editedItems, deletedItemIds]);

  return {
    startEditing,
    stopEditing,
    isEditing,
    updateItemField,
    deleteItem,
    restoreItem,
    cancelEditing,
    getEditedItem,
    isItemDeleted,
    getChangesForGroup,
  };
};

