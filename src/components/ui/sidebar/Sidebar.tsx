'use client';
import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  // bug F1.4: clicar no backdrop destruía o estado de wizards multi-step
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  /**
   * D.2 (checklist mai/28): quando true, esconde o overlay/backdrop e
   * libera o scroll do body. O drawer fica fixo à direita, mas o
   * restante da página continua navegável (user pode mudar de aba,
   * conferir um número numa tabela etc. sem perder o estado do wizard).
   */
  noBackdrop?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className = '',
  closeOnBackdropClick = false,
  closeOnEscape = true,
  noBackdrop = false,
}) => {
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      if (closeOnEscape) {
        document.addEventListener('keydown', handleEscape);
      }
      // No modo drawer (noBackdrop), o app continua navegável — não
      // bloqueia scroll do body. Em modal tradicional sim.
      if (!noBackdrop) {
        document.body.style.overflow = 'hidden';
      }
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, closeOnEscape, noBackdrop]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop — escondido no modo drawer (D.2) */}
          {!noBackdrop && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-[500]"
              onClick={closeOnBackdropClick ? onClose : undefined}
            />
          )}

          {/* Sidebar */}
          <motion.div
            ref={sidebarRef}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={`fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-900 z-[500] flex flex-col ${
              noBackdrop ? 'border-l border-gray-200 dark:border-gray-800 shadow-xl' : 'shadow-2xl'
            } ${className}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h2>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                aria-label="Fechar sidebar"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M6.04289 16.5413C5.65237 16.9318 5.65237 17.565 6.04289 17.9555C6.43342 18.346 7.06658 18.346 7.45711 17.9555L11.9987 13.4139L16.5408 17.956C16.9313 18.3466 17.5645 18.3466 17.955 17.956C18.3455 17.5655 18.3455 16.9323 17.955 16.5418L13.4129 11.9997L17.955 7.4576C18.3455 7.06707 18.3455 6.43391 17.955 6.04338C17.5645 5.65286 16.9313 5.65286 16.5408 6.04338L11.9987 10.5855L7.45711 6.0439C7.06658 5.65338 6.43342 5.65338 6.04289 6.0439C5.65237 6.43442 5.65237 7.06759 6.04289 7.45811L10.5845 11.9997L6.04289 16.5413Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default Sidebar;
