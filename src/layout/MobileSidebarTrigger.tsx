'use client';

import React from 'react';
import { useSidebar } from '@/context/SidebarContext';

/**
 * Botão flutuante de toggle de sidebar no mobile (#1 do checklist mai/28).
 * Substitui o toggle que ficava na topbar removida em D.1.
 *
 * Visível apenas em telas <lg (`hidden lg:hidden` invertido).
 * Posicionado fixo no canto superior esquerdo. Some quando a sidebar
 * mobile está aberta (o Backdrop fecha clicando fora).
 */
export default function MobileSidebarTrigger() {
  const { isMobileOpen, toggleMobileSidebar } = useSidebar();
  if (isMobileOpen) return null;
  return (
    <button
      type="button"
      onClick={toggleMobileSidebar}
      className="fixed top-3 left-3 z-[9998] flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-md hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 lg:hidden"
      aria-label="Abrir menu"
    >
      <svg
        width="20"
        height="14"
        viewBox="0 0 16 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M0.58 1A.75.75 0 011.33.25h13.34a.75.75 0 010 1.5H1.33A.75.75 0 01.58 1ZM.58 11a.75.75 0 01.75-.75h13.34a.75.75 0 010 1.5H1.33a.75.75 0 01-.75-.75ZM1.33 5.25a.75.75 0 100 1.5H8a.75.75 0 100-1.5H1.33Z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}
