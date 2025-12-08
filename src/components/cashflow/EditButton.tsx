import React from "react";

interface EditButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export const EditButton: React.FC<EditButtonProps> = ({ onClick, disabled = false }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label="Editar grupo"
      className="rounded-full w-6 h-6 flex-shrink-0 flex items-center justify-center border border-blue-600 bg-blue-500 text-white shadow hover:bg-blue-600 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title="Editar grupo"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Quadrado com cantos arredondados - desenhado em partes para criar abertura */}
        <path
          d="M3 3.5C3 3.22386 3.22386 3 3.5 3H10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M3 3.5V12.5C3 12.7761 3.22386 13 3.5 13H12.5C12.7761 13 13 12.7761 13 12.5V6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13 6V3H10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Lápis diagonal saindo pela abertura */}
        <path
          d="M5 11L10.5 5.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Ponta do lápis (inferior esquerda) */}
        <circle cx="5" cy="11" r="0.7" fill="currentColor" />
        {/* Parte superior do lápis (saindo pela abertura) */}
        <circle cx="10.5" cy="5.5" r="0.7" fill="currentColor" />
      </svg>
    </button>
  );
};

