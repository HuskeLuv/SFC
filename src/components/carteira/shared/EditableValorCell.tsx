'use client';
import React, { useState } from 'react';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import MobileEditSheet from '@/components/ui/sheet/MobileEditSheet';
import { formatDecimalInput, parseDecimalInput } from '@/lib/ui/numberInput';
import { MobileEditTrigger, useAssetCardContext } from './AssetCardSections';

interface EditableValorCellProps {
  ativoId: string;
  valorAtualizado: number;
  formatCurrency: (value: number) => string;
  /**
   * O MESMO callback no desktop e no celular. No celular (sheet), retorno `false` ou exceção =
   * falha: o sheet fica aberto com o erro.
   */
  onUpdateValorAtualizado: (
    ativoId: string,
    novoValor: number,
  ) => void | boolean | Promise<boolean | void>;
  /** Locale for formatting the initial value in the input */
  locale?: 'pt-BR' | 'en-US';
  placeholder?: string;
  /** Ticker/nome do ativo no título do sheet (padrão: o do cartão). */
  subject?: string;
}

const EditableValorCell: React.FC<EditableValorCellProps> = (props) => {
  const isBelowLg = useIsBelowLg();
  if (isBelowLg) return <ValorMobile {...props} />;
  return <ValorDesktop {...props} />;
};

/**
 * Mesmo parse do desktop: aceita '1.234,56' e '1234.56'; ignora símbolos; negativo não passa
 * (o desktop descarta o sinal — no celular vira erro de validação, sem salvar).
 */
const parseValorMonetarioMobile = (str: string): number | null => {
  if (/-|−/.test(str)) return -1;
  return parseDecimalInput(str, 'pt-BR');
};

/** Celular (PWA fase 1): valor + "Editar" → MobileEditSheet de moeda. */
const ValorMobile: React.FC<EditableValorCellProps> = ({
  ativoId,
  valorAtualizado,
  formatCurrency,
  onUpdateValorAtualizado,
  locale = 'pt-BR',
  subject: subjectProp,
}) => {
  const card = useAssetCardContext();
  const [open, setOpen] = useState(false);
  const subject = subjectProp ?? card?.subject ?? 'ativo';
  return (
    <>
      <MobileEditTrigger
        field="valor"
        display={formatCurrency(valorAtualizado)}
        ariaLabel={`Editar valor atualizado de ${subject}, hoje ${formatCurrency(valorAtualizado)}`}
        onOpen={() => setOpen(true)}
      />
      <MobileEditSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        title={`Valor atualizado de ${subject}`}
        label="Valor atualizado"
        kind="currency"
        locale={locale}
        prefix={locale === 'en-US' ? 'US$' : 'R$'}
        initialValue={valorAtualizado}
        formatValue={(v) => formatDecimalInput(typeof v === 'number' ? v : null, locale, 2)}
        parseValue={locale === 'pt-BR' ? parseValorMonetarioMobile : undefined}
        min={0}
        onSubmit={(v) => onUpdateValorAtualizado(ativoId, v as number)}
        savedMessage={(v) => `Valor de ${subject} salvo: ${formatCurrency(v as number)}`}
      />
    </>
  );
};

const ValorDesktop: React.FC<EditableValorCellProps> = ({
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
