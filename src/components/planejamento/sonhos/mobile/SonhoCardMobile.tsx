'use client';

import { progress } from '@/services/planejamento/planejamentoSonhos';
import type { PlanejamentoObjetivoDTO } from '@/hooks/usePlanejamentoSonhos';
import { MobileStatusPill } from '@/components/ui/mobile/MobileStatusPill';
import { CATEGORY_LONG_LABELS, formatBRLCompact } from '../utils';
import { sonhoSituacao } from './sonhoSituacao';

interface SonhoCardMobileProps {
  objetivo: PlanejamentoObjetivoDTO;
  onClick: () => void;
}

/**
 * Cartão do objetivo no celular (PWA fase 3, P4): nome, prazo e prioridade, atual × meta, barra de
 * progresso de 8px, "faltam R$ X em N meses" e o selo da situação (ponto + palavra, sem verde).
 * Mesmos números do cartão e da tabela do desktop (progress; meses = prazo − registros, como no
 * detalhe). Vai dentro de um `li[data-mf-card]` (quem lista).
 */
export default function SonhoCardMobile({ objetivo, onClick }: SonhoCardMobileProps) {
  const { pct, balance, count } = progress(objetivo);
  const restante = Math.max(0, objetivo.target - balance);
  const mesesRestantes = Math.max(0, objetivo.months - count);
  const situacao = sonhoSituacao(objetivo);
  const pctLabel = `${pct.toFixed(0)}%`;

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-2xl border border-gray-200 bg-white px-4 py-3.5 text-left active:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:active:bg-white/[0.06]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-gray-900 dark:text-white/90">
            {objetivo.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
            {CATEGORY_LONG_LABELS[objetivo.category]} · prioridade {objetivo.priority.toLowerCase()}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-base font-semibold tabular-nums text-gray-900 dark:text-white/90">
            {formatBRLCompact(balance)}
          </p>
          <p className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
            de {formatBRLCompact(objetivo.target)}
          </p>
        </div>
      </div>
      <div
        role="img"
        aria-label={`${pctLabel} da meta`}
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
      >
        <div
          className="h-full rounded-full bg-[#0079F2]"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="min-w-0 text-xs text-gray-600 dark:text-gray-300">
          {pctLabel} ·{' '}
          {restante > 0 ? (
            <>
              faltam{' '}
              <strong className="tabular-nums text-gray-900 dark:text-white/90">
                {formatBRLCompact(restante)}
              </strong>{' '}
              em {mesesRestantes} {mesesRestantes === 1 ? 'mês' : 'meses'}
            </>
          ) : (
            'meta atingida'
          )}
        </span>
        <MobileStatusPill tone={situacao.tone} className="shrink-0">
          {situacao.label}
        </MobileStatusPill>
      </div>
    </button>
  );
}
