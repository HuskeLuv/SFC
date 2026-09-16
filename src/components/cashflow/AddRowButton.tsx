import React from 'react';
import { GRID } from './cashflowGridStyles';

interface AddRowButtonProps {
  onClick: () => void;
  groupName: string;
}

/** "+ Linha" — vive na barra de edição do grupo (não fica visível fora dela). */
export const AddRowButton: React.FC<AddRowButtonProps> = ({ onClick, groupName }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={`Adicionar linha em ${groupName}`}
    title={`Adicionar linha em ${groupName}`}
    className={`${GRID.ghostBtn} ${GRID.ghostBtnPill}`}
  >
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
    Linha
  </button>
);
