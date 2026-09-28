'use client';
import React, { useRef, useEffect } from 'react';
import { lockBodyScroll } from '@/lib/ui/scrollLock';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean; // New prop to control close button visibility
  isFullscreen?: boolean; // Default to false for backwards compatibility
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className,
  showCloseButton = true, // Default to true for backwards compatibility
  isFullscreen = false,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Trava compartilhada (contador): um Modal aberto sobre outro overlay não destrava o fundo
  // ao fechar.
  useEffect(() => {
    if (!isOpen) return;
    return lockBodyScroll();
  }, [isOpen]);

  if (!isOpen) return null;

  // Abaixo de lg (PWA fase 0) o modal vira bottom sheet: colado embaixo, altura limitada,
  // rolagem interna e área segura. Tudo sob max-lg:/lg:hidden — o desktop não muda.
  const contentClasses = isFullscreen
    ? 'w-full h-full max-lg:h-dvh'
    : 'relative w-full rounded-3xl bg-white  dark:bg-gray-900 max-lg:m-0! max-lg:max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:rounded-b-none max-lg:pb-[calc(env(safe-area-inset-bottom)+8px)] max-lg:animate-[mf-sheet-in_260ms_cubic-bezier(.2,.8,.2,1)]';

  const wrapperClasses = isFullscreen
    ? 'fixed inset-0 flex items-center justify-center overflow-y-auto modal z-99999'
    : 'fixed inset-0 flex items-center justify-center overflow-y-auto modal z-99999 max-lg:items-end max-lg:overflow-hidden';

  return (
    <div className={wrapperClasses}>
      {!isFullscreen && (
        <div
          className="fixed inset-0 h-full w-full bg-gray-400/50 backdrop-blur-[32px]"
          onClick={onClose}
        ></div>
      )}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        data-mf-sheet={isFullscreen ? undefined : ''}
        className={`${contentClasses}  ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {!isFullscreen && (
          <div
            aria-hidden
            className="mx-auto mb-2 mt-2 h-[5px] w-9 rounded-full bg-mf-transparencia lg:hidden"
          />
        )}
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-3 top-3 z-999 flex h-9.5 w-9.5 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white sm:right-6 sm:top-6 sm:h-11 sm:w-11 max-lg:h-11 max-lg:w-11"
          >
            <svg
              width="24"
              height="24"
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
        )}
        <div>{children}</div>
      </div>
    </div>
  );
};
