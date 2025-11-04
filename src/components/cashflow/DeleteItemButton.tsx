import React from "react";

interface DeleteItemButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

export const DeleteItemButton: React.FC<DeleteItemButtonProps> = ({ 
  onClick, 
  disabled = false 
}) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label="Deletar item"
      className="rounded-full w-5 h-5 flex items-center justify-center border border-red-600 bg-red-500 text-white shadow hover:bg-red-600 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title="Deletar item"
    >
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path 
          d="M4 4L12 12M4 12L12 4" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};

