import React, { useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/utils/formatters";
import { FIXED_COLUMN_BODY_STYLES } from "./fixedColumns";
import { CurrencyInput } from "./CurrencyInput";
import { EditButton } from "./EditButton";
import { SaveCancelButtons } from "./SaveCancelButtons";

const PREVIOUS_MONTH_BALANCE_ID = "previous-month-balance";

interface PreviousMonthBalanceRowProps {
  valuesByMonth: number[];
  totalAnnual: number;
  showActionsColumn?: boolean;
  onUpdateValues?: (values: number[]) => void;
  startEditing?: (itemId: string, field: string, monthIndex?: number) => void;
  stopEditing?: () => void;
  isEditing?: (itemId: string, field: string, monthIndex?: number) => boolean;
  isRowEditing?: boolean;
  onStartRowEdit?: () => void;
  onSaveRowEdit?: () => void;
  onCancelRowEdit?: () => void;
}

export const PreviousMonthBalanceRow: React.FC<PreviousMonthBalanceRowProps> = ({ 
  valuesByMonth,
  totalAnnual,
  showActionsColumn = false,
  onUpdateValues,
  startEditing,
  stopEditing,
  isEditing,
  isRowEditing = false,
  onStartRowEdit,
  onSaveRowEdit,
  onCancelRowEdit,
}) => {
  const [localValues, setLocalValues] = useState<number[]>(valuesByMonth);
  const [editedValues, setEditedValues] = useState<number[]>(valuesByMonth);

  // Sincronizar valores quando props mudarem
  React.useEffect(() => {
    setLocalValues(valuesByMonth);
    if (!isRowEditing) {
      setEditedValues(valuesByMonth);
    }
  }, [valuesByMonth, isRowEditing]);

  const handleStartEdit = () => {
    setEditedValues([...valuesByMonth]);
    if (onStartRowEdit) {
      onStartRowEdit();
    }
  };

  const handleSave = () => {
    setLocalValues([...editedValues]);
    if (onUpdateValues) {
      onUpdateValues(editedValues);
    }
    if (onSaveRowEdit) {
      onSaveRowEdit();
    }
  };

  const handleCancel = () => {
    setEditedValues([...valuesByMonth]);
    if (onCancelRowEdit) {
      onCancelRowEdit();
    }
  };

  const handleValueChange = (index: number, value: number) => {
    if (isRowEditing) {
      const newValues = [...editedValues];
      newValues[index] = value;
      setEditedValues(newValues);
    } else {
      const newValues = [...localValues];
      newValues[index] = value;
      setLocalValues(newValues);
      if (onUpdateValues) {
        onUpdateValues(newValues);
      }
    }
  };

  const handleCellClick = (index: number) => {
    if (!isRowEditing && startEditing) {
      startEditing(PREVIOUS_MONTH_BALANCE_ID, "monthlyValue", index);
    }
  };

  const displayValues = isRowEditing ? editedValues : localValues;
  const calculatedTotal = displayValues.reduce((sum, val) => sum + val, 0);

  return (
    <TableRow className="h-6 bg-[#998256] text-white w-full" style={{ fontFamily: 'Calibri, sans-serif', fontSize: '12px' }}>
      <TableCell 
        className="px-2 font-bold text-white text-xs text-left h-6 leading-6 whitespace-nowrap border-t border-b border-l border-gray-200 border-r-0"
        style={{ 
          position: 'sticky',
          backgroundColor: '#998256',
          ...FIXED_COLUMN_BODY_STYLES[0],
          overflow: 'hidden',
          flexShrink: 0,
          borderRight: 'none'
        }}
      >
        <div className="flex items-center gap-1">
          <span>Saldo do mês anterior</span>
          {!isRowEditing && onStartRowEdit && (
            <EditButton onClick={handleStartEdit} />
          )}
          {isRowEditing && onSaveRowEdit && onCancelRowEdit && (
            <SaveCancelButtons 
              onSave={handleSave} 
              onCancel={handleCancel} 
              saving={false}
            />
          )}
        </div>
      </TableCell>
      <TableCell 
        className="px-2 font-bold text-white text-xs h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0"
        style={{ 
          position: 'sticky',
          backgroundColor: '#998256',
          ...FIXED_COLUMN_BODY_STYLES[1],
          overflow: 'hidden',
          flexShrink: 0,
          borderLeft: 'none',
          borderRight: 'none'
        }}
      >
        -
      </TableCell>
      <TableCell 
        className="px-2 font-bold text-white text-xs text-center h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r-0"
        style={{ 
          position: 'sticky',
          backgroundColor: '#998256',
          ...FIXED_COLUMN_BODY_STYLES[2],
          overflow: 'hidden',
          flexShrink: 0,
          borderLeft: 'none',
          borderRight: 'none'
        }}
      >
        -
      </TableCell>
      <TableCell 
        className="px-2 font-bold text-white text-xs text-right h-6 leading-6 whitespace-nowrap border-t border-b border-gray-200 border-l-0 border-r border-gray-300"
        style={{ 
          position: 'sticky',
          backgroundColor: '#998256',
          ...FIXED_COLUMN_BODY_STYLES[3],
          overflow: 'hidden',
          flexShrink: 0,
          borderLeft: 'none'
        }}
      >
        -
      </TableCell>
      {displayValues.map((value, index) => {
        const cellIsEditing = isRowEditing || (isEditing ? isEditing(PREVIOUS_MONTH_BALANCE_ID, "monthlyValue", index) : false);
        
        return (
          <TableCell 
            key={index} 
            className={`px-1 font-bold text-white border-t border-b border-gray-200 border-r border-gray-200 text-xs text-right h-6 leading-6 ${
              index === 0 ? 'border-l-0' : 'border-l border-gray-200'
            } ${cellIsEditing ? '' : !isRowEditing ? 'cursor-pointer hover:bg-opacity-80' : ''}`}
          >
            <div 
              onClick={() => !cellIsEditing && !isRowEditing && handleCellClick(index)}
              className="w-full h-full"
            >
              {cellIsEditing ? (
                <CurrencyInput
                  value={value}
                  onChange={(newValue) => {
                    handleValueChange(index, newValue);
                  }}
                  onBlur={() => {
                    if (!isRowEditing && stopEditing) {
                      stopEditing();
                    }
                  }}
                  className="text-right h-6 leading-6 text-xs px-1"
                  style={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    color: 'white',
                    borderColor: 'rgba(255, 255, 255, 0.4)',
                    minWidth: '100%',
                    width: '100%'
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span>{formatCurrency(value || 0)}</span>
              )}
            </div>
          </TableCell>
        );
      })}
      {/* Coluna vazia para espaçamento */}
      <TableCell className="px-0 w-[10px] h-6 leading-6 bg-white dark:bg-white"></TableCell>
      <TableCell className="px-2 font-bold text-white border-t border-b border-gray-200 border border-gray-200 text-xs text-right h-6 leading-6" style={{ minWidth: '4rem' }}>
        {formatCurrency(calculatedTotal)}
      </TableCell>
      {showActionsColumn && (
        <TableCell className="px-2 border border-gray-200 w-8 h-6 leading-6"></TableCell>
      )}
    </TableRow>
  );
};

