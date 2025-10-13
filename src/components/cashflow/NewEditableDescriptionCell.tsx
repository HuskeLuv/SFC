"use client";
import React, { useState, useRef, useEffect } from "react";

interface NewEditableDescriptionCellProps {
  descricao: string;
  significado: string;
  onSave: (descricao: string, significado: string) => void;
  onCancel: () => void;
  isEditing: boolean;
  onStartEdit: () => void;
  className?: string;
}

export default function NewEditableDescriptionCell({
  descricao,
  significado,
  onSave,
  onCancel,
  isEditing,
  onStartEdit,
  className = "",
}: NewEditableDescriptionCellProps) {
  const [tempDescricao, setTempDescricao] = useState(descricao);
  const [tempSignificado, setTempSignificado] = useState(significado || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setTempDescricao(descricao);
    setTempSignificado(significado || '');
  }, [descricao, significado]);

  const handleSave = () => {
    if (tempDescricao.trim()) {
      onSave(tempDescricao.trim(), tempSignificado.trim());
    } else {
      // Reset to original values if invalid
      setTempDescricao(descricao);
      setTempSignificado(significado || '');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setTempDescricao(descricao);
      setTempSignificado(significado || '');
      onCancel();
    }
  };

  const handleBlur = () => {
    handleSave();
  };

  if (isEditing) {
    return (
      <div className="flex flex-col gap-1">
        <input
          ref={inputRef}
          type="text"
          value={tempDescricao}
          onChange={(e) => setTempDescricao(e.target.value)}
          onKeyDown={handleKeyPress}
          onBlur={handleBlur}
          placeholder="Descrição"
          className="w-full px-2 py-1 text-xs border border-brand-500 rounded bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <input
          type="text"
          value={tempSignificado}
          onChange={(e) => setTempSignificado(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Significado (opcional)"
          className="w-full px-2 py-1 text-xs border border-gray-300 rounded bg-white dark:bg-gray-800 dark:text-white focus:outline-none"
        />
      </div>
    );
  }

  const isClickable = !className.includes('cursor-default');
  
  return (
    <div
      onClick={isClickable ? onStartEdit : undefined}
      className={`${isClickable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700' : 'cursor-default'} px-2 py-1 rounded transition-colors ${className}`}
    >
      <div className="font-medium text-gray-800 dark:text-white">
        {descricao}
      </div>
      {significado && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {significado}
        </div>
      )}
    </div>
  );
}
