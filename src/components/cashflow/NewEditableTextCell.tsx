"use client";
import React, { useState, useRef, useEffect } from "react";

interface NewEditableTextCellProps {
  value: string | number | null;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onValueChange: (newValue: string | number) => void;
  className?: string;
  type?: "text" | "number";
  placeholder?: string;
}

export default function NewEditableTextCell({
  value,
  isEditing,
  onStartEdit,
  onStopEdit,
  onValueChange,
  className = "",
  type = "text",
  placeholder = "",
}: NewEditableTextCellProps) {
  const [tempValue, setTempValue] = useState(value?.toString() || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setTempValue(value?.toString() || '');
  }, [value]);

  const handleSave = () => {
    if (type === "number") {
      const numValue = tempValue.trim() === '' ? null : parseInt(tempValue, 10);
      if (numValue === null || !isNaN(numValue)) {
        onValueChange(numValue === null ? '' : numValue);
      } else {
        setTempValue(value?.toString() || '');
      }
    } else {
      onValueChange(tempValue.trim());
    }
    onStopEdit();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setTempValue(value?.toString() || '');
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
          type={type}
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onKeyDown={handleKeyPress}
          onBlur={handleBlur}
          placeholder={placeholder}
          className="w-full px-2 py-1 text-xs border border-brand-500 rounded bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
    );
  }

  const isClickable = !className.includes('cursor-default');
  const displayValue = value === null || value === '' ? '-' : value.toString();
  
  return (
    <span
      onClick={isClickable ? onStartEdit : undefined}
      className={`${isClickable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700' : 'cursor-default'} px-2 py-1 rounded transition-colors ${className} inline-block w-full`}
    >
      {displayValue}
    </span>
  );
}

