'use client';

/**
 * Atalho "Tem uma informação sobre isso? Reportar" (bloco C). Só o gatilho: quem usa decide como o
 * formulário abre (BotaoReportarDado 'link' abre o próprio; o ChipConferencia fecha antes o
 * "Por quê?" — e a camada de histórico dele no celular — e só então abre o formulário).
 */
import { forwardRef } from 'react';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import type { BlocoReporte } from '@/services/analiseAtivos/curadoria/contrato';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';

const FOCO =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]';

export interface GatilhoReportarProps {
  bloco: BlocoReporte;
  onClick: () => void;
  className?: string;
}

const GatilhoReportar = forwardRef<HTMLButtonElement, GatilhoReportarProps>(
  function GatilhoReportar({ bloco, onClick, className }, ref) {
    const t = TEXTOS_TELA.conferencia.porQue;
    return (
      <span className={`text-sm text-gray-600 dark:text-gray-300 ${className ?? ''}`}>
        {t.reportarPergunta}{' '}
        <button
          ref={ref}
          type="button"
          aria-haspopup="dialog"
          data-relato-gatilho={bloco}
          onClick={onClick}
          className={`inline-flex min-h-11 items-center font-semibold underline-offset-2 hover:underline ${COR_LINK.classes} ${FOCO}`}
        >
          {t.reportarLink}
        </button>
      </span>
    );
  },
);

export default GatilhoReportar;
