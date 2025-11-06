"use client";
import React, { useState, useEffect, useRef } from "react";

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent<HTMLInputElement>) => void;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChange,
  className = "",
  placeholder = "0,00",
  disabled = false,
  style,
  onClick,
}) => {
  const [displayValue, setDisplayValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Converte número para formato brasileiro
  const formatToBrazilian = (num: number): string => {
    return num.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Converte string formatada para número
  const parseFromBrazilian = (str: string): number => {
    // Remove tudo exceto números e vírgula
    const cleaned = str.replace(/[^\d,]/g, "").replace(/\./g, "");
    // Substitui vírgula por ponto
    const normalized = cleaned.replace(",", ".");
    const num = parseFloat(normalized) || 0;
    return num;
  };

  useEffect(() => {
    setDisplayValue(formatToBrazilian(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setDisplayValue(inputValue);
    
    const numValue = parseFromBrazilian(inputValue);
    if (!isNaN(numValue)) {
      onChange(numValue);
    }
  };

  const handleBlur = () => {
    // Garante formatação correta ao perder foco
    const numValue = parseFromBrazilian(displayValue);
    setDisplayValue(formatToBrazilian(numValue));
    onChange(numValue);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Seleciona todo o texto ao focar (opcional, pode remover se não quiser)
    // e.target.select();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onClick={onClick}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full px-2 py-1 text-xs border border-brand-500 rounded bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 text-right ${className}`}
      style={{
        appearance: "none",
        MozAppearance: "textfield",
        ...style,
      }}
    />
  );
};

