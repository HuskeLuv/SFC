/**
 * Componente genérico de campo editável inline
 * Usado para editar cotações e objetivos nas tabelas
 */

import { useState, useEffect } from 'react';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { MobileEditSheet } from '@/components/ui/sheet/MobileEditSheet';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';

interface EditableFieldProps {
  value: number;
  /**
   * Salva o valor. No celular (sheet), retorno `false` ou exceção = falha: o sheet fica aberto com
   * o erro. No desktop o retorno é ignorado, como sempre.
   */
  onSubmit: (newValue: number) => void | boolean | Promise<void | boolean>;
  formatDisplay?: (value: number) => string;
  min?: number;
  max?: number;
  step?: string;
  suffix?: string;
  inputWidth?: string;
  className?: string;
  /** Celular (PWA fase 1): rótulo do campo no sheet de edição. */
  mobileLabel?: string;
  /** Celular: tipo do campo no sheet (padrão 'decimal'). */
  mobileKind?: 'currency' | 'decimal' | 'integer';
}

const EditableField: React.FC<EditableFieldProps> = ({
  value,
  onSubmit,
  formatDisplay,
  min = 0,
  max,
  step = '0.01',
  suffix,
  inputWidth = 'w-20',
  className = '',
  mobileLabel,
  mobileKind = 'decimal',
}) => {
  const isBelowLg = useIsBelowLg();
  const [isEditing, setIsEditing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value.toString());

  useEffect(() => {
    setInputValue(value.toString());
  }, [value]);

  const handleSubmit = () => {
    const newValue = parseFloat(inputValue);

    if (isNaN(newValue)) {
      setInputValue(value.toString());
      setIsEditing(false);
      return;
    }

    if (newValue < min || (max !== undefined && newValue > max)) {
      setInputValue(value.toString());
      setIsEditing(false);
      return;
    }

    onSubmit(newValue);
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setInputValue(value.toString());
      setIsEditing(false);
    }
  };

  const displayValue = formatDisplay ? formatDisplay(value) : value.toString();

  // Celular: toque abre o sheet de edição, que chama o MESMO onSubmit.
  if (isBelowLg) {
    const label = mobileLabel ?? 'Valor';
    return (
      <>
        <button
          type="button"
          data-mf-edit="valor"
          onClick={() => setSheetOpen(true)}
          aria-label={`Editar ${label.toLowerCase()}: ${displayValue}`}
          className={`${TABLE_MOBILE_STYLES.editButton} -mx-2 max-w-full text-left tabular-nums text-gray-900 dark:text-white`}
        >
          <span className="min-w-0 truncate">{displayValue}</span>
          {suffix && <span className="text-gray-500">{suffix}</span>}
        </button>
        <MobileEditSheet
          isOpen={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title={`Editar ${label.toLowerCase()}`}
          label={label}
          kind={mobileKind}
          initialValue={value}
          min={min}
          max={max}
          suffix={suffix}
          onSubmit={(v) => onSubmit(v as number)}
        />
      </>
    );
  }

  return (
    <>
      {isEditing ? (
        <div className="flex items-center space-x-1">
          <input
            type="number"
            step={step}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyPress}
            onBlur={handleSubmit}
            className={`${inputWidth} rounded border border-gray-300 px-1 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white`}
            autoFocus
          />
          {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
        </div>
      ) : (
        <div
          className={`cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded ${className}`}
          onClick={() => setIsEditing(true)}
        >
          <span className="text-sm font-medium text-gray-900 dark:text-white">{displayValue}</span>
        </div>
      )}
    </>
  );
};

export default EditableField;
