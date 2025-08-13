import React from "react";

interface AddRowButtonProps {
  onClick: () => void;
  groupName: string;
  onEditMode?: () => void;
  isEditMode?: boolean;
}

export const AddRowButton: React.FC<AddRowButtonProps> = ({ 
  onClick, 
  groupName,
  onEditMode,
  isEditMode = false
}) => {
  return (
    <div className="flex gap-1">
  <button
    onClick={onClick}
    aria-label={`Adicionar linha em ${groupName}`}
        className="rounded-full w-5 h-5 flex items-center justify-center border border-blue-700 bg-blue-600 text-white shadow hover:bg-blue-700 focus:outline-none transition-colors"
        title={`Adicionar linha em ${groupName}`}
  >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
      <button
        onClick={onEditMode}
        aria-label={`Editar linhas em ${groupName}`}
        className={`rounded-full w-5 h-5 flex items-center justify-center border shadow focus:outline-none transition-colors ${
          isEditMode 
            ? 'border-green-700 bg-green-600 text-white hover:bg-green-700' 
            : 'border-gray-700 bg-gray-600 text-white hover:bg-gray-700'
        }`}
        title={`Editar linhas em ${groupName}`}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11 1H4C3.44772 1 3 1.44772 3 2V14C3 14.5523 3.44772 15 4 15H12C12.5523 15 13 14.5523 13 14V5M11 1L13 3M11 1V5H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </button>
    </div>
); 
}; 