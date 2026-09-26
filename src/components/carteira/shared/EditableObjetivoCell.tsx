'use client';
import React, { useState, type ReactNode } from 'react';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import MobileEditSheet from '@/components/ui/sheet/MobileEditSheet';
import { MobileEditTrigger, useAssetCardContext } from './AssetCardSections';

interface EditableObjetivoCellProps {
  ativoId: string;
  objetivo: number;
  formatPercentage: (value: number) => string;
  /**
   * O MESMO callback no desktop e no celular. No celular (sheet), retorno `false` ou exceção =
   * falha: o sheet fica aberto com o erro (os hooks da carteira devolvem false sem lançar).
   */
  onUpdateObjetivo: (
    ativoId: string,
    novoObjetivo: number,
  ) => void | boolean | Promise<boolean | void>;
  /** Ticker/nome do ativo no título do sheet (padrão: o do cartão). */
  subject?: string;
  /** Dica sob o campo (padrão: % atual da aba + soma dos objetivos, vindos do cartão). */
  hint?: ReactNode;
}

const EditableObjetivoCell: React.FC<EditableObjetivoCellProps> = (props) => {
  const isBelowLg = useIsBelowLg();
  if (isBelowLg) return <ObjetivoMobile {...props} />;
  return <ObjetivoDesktop {...props} />;
};

const ObjetivoDesktop: React.FC<EditableObjetivoCellProps> = ({
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
        <span className="text-xs text-gray-900 dark:text-white">%</span>
      </div>
    );
  }

  return (
    <div
      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
      onClick={() => setIsEditing(true)}
    >
      <span className="text-gray-900 dark:text-white">{formatPercentage(objetivo)}</span>
    </div>
  );
};

/** Celular (PWA fase 1): valor + "Editar" (44px) → MobileEditSheet de percentual. */
const ObjetivoMobile: React.FC<EditableObjetivoCellProps> = ({
  ativoId,
  objetivo,
  formatPercentage,
  onUpdateObjetivo,
  subject: subjectProp,
  hint: hintProp,
}) => {
  const card = useAssetCardContext();
  const [open, setOpen] = useState(false);
  const subject = subjectProp ?? card?.subject ?? 'ativo';
  const fmt = card?.formatPercentage ?? formatPercentage;

  const hint =
    hintProp ??
    (card && card.percentualAtual !== undefined
      ? `Hoje: ${fmt(card.percentualAtual)} da aba.` +
        (card.somaObjetivos !== undefined
          ? ` Soma dos objetivos da aba: ${fmt(card.somaObjetivos)}.`
          : '')
      : undefined);

  return (
    <>
      <MobileEditTrigger
        field="objetivo"
        display={formatPercentage(objetivo)}
        ariaLabel={`Editar objetivo de ${subject}, hoje ${formatPercentage(objetivo)}`}
        onOpen={() => setOpen(true)}
      />
      <MobileEditSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        title={`Objetivo de ${subject}`}
        label="Objetivo (% da aba)"
        kind="percent"
        initialValue={objetivo}
        min={0}
        max={100}
        hint={hint}
        onSubmit={(v) => onUpdateObjetivo(ativoId, v as number)}
        savedMessage={(v) => `Objetivo de ${subject} salvo: ${formatPercentage(v as number)}`}
      />
    </>
  );
};

export default EditableObjetivoCell;
