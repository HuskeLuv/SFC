/**
 * Selo de status de um critério do semáforo (fatia 0b; decisão 1): sempre ÍCONE + TEXTO, nunca só
 * cor. Atende = círculo cheio com ✓ e Parcial = meio círculo, os dois em patrimonio/tranquilidade;
 * Não atende = círculo com ✕ em vermelho; Sem dado = círculo tracejado com '?' e borda tracejada;
 * Não se aplica = traço. Cores e formas em STATUS_CRITERIO (analiseAtivosVisual).
 */
import { STATUS_CRITERIO, type EstiloStatusCriterio } from '@/constants/analiseAtivosVisual';
import { TEXTOS_ANALISE } from '@/services/analiseAtivos/textos';
import type { BadgeCriterioProps, StatusCriterioTela } from '@/types/analiseAtivosApi';

export type { BadgeCriterioProps };

/** Ícone 16×16 de cada forma (currentColor). Exportado para legendas da área. */
export function IconeCriterio({
  icone,
  className,
}: {
  icone: EstiloStatusCriterio['icone'];
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      data-icone={icone}
      className={`shrink-0 ${className ?? 'h-4 w-4'}`}
    >
      {icone === 'circulo_check' ? (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M4.8 8.2l2.1 2.1 4.3-4.5"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {icone === 'meio_circulo' ? (
        <>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 1.8a6.2 6.2 0 0 1 0 12.4z" fill="currentColor" />
        </>
      ) : null}
      {icone === 'xis' ? (
        <>
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </>
      ) : null}
      {icone === 'circulo_tracejado_interrogacao' ? (
        <>
          <circle
            cx="8"
            cy="8"
            r="6.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="2.4 2"
          />
          <path
            d="M6.4 6.4a1.7 1.7 0 1 1 2.3 1.6c-.5.2-.7.5-.7 1v.3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="8" cy="11.4" r=".8" fill="currentColor" />
        </>
      ) : null}
      {icone === 'traco' ? (
        <path d="M4 8h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

/** Cor do texto: o ícone carrega a cor do status; o texto fica neutro (contraste AA). */
const TEXTO_ROTULO: Record<StatusCriterioTela, string> = {
  atende: 'font-semibold text-gray-800 dark:text-white/90',
  parcial: 'font-semibold text-gray-800 dark:text-white/90',
  nao_atende: 'font-semibold text-gray-800 dark:text-white/90',
  sem_dado: 'font-medium text-gray-700 dark:text-gray-300',
  nao_se_aplica: 'font-medium text-gray-500 dark:text-gray-400',
};

export default function BadgeCriterio({ status, rotulo, compacto, className }: BadgeCriterioProps) {
  const e = STATUS_CRITERIO[status];
  const texto = rotulo ?? TEXTOS_ANALISE.status[status];
  return (
    <span
      data-status={status}
      className={`inline-flex items-center rounded-full whitespace-nowrap ${
        compacto
          ? 'gap-1 py-px pr-2 pl-1 text-[11.5px]'
          : 'gap-1.5 py-[3px] pr-2.5 pl-1.5 text-[12.5px]'
      } ${e.fundo} ${e.borda} ${TEXTO_ROTULO[status]} ${className ?? ''}`}
    >
      <span className={`inline-flex ${e.texto}`}>
        <IconeCriterio icone={e.icone} className={compacto ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </span>
      {texto}
    </span>
  );
}
