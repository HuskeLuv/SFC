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
  onBlur?: () => void;
}

export const CurrencyInput: React.FC<CurrencyInputProps> = ({
  value,
  onChange,
  className = "",
  placeholder = "0",
  disabled = false,
  style,
  onClick,
  onBlur: externalOnBlur,
}) => {
  const [displayValue, setDisplayValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Converte número para formato brasileiro (apenas para exibição quando não está focado)
  const formatToBrazilian = (num: number): string => {
    return num.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Converte string para número (aceita números com ou sem vírgula/ponto)
  const parseToNumber = (str: string): number => {
    // Remove tudo exceto números, vírgula e ponto
    const cleaned = str.replace(/[^\d,.]/g, "");
    // Se tem vírgula, trata como decimal brasileiro
    if (cleaned.includes(",")) {
      const normalized = cleaned.replace(/\./g, "").replace(",", ".");
      return parseFloat(normalized) || 0;
    }
    // Se tem ponto, pode ser decimal internacional
    if (cleaned.includes(".")) {
      return parseFloat(cleaned) || 0;
    }
    // Apenas números inteiros
    return parseFloat(cleaned) || 0;
  };

  // Inicializa o valor quando o componente recebe um novo value
  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(formatToBrazilian(value));
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // Durante a edição, permite digitar livremente
    setDisplayValue(inputValue);
    
    // Converte e atualiza o valor numérico
    const numValue = parseToNumber(inputValue);
    onChange(numValue);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    // Ao focar, mostra apenas o número sem formatação
    setDisplayValue(value === 0 ? "" : value.toString().replace(".", ","));
    e.target.select();
  };

  const handleBlur = () => {
    setIsFocused(false);
    // Ao perder o foco, formata como monetário
    const numValue = parseToNumber(displayValue);
    setDisplayValue(formatToBrazilian(numValue));
    onChange(numValue);
    // Chamar callback externo se fornecido
    if (externalOnBlur) {
      externalOnBlur();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
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

