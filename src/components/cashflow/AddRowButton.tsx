import React from "react";

interface AddRowButtonProps {
  onClick: () => void;
  groupName: string;
}

export const AddRowButton: React.FC<AddRowButtonProps> = ({ 
  onClick, 
  groupName
}) => {
  return (
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
  ); 
}; 