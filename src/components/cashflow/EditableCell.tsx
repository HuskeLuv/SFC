import React, { useState, useRef, useEffect } from "react";
import { TableCell } from "@/components/ui/table";
import { ActionButtons } from "./ActionButtons";
import { formatCurrency, formatPercent } from "@/utils/formatters";

interface EditableCellProps {
  value: string | number;
  onSave: (newValue: string | number) => void;
  onCancel: () => void;
  isEditing: boolean;
  onStartEdit: () => void;
  type?: "text" | "number" | "currency" | "percent";
  className?: string;
  placeholder?: string;
  globalEditMode?: boolean;
}

export const EditableCell: React.FC<EditableCellProps> = ({
  value,
  onSave,
  onCancel,
  isEditing,
  type = "text",
  className = "",
  placeholder = "",
  globalEditMode = false
}) => {
  const [editValue, setEditValue] = useState<string>(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Update editValue when value prop changes
  useEffect(() => {
    setEditValue(value.toString());
  }, [value]);

  const handleSave = () => {
    let processedValue: string | number = editValue;
    
    if (type === "number" || type === "currency" || type === "percent") {
      const numValue = parseFloat(editValue);
      if (isNaN(numValue)) {
        return; // Don't save invalid numbers
      }
      processedValue = numValue;
    }
    
    onSave(processedValue);
  };

  const handleCancel = () => {
    setEditValue(value.toString());
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  const formatDisplayValue = (val: string | number) => {
    if (type === "currency" && typeof val === "number") {
      return formatCurrency(val);
    } else if (type === "percent" && typeof val === "number") {
      return formatPercent(val);
    }
    return val.toString();
  };

  // Determine input type and remove arrows for currency/percentage
  const getInputType = () => {
    if (type === "currency" || type === "percent") {
      return "text"; // Use text to avoid increment/decrement arrows
    }
    return type === "number" ? "number" : "text";
  };

  const getRawValue = (val: string | number) => {
    if (type === "currency" && typeof val === "number") {
      return val.toString();
    } else if (type === "percent" && typeof val === "number") {
      return val.toString();
    }
    return val.toString();
  };

  if (isEditing) {
    return (
      <TableCell className={className}>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type={getInputType()}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-1 py-0.5 rounded border border-gray-300 text-xs bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            placeholder={placeholder}
            step={type === "currency" || type === "percent" ? "0.01" : "1"}
            min={type === "number" || type === "currency" || type === "percent" ? "0" : undefined}
          />
          <ActionButtons onSave={handleSave} onCancel={handleCancel} />
        </div>
      </TableCell>
    );
  }

  return (
    <TableCell className={className}>
      {globalEditMode ? (
        <div className="flex items-center gap-2">
          <input
            type={getInputType()}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={(e) => {
              const newValue = e.target.value;
              const currentRawValue = getRawValue(value);
              
              if (newValue !== currentRawValue) {
                let processedValue: string | number = newValue;
                if (type === "number" || type === "currency" || type === "percent") {
                  const numValue = parseFloat(newValue);
                  if (!isNaN(numValue)) {
                    processedValue = numValue;
                    onSave(processedValue);
                  }
                } else {
                  onSave(processedValue);
                }
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className="w-full px-1 py-0.5 rounded border border-gray-300 text-xs bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            placeholder={placeholder}
            step={type === "currency" || type === "percent" ? "0.01" : "1"}
            min={type === "number" || type === "currency" || type === "percent" ? "0" : undefined}
          />
        </div>
      ) : (
        formatDisplayValue(value)
      )}
    </TableCell>
  );
}; 