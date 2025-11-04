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
      className="rounded-full w-6 h-6 flex items-center justify-center border border-blue-600 bg-blue-500 text-white shadow hover:bg-blue-600 focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      title="Editar grupo"
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path 
          d="M11.333 2.00001C11.5084 1.82445 11.7163 1.68606 11.9448 1.59331C12.1732 1.50055 12.4177 1.45536 12.6647 1.46051C12.9116 1.46566 13.1542 1.52102 13.3782 1.62321C13.6022 1.72539 13.8032 1.87234 13.9687 2.05567C14.1342 2.23901 14.2607 2.45493 14.3406 2.68994C14.4205 2.92495 14.4522 3.17436 14.4337 3.42235C14.4152 3.67033 14.3468 3.91188 14.2327 4.13072C14.1185 4.34956 13.9611 4.54113 13.7707 4.69334L13.333 5.33334L10.667 2.66667L11.333 2.00001Z" 
          stroke="currentColor" 
          strokeWidth="1.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        />
        <path 
          d="M9.33337 4L12 6.66667M2.66671 13.3333L2.73337 13.2667C2.85195 13.1481 3.01471 13.082 3.18671 13.082C3.35871 13.082 3.52147 13.1481 3.64004 13.2667L4.66671 14.2933L9.33337 9.62667L8.30671 8.6C8.18813 8.48142 8.12205 8.31866 8.12205 8.14667C8.12205 7.97467 8.18813 7.81191 8.30671 7.69334L8.37337 7.62667C8.49195 7.50809 8.65471 7.44201 8.82671 7.44201C8.99871 7.44201 9.16147 7.50809 9.28004 7.62667L14.6667 13.0133V14.6667H13.0134L7.62671 9.28C7.50813 9.16142 7.44205 8.99866 7.44205 8.82667C7.44205 8.65467 7.50813 8.49191 7.62671 8.37334L7.69337 8.30667C7.81195 8.18809 7.87803 8.02533 7.87803 7.85334C7.87803 7.68134 7.81195 7.51858 7.69337 7.4L6.66671 6.37334L2.66671 10.3733V13.3333Z" 
          stroke="currentColor" 
          strokeWidth="1.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};

