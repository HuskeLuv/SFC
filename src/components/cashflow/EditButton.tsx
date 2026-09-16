import React from 'react';
import { GRID } from './cashflowGridStyles';

interface EditButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

/** Único botão visível na linha de seção fora da edição: lápis + "Editar". */
export const EditButton: React.FC<EditButtonProps> = ({ onClick, disabled = false }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label="Editar grupo"
    title="Editar grupo"
    className={`${GRID.ghostBtn} ${GRID.ghostBtnPill}`}
  >
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
    Editar
  </button>
);
