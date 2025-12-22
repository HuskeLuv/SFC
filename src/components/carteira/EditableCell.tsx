"use client";
import React, { useState, useRef, useEffect } from "react";

interface EditableCellProps {
  value: number;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onValueChange: (newValue: number) => void;
  className?: string;
  suffix?: string;
  min?: number;
  max?: number;
}

export default function EditableCell({
  value,
  isEditing,
  onStartEdit,
  onStopEdit,
  onValueChange,
  className = "",
  suffix = "%",
  min = 0,
  max = 100,
}: EditableCellProps) {
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

  const handleSave = () => {
    const numValue = parseFloat(tempValue);
    if (!isNaN(numValue) && numValue >= min && numValue <= max) {
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
          step="0.1"
          className="w-full px-2 py-1 text-sm border border-brand-500 rounded bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
    );
  }

  return (
    <div
      onClick={onStartEdit}
      className={`cursor-pointer px-2 py-1 rounded transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${className}`}
    >
      {value.toFixed(1)}{suffix}
    </div>
  );
} 