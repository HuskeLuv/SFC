import React, { useState, useRef, useEffect } from "react";
import { TableCell } from "@/components/ui/table";
import { ActionButtons } from "./ActionButtons";

interface EditableDescriptionCellProps {
  descricao: string;
  significado: string | null;
  onSave: (descricao: string, significado: string) => void;
  onCancel: () => void;
  isEditing: boolean;
  onStartEdit: () => void;
  className?: string;
  globalEditMode?: boolean;
}

export const EditableDescriptionCell: React.FC<EditableDescriptionCellProps> = ({
  descricao,
  significado,
  onSave,
  onCancel,
  isEditing,
  className = "",
  globalEditMode = false
}) => {
  const [editDescricao, setEditDescricao] = useState<string>(descricao || '');
  const [editSignificado, setEditSignificado] = useState<string>(significado || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Update edit values when props change
  useEffect(() => {
    setEditDescricao(descricao || '');
    setEditSignificado(significado || '');
  }, [descricao, significado]);

  const handleSave = () => {
    onSave(editDescricao, editSignificado);
  };

  const handleCancel = () => {
    setEditDescricao(descricao || '');
    setEditSignificado(significado || '');
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <TableCell className={className}>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={editDescricao}
              onChange={(e) => setEditDescricao(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-1 py-0.5 rounded border border-gray-300 text-xs bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              placeholder="Descrição"
            />
            <ActionButtons onSave={handleSave} onCancel={handleCancel} />
          </div>
          <input
            type="text"
            value={editSignificado}
            onChange={(e) => setEditSignificado(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-1 py-0.5 rounded border border-gray-300 text-xs bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            placeholder="Significado (opcional)"
          />
        </div>
      </TableCell>
    );
  }

  return (
    <TableCell className={className}>
      {globalEditMode ? (
        <div className="space-y-1">
          <input
            type="text"
            value={editDescricao}
            onChange={(e) => setEditDescricao(e.target.value)}
            onBlur={(e) => {
              const newDescricao = e.target.value;
              if (newDescricao !== descricao) {
                onSave(newDescricao, significado || '');
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className="w-full px-1 py-0.5 rounded border border-gray-300 text-xs bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            placeholder="Descrição"
          />
          <input
            type="text"
            value={editSignificado}
            onChange={(e) => setEditSignificado(e.target.value)}
            onBlur={(e) => {
              const newSignificado = e.target.value;
              if (newSignificado !== significado) {
                onSave(descricao || '', newSignificado);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className="w-full px-1 py-0.5 rounded border border-gray-300 text-xs bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            placeholder="Significado (opcional)"
          />
        </div>
      ) : (
        <div className="text-xs">
          {descricao || ''}
        </div>
      )}
    </TableCell>
  );
}; 