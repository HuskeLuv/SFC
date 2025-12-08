import React from "react";

interface ActionButtonsProps {
  onSave: () => void;
  onCancel: () => void;
}

export const ActionButtons: React.FC<ActionButtonsProps> = ({ onSave, onCancel }) => (
  <div className="flex gap-1 items-center justify-end flex-shrink-0">
    <button
      onClick={onSave}
      aria-label="Salvar"
      className="rounded-full w-6 h-6 flex-shrink-0 flex items-center justify-center border border-green-700 bg-green-600 text-white shadow hover:bg-green-700 focus:outline-none transition-colors"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 8.5L7 11.5L12 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
    <button
      onClick={onCancel}
      aria-label="Cancelar"
      className="rounded-full w-6 h-6 flex-shrink-0 flex items-center justify-center border border-red-700 bg-red-600 text-white shadow hover:bg-red-700 focus:outline-none transition-colors"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5 5L11 11M11 5L5 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    </button>
  </div>
); 