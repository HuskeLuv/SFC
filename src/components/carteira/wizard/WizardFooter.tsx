'use client';

import React from 'react';

interface WizardFooterProps {
  /** Ação do botão da esquerda (Voltar, ou Cancelar na primeira etapa). */
  onBack?: () => void;
  backLabel?: 'Voltar' | 'Cancelar';
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  /** Salvando: os dois botões travam e o primário fica ocupado. */
  loading?: boolean;
}

/**
 * Rodapé do wizard no celular (PWA fase 1). Vai no `footer` do Sidebar, que o mantém fora da área
 * que rola, com a área segura de baixo e acima do teclado. Só renderizado abaixo de lg — o desktop
 * continua com os botões dentro do conteúdo.
 */
export default function WizardFooter({
  onBack,
  backLabel = 'Voltar',
  onNext,
  nextLabel,
  nextDisabled = false,
  loading = false,
}: WizardFooterProps) {
  return (
    <div className={onBack ? 'grid grid-cols-[auto_1fr] gap-2.5' : 'grid grid-cols-1'}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="h-12 rounded-xl border border-gray-300 bg-white px-5 text-base font-medium text-gray-700 active:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:active:bg-gray-700"
        >
          {backLabel}
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || loading}
        aria-busy={loading || undefined}
        className="h-12 rounded-xl bg-mf-patrimonio px-5 text-base font-semibold text-white active:bg-mf-seguranca disabled:cursor-not-allowed disabled:opacity-50"
      >
        {nextLabel}
      </button>
    </div>
  );
}
