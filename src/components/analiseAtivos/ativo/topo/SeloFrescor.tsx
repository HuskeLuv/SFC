/**
 * Selo de frescor (fatia B): 'Dados: cotação B3 de 29/09 · CVM DFP 2025 / ITR 2T26 · informe FII
 * ago/26'. Camada atrasada no painel da Fase 0: ícone + texto 'atualização em atraso' (nunca só
 * cor).
 */
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { SeloFrescorProps } from '@/types/analiseAtivosApi';

export type { SeloFrescorProps };

export default function SeloFrescor({ frescor }: SeloFrescorProps) {
  const partes = [frescor.cotacao, frescor.fundamentos, frescor.fii].filter(
    (p): p is string => !!p,
  );
  return (
    <p
      data-bloco="frescor"
      data-atrasado={frescor.painelAtrasado || undefined}
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-gray-500 dark:text-gray-400"
    >
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <span>
        {TEXTOS_TELA.blocos.frescor}: {partes.join(' · ')}
      </span>
      {frescor.painelAtrasado ? (
        <span className="inline-flex items-center gap-1 font-medium text-gray-700 dark:text-gray-200">
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 3 2 21h20L12 3z" />
            <path d="M12 10v5M12 18h.01" />
          </svg>
          {TEXTOS_TELA.ativo.frescorAtrasado}
        </span>
      ) : null}
    </p>
  );
}
