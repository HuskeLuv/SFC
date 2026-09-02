'use client';
import React, { useState } from 'react';

interface EditableTextCellProps {
  ativoId: string;
  value: string;
  onSubmit: (ativoId: string, novoValor: string) => void;
  /** Exibido no lugar do valor quando vazio (ex.: "—"). */
  emptyLabel?: string;
  placeholder?: string;
  title?: string;
  inputWidth?: string;
}

/**
 * Célula de texto editável inline (clique → input → Enter/blur salva, Esc cancela).
 * Padrão da tabela de Renda Fixa (Cot./Liq. Resgate), extraído pra reutilizar
 * em outras abas.
 */
const EditableTextCell: React.FC<EditableTextCellProps> = ({
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
