/**
 * Rodapé do Quadro: a fórmula pública do Índice MF (texto neutro) e a linha de frescor da cotação.
 * Cotação atrasada vira faixa com ícone + texto (não só cor).
 */
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { FrescorCotacao } from '@/types/analiseAtivosApi';

const T = TEXTOS_TELA.quadro;

function dataBr(iso: string): string {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

function IconeRelogio() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7v5l3 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FaixaFrescorAtrasado({ frescor }: { frescor: FrescorCotacao | undefined }) {
  if (frescor?.status !== 'atrasado') return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl border border-dashed border-[#98A2B3] px-3 py-2 text-sm text-gray-700 dark:text-gray-200"
    >
      <IconeRelogio />
      <span>
        {T.frescorAtrasado}
        {frescor.data ? ` · ${formatarTexto(T.cotacoesDe, { data: dataBr(frescor.data) })}` : ''}
      </span>
    </div>
  );
}

export default function RodapeFormula({ frescor }: { frescor: FrescorCotacao | undefined }) {
  return (
    <div className="flex flex-col gap-2 text-xs text-gray-500 dark:text-gray-400">
      <p>
        <strong className="font-semibold text-gray-700 dark:text-gray-200">
          {T.formulaRotulo}
        </strong>{' '}
        {T.formulaTexto}{' '}
        <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px] text-gray-700 dark:bg-white/[0.06] dark:text-gray-200">
          {T.formula}
        </code>
        . {T.formulaNota}
      </p>
      {frescor?.data ? (
        <p className="flex items-center gap-1.5">
          <IconeRelogio />
          {formatarTexto(T.cotacoesDe, { data: dataBr(frescor.data) })}
        </p>
      ) : null}
    </div>
  );
}
