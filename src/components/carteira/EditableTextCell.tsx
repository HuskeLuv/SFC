"use client";
import React, { useEffect, useRef, useState } from "react";

interface EditableTextCellProps {
  value: string;
  isEditing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onValueChange: (newValue: string) => void;
  className?: string;
  placeholder?: string;
}

export default function EditableTextCell({
  value,
  isEditing,
  onStartEdit,
  onStopEdit,
  onValueChange,
  className = "",
  placeholder = "Adicionar descrição",
}: EditableTextCellProps) {
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) return;
    if (!inputRef.current) return;
    inputRef.current.focus();
    inputRef.current.select();
  }, [isEditing]);

  useEffect(() => {
    setTempValue(value);
  }, [value]);

  const handleSave = () => {
    onValueChange(tempValue);
    onStopEdit();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      handleSave();
      return;
    }

    if (event.key === "Escape") {
      setTempValue(value);
      onStopEdit();
    }
  };

  const handleBlur = () => {
    handleSave();
  };

  const handleCellKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onStartEdit();
    }
  };

  if (isEditing) {
    return (
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={tempValue}
          onChange={(event) => setTempValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={placeholder}
          aria-label="Editar descrição"
          className="w-full px-2 py-1 text-xs border border-brand-500 rounded bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Editar descrição"
      onClick={onStartEdit}
      onKeyDown={handleCellKeyDown}
      className={`cursor-pointer px-2 py-1 rounded transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${className}`}
    >
      {tempValue || <span className="text-gray-400">{placeholder}</span>}
    </div>
  );
}
