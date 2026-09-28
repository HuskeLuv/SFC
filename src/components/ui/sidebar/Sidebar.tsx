'use client';
import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { lockBodyScroll } from '@/lib/ui/scrollLock';
import { useIsBelowLg } from '@/hooks/useMediaQuery';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

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
  /**
   * PWA fase 1, SÓ CELULAR (lg:hidden): rodapé fixo (ações do wizard). Fica fora da área que rola,
   * com a área segura de baixo, e acima do teclado (a altura do painel acompanha o visualViewport).
   * O desktop continua com os botões dentro do conteúdo.
   */
  footer?: React.ReactNode;
  /** PWA fase 1, SÓ CELULAR (lg:hidden): conteúdo sob o título (ex.: progresso do wizard). */
  headerExtra?: React.ReactNode;
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
  footer,
  headerExtra,
}) => {
  const sidebarRef = useRef<HTMLDivElement>(null);
  // Celular: com o teclado aberto (iOS não encolhe a janela) o painel ocupa só a área visível, e o
  // rodapé fica acima do teclado. No desktop nada muda (hook desligado, sem style).
  const isBelowLg = useIsBelowLg();
  const keyboard = useKeyboardInset(isOpen && isBelowLg);
  const keyboardStyle: React.CSSProperties | undefined =
    isBelowLg && keyboard.height !== null
      ? { height: keyboard.height, top: keyboard.offsetTop }
      : undefined;

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    let releaseScroll: (() => void) | undefined;
    if (isOpen) {
      if (closeOnEscape) {
        document.addEventListener('keydown', handleEscape);
      }
      // No modo drawer (noBackdrop), o app continua navegável — não
      // bloqueia scroll do body. Em modal tradicional sim (trava compartilhada
      // com o Modal: um fechar não destrava o outro).
      if (!noBackdrop) {
        releaseScroll = lockBodyScroll();
      }
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      releaseScroll?.();
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
          {/* role/aria-modal: abaixo de lg a casca mobile (barra de abas/cabeçalho) some enquanto o
              drawer estiver aberto — regra :has([aria-modal]) de globals.css. */}
          <motion.div
            ref={sidebarRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={keyboardStyle}
            className={`fixed right-0 top-0 h-full w-full max-w-md bg-white dark:bg-gray-900 z-[500] flex flex-col max-lg:h-dvh max-lg:pt-[env(safe-area-inset-top)] ${
              footer ? '' : 'max-lg:pb-[env(safe-area-inset-bottom)] '
            }${
              noBackdrop ? 'border-l border-gray-200 dark:border-gray-800 shadow-xl' : 'shadow-2xl'
            } ${className}`}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 max-lg:min-h-14 max-lg:px-4 max-lg:py-2">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white max-lg:min-w-0 max-lg:truncate max-lg:text-lg">
                {title}
              </h2>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white max-lg:h-11 max-lg:w-11 max-lg:shrink-0"
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

            {headerExtra ? <div className="shrink-0 lg:hidden">{headerExtra}</div> : null}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 max-lg:p-4">{children}</div>

            {footer ? (
              <div
                data-mf-wizard-footer=""
                className="shrink-0 border-t border-gray-200 bg-white px-4 pt-2.5 lg:hidden pb-[max(0.625rem,env(safe-area-inset-bottom))] dark:border-gray-700 dark:bg-gray-900"
              >
                {footer}
              </div>
            ) : null}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default Sidebar;
