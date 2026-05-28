'use client';

import { progress, pmt } from '@/services/planejamento/planejamentoSonhos';
import type { PlanejamentoObjetivoDTO } from '@/hooks/usePlanejamentoSonhos';
import { formatBRLCompact, categoryAccent } from './utils';
import { StatusBadge, PriorityBadge, CategoryBadge } from './SonhosBadges';

interface SonhosObjetivoCardProps {
  objetivo: PlanejamentoObjetivoDTO;
  onClick: () => void;
}

/**
 * Card de objetivo (usado na lista do dashboard). Mostra meta, atual,
 * progresso e aporte mensal necessário. Clicar abre o detalhe.
 */
export default function SonhosObjetivoCard({ objetivo, onClick }: SonhosObjetivoCardProps) {
  const { pct, balance } = progress(objetivo);
  const aporte = pmt(objetivo);
  const accent = categoryAccent(objetivo.category);
  const isDone = pct >= 100;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-white p-4 text-left transition hover:border-brand-300 hover:shadow-md dark:border-gray-800 dark:bg-white/[0.03] dark:hover:border-brand-500"
    >
      <span
        className="absolute left-0 top-0 h-full w-1"
        style={{ backgroundColor: accent }}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2">
        <CategoryBadge category={objetivo.category} />
        <StatusBadge status={objetivo.status} />
      </div>

      <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-white/90 line-clamp-2">
        {objetivo.name}
      </h3>
      <p className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span>{objetivo.months} meses</span>
        <span>·</span>
        <PriorityBadge priority={objetivo.priority} />
      </p>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Meta
          </div>
          <div className="text-base font-semibold text-gray-900 dark:text-white">
            {formatBRLCompact(objetivo.target)}
          </div>
        </div>
        <div className="text-lg font-semibold" style={{ color: isDone ? '#10b981' : accent }}>
          {pct.toFixed(0)}%
        </div>
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: accent }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
        <span>
          Atual:{' '}
          <strong className="text-gray-900 dark:text-white/90">{formatBRLCompact(balance)}</strong>
        </span>
        <span>
          Aporte:{' '}
          <strong className="text-gray-900 dark:text-white/90">
            {formatBRLCompact(aporte)}/mês
          </strong>
        </span>
      </div>
    </button>
  );
}
