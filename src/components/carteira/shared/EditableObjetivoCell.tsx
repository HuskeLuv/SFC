'use client';
import React, { useState } from 'react';

interface EditableObjetivoCellProps {
  ativoId: string;
  objetivo: number;
  formatPercentage: (value: number) => string;
  onUpdateObjetivo: (ativoId: string, novoObjetivo: number) => void;
}

const EditableObjetivoCell: React.FC<EditableObjetivoCellProps> = ({
  ativoId,
  objetivo,
  formatPercentage,
  onUpdateObjetivo,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(objetivo.toString());

  const handleSubmit = () => {
    const novoObjetivo = parseFloat(value);
    if (!isNaN(novoObjetivo) && novoObjetivo >= 0) {
      onUpdateObjetivo(ativoId, novoObjetivo);
      setIsEditing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setValue(objetivo.toString());
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center space-x-1">
        <input
          type="number"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyPress}
          onBlur={handleSubmit}
          className="w-16 px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          autoFocus
        />
        <span className="text-xs text-black">%</span>
      </div>
    );
  }

  return (
    <div
      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
      onClick={() => setIsEditing(true)}
    >
      <span className="text-black">{formatPercentage(objetivo)}</span>
    </div>
  );
};

export default EditableObjetivoCell;
