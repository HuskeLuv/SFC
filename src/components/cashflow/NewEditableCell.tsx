"use client";
import React, { useState, useRef, useEffect } from "react";

interface NewEditableCellProps {
  value: number;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onValueChange: (newValue: number) => void;
  className?: string;
  type?: "currency" | "percentage" | "number";
  min?: number;
  max?: number;
  placeholder?: string;
}

export default function NewEditableCell({
  value,
  isEditing,
  onStartEdit,
  onStopEdit,
  onValueChange,
  className = "",
  type = "currency",
  min = 0,
  max,
  placeholder = "0.00",
}: NewEditableCellProps) {
  const [tempValue, setTempValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setTempValue(value.toString());
  }, [value]);

  const formatDisplayValue = (val: number): string => {
    switch (type) {
      case "currency":
        return val.toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        });
      case "percentage":
        return `${val.toFixed(2)}%`;
      default:
        return val.toString();
    }
  };


  const handleSave = () => {
    const numValue = parseFloat(tempValue);
    if (!isNaN(numValue) && numValue >= min && (max === undefined || numValue <= max)) {
      onValueChange(numValue);
    } else {
      // Reset to original value if invalid
      setTempValue(value.toString());
    }
    onStopEdit();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setTempValue(value.toString());
      onStopEdit();
    }
  };

  const handleBlur = () => {
    handleSave();
  };

  if (isEditing) {
    return (
      <div className="relative">
        <input
          ref={inputRef}
          type="number"
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onKeyDown={handleKeyPress}
          onBlur={handleBlur}
          min={min}
          max={max}
          step={type === "currency" ? "0.01" : type === "percentage" ? "0.1" : "1"}
          placeholder={placeholder}
          className="w-full px-2 py-1 text-xs border border-brand-500 rounded bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
    );
  }

  const isClickable = !className.includes('cursor-default');
  
  return (
    <span
      onClick={isClickable ? onStartEdit : undefined}
      className={`${isClickable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700' : 'cursor-default'} px-2 py-1 rounded transition-colors ${className} inline-block w-full`}
    >
      {formatDisplayValue(value)}
    </span>
  );
}
