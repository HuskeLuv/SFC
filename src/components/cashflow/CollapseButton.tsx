import React from "react";

interface CollapseButtonProps {
  isCollapsed: boolean;
  onClick: () => void;
  groupName: string;
}

export const CollapseButton: React.FC<CollapseButtonProps> = ({ 
  isCollapsed, 
  onClick, 
  groupName 
}) => (
  <button
    onClick={onClick}
    aria-label={isCollapsed ? `Expandir ${groupName}` : `Colapsar ${groupName}`}
    tabIndex={0}
    className="rounded-full w-6 h-6 flex items-center justify-center border border-gray-300 bg-white dark:bg-gray-800 shadow text-gray-700 dark:text-gray-200 hover:bg-gray-100 focus:outline-none transition-colors"
  >
    {isCollapsed ? (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="7" y="3" width="2" height="10" rx="1" fill="currentColor"/>
        <rect x="3" y="7" width="10" height="2" rx="1" fill="currentColor"/>
      </svg>
    ) : (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="7" width="10" height="2" rx="1" fill="currentColor"/>
      </svg>
    )}
  </button>
); 