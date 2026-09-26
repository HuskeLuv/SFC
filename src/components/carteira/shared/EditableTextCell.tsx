'use client';
import React, { useState } from 'react';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import MobileEditSheet from '@/components/ui/sheet/MobileEditSheet';
import { MobileEditTrigger, useAssetCardContext } from './AssetCardSections';

interface EditableTextCellProps {
  ativoId: string;
  value: string;
  /**
   * O MESMO callback no desktop e no celular. No celular (sheet), retorno `false` ou exceção =
   * falha: o sheet fica aberto com o erro.
   */
  onSubmit: (ativoId: string, novoValor: string) => void | boolean | Promise<boolean | void>;
  /** Exibido no lugar do valor quando vazio (ex.: "—"). */
  emptyLabel?: string;
  placeholder?: string;
  title?: string;
  inputWidth?: string;
  /** Ticker/nome do ativo e rótulo do campo no sheet (padrão: os do cartão). */
  subject?: string;
  label?: string;
  /** Texto longo no celular (textarea: Enter quebra linha). */
  multiline?: boolean;
}

/**
 * Célula de texto editável inline (clique → input → Enter/blur salva, Esc cancela).
 * Padrão da tabela de Renda Fixa (Cot./Liq. Resgate), extraído pra reutilizar
 * em outras abas.
 */
const EditableTextCell: React.FC<EditableTextCellProps> = (props) => {
  const isBelowLg = useIsBelowLg();
  if (isBelowLg) return <TextMobile {...props} />;
  return <TextDesktop {...props} />;
};

/** Celular (PWA fase 1): valor + "Editar" → MobileEditSheet de texto. */
const TextMobile: React.FC<EditableTextCellProps> = ({
  ativoId,
  value,
  onSubmit,
  emptyLabel = '—',
  placeholder,
  subject: subjectProp,
  label: labelProp,
  multiline = false,
}) => {
  const card = useAssetCardContext();
  const [open, setOpen] = useState(false);
  const subject = subjectProp ?? card?.subject ?? 'ativo';
  const label = labelProp ?? card?.label ?? 'Texto';
  return (
    <>
      <MobileEditTrigger
        field="texto"
        display={value || emptyLabel}
        muted={!value}
        ariaLabel={`Editar ${label.toLowerCase()} de ${subject}`}
        onOpen={() => setOpen(true)}
      />
      <MobileEditSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        title={`${label} de ${subject}`}
        label={label}
        kind={multiline ? 'textarea' : 'text'}
        initialValue={value}
        allowEmpty
        hint={placeholder ? `Ex.: ${placeholder}` : undefined}
        onSubmit={(v) => {
          // Mesma regra do desktop: aparado, e só envia se mudou.
          const next = String(v ?? '').trim();
          if (next === value) return;
          return onSubmit(ativoId, next);
        }}
        savedMessage={() => `${label} de ${subject} salvo`}
      />
    </>
  );
};

const TextDesktop: React.FC<EditableTextCellProps> = ({
  ativoId,
  value,
  onSubmit,
  emptyLabel = '—',
  placeholder,
  title = 'Clique para editar',
  inputWidth = 'w-20',
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const submit = () => {
    const next = draft.trim();
    setIsEditing(false);
    if (next !== value) onSubmit(ativoId, next);
  };

  if (isEditing) {
    return (
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          else if (e.key === 'Escape') {
            setDraft(value);
            setIsEditing(false);
          }
        }}
        onBlur={submit}
        onFocus={(e) => e.target.select()}
        placeholder={placeholder}
        className={`${inputWidth} px-1 py-0.5 text-xs border border-gray-300 rounded dark:border-gray-600 dark:bg-gray-700 dark:text-white text-center`}
        autoFocus
      />
    );
  }

  return (
    <div
      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 px-1 py-0.5 rounded"
      title={title}
      onClick={() => {
        setDraft(value);
        setIsEditing(true);
      }}
    >
      {value || emptyLabel}
    </div>
  );
};

export default EditableTextCell;
