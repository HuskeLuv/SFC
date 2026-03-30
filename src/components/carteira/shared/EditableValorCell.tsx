'use client';
import React, { useState } from 'react';

interface EditableValorCellProps {
  ativoId: string;
  valorAtualizado: number;
  formatCurrency: (value: number) => string;
  onUpdateValorAtualizado: (ativoId: string, novoValor: number) => void;
  /** Locale for formatting the initial value in the input */
  locale?: 'pt-BR' | 'en-US';
  placeholder?: string;
}

const EditableValorCell: React.FC<EditableValorCellProps> = ({
  ativoId,
  valorAtualizado,
  formatCurrency,
  onUpdateValorAtualizado,
  locale = 'pt-BR',
  placeholder = '0,00',
}) => {
  const formatValorMonetario = (num: number): string => {
    return num.toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const parseValorMonetario = (str: string): number | null => {
    const cleaned = str.replace(/[^\d,.]/g, '').trim();
    if (!cleaned) return null;
    const hasComma = cleaned.includes(',');
    const normalized = hasComma ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned;
    const num = Number.parseFloat(normalized);
    return Number.isFinite(num) && num >= 0 ? num : null;
  };

  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(formatValorMonetario(valorAtualizado));

  const handleSubmit = (rawValue?: string) => {
    const str = rawValue !== undefined ? rawValue : value;
    const numValor = parseValorMonetario(str);
    if (numValor !== null) {
      onUpdateValorAtualizado(ativoId, numValor);
      setIsEditing(false);
    } else {
      setValue(formatValorMonetario(valorAtualizado));
      setIsEditing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent, rawValue: string) => {
    if (e.key === 'Enter') {
      handleSubmit(rawValue);
    } else if (e.key === 'Escape') {
      setValue(formatValorMonetario(valorAtualizado));
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => handleKeyPress(e, value)}
        onBlur={() => handleSubmit()}
        onFocus={(e) => e.target.select()}
        placeholder={placeholder}
        className="w-28 px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white text-right"
        autoFocus
      />
    );
  }

  return (
    <div
      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
      onClick={() => {
        setValue(formatValorMonetario(valorAtualizado));
        setIsEditing(true);
      }}
    >
      {formatCurrency(valorAtualizado)}
    </div>
  );
};

export default EditableValorCell;
