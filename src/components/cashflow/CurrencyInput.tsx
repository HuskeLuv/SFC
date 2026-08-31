'use client';
import React, { useState, useEffect, useRef } from 'react';
import { evaluateFormula, isFormula } from '@/utils/formulaParser';

interface CurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  /**
   * Fórmula persistida da célula (ex.: '=200+30+50'). Quando presente, focar a
   * célula mostra a fórmula (estilo Excel) em vez do número.
   */
  formula?: string | null;
  /**
   * Habilita o modo fórmula: digitar '=' inicia uma expressão que é avaliada no
   * blur. Chamado no blur com a fórmula final (null quando número puro) e o
   * valor calculado. Sem esse callback o comportamento é 100% o antigo.
   */
  onFormulaChange?: (formula: string | null, value: number) => void;
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
  formula = null,
  onFormulaChange,
  className = '',
  placeholder = '0',
  disabled = false,
  style,
  onClick,
  onBlur: externalOnBlur,
}) => {
  const [displayValue, setDisplayValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [formulaError, setFormulaError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formulaEnabled = !!onFormulaChange;

  // Converte número para formato brasileiro (apenas para exibição quando não está focado)
  const formatToBrazilian = (num: number): string => {
    return num.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Converte string para número (aceita números com ou sem vírgula/ponto)
  const parseToNumber = (str: string): number => {
    // Remove tudo exceto números, vírgula e ponto
    const cleaned = str.replace(/[^\d,.]/g, '');
    // Se tem vírgula, trata como decimal brasileiro
    if (cleaned.includes(',')) {
      const normalized = cleaned.replace(/\./g, '').replace(',', '.');
      return parseFloat(normalized) || 0;
    }
    // Se tem ponto, pode ser decimal internacional
    if (cleaned.includes('.')) {
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

    // Modo fórmula: não converte a expressão em número a cada tecla — a
    // avaliação acontece no blur (estilo Excel).
    if (formulaEnabled && isFormula(inputValue)) {
      return;
    }
    if (formulaError) setFormulaError(null);

    // Converte e atualiza o valor numérico
    const numValue = parseToNumber(inputValue);
    onChange(numValue);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    // Célula com fórmula: editar mostra a fórmula, não o resultado.
    if (formulaEnabled && formula) {
      setDisplayValue(formula);
    } else {
      // Ao focar, mostra apenas o número sem formatação
      setDisplayValue(value === 0 ? '' : value.toString().replace('.', ','));
    }
    e.target.select();
  };

  const handleBlur = () => {
    setIsFocused(false);

    if (formulaEnabled && isFormula(displayValue)) {
      const result = evaluateFormula(displayValue);
      if (result.ok) {
        setFormulaError(null);
        setDisplayValue(formatToBrazilian(result.value));
        onChange(result.value);
        onFormulaChange!(displayValue.trim(), result.value);
      } else {
        // Fórmula inválida: mantém o texto digitado com aviso visual e NÃO
        // altera o valor salvo (decisão aprovada no plano do ticket).
        setFormulaError(result.error);
      }
      if (externalOnBlur) {
        externalOnBlur();
      }
      return;
    }

    setFormulaError(null);
    // Ao perder o foco, formata como monetário
    const numValue = parseToNumber(displayValue);
    setDisplayValue(formatToBrazilian(numValue));
    onChange(numValue);
    // Número puro digitado numa célula que tinha fórmula: limpa a memória.
    if (formulaEnabled && formula) {
      onFormulaChange!(null, numValue);
    }
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
      title={formulaError ? `Fórmula inválida: ${formulaError}` : formula || undefined}
      className={`w-full px-2 py-1 text-xs border rounded bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 text-right ${
        formulaError
          ? 'border-red-500 focus:ring-red-500 text-red-600 dark:text-red-400'
          : 'border-brand-500 focus:ring-brand-500'
      } ${className}`}
      style={{
        appearance: 'none',
        MozAppearance: 'textfield',
        ...style,
      }}
    />
  );
};
