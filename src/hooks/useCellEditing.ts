import { useState, useCallback } from "react";

interface EditingCell {
  itemId: string;
  field: string;
  monthIndex?: number; // For monthly values
}

export const useCellEditing = () => {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const startEditing = useCallback((itemId: string, field: string, monthIndex?: number) => {
    setEditingCell({ itemId, field, monthIndex });
  }, []);

  const stopEditing = useCallback(() => {
    setEditingCell(null);
  }, []);

  const isEditing = useCallback((itemId: string, field: string, monthIndex?: number) => {
    if (!editingCell) return false;
    return editingCell.itemId === itemId && 
           editingCell.field === field && 
           editingCell.monthIndex === monthIndex;
  }, [editingCell]);

  return {
    editingCell,
    startEditing,
    stopEditing,
    isEditing
  };
}; 