/**
 * MarcaCriterio (v2.4, fatia 0) — marca NEUTRA de um critério de fundamentos:
 *  - atende: ✓ em círculo preenchido (tinta neutra gray-700; gray-300 no escuro); com tom='verde'
 *    (só na página do ativo — exceção à paleta autorizada pelo Wellington 17/10) o círculo usa
 *    MARCA_ATENDE_VERDE;
 *  - não atende E sem dado: — em círculo vazado (sem dado conta como não atende);
 *  - não se aplica: 'n/a' em pílula tracejada.
 * Fora o ✓ verde da exceção, NUNCA verde/vermelho nem classe de placar (spec §9, D1). 22 px
 * ('md') ou 16 px ('sm').
 * A marca é aria-hidden; o estado vai em texto sr-only ('atende:'), salvo `decorativa`.
 */
import { MARCA_ATENDE_VERDE } from '@/constants/analiseAtivosVisual';
import { TEXTOS_CRITERIOS } from '@/services/analiseAtivos/textosCriterios';
import type { MarcaCriterioProps } from '@/types/analiseAtivosCriterios';

export type { MarcaCriterioProps };

const TAMANHO = {
  md: { circulo: 'h-[22px] w-[22px]', icone: 12, pilula: 'h-[22px] px-1.5 text-[11px]' },
  sm: { circulo: 'h-4 w-4', icone: 9, pilula: 'h-4 px-1 text-[10px]' },
} as const;

export default function MarcaCriterio({
  estado,
  tamanho = 'md',
  decorativa = false,
  tom = 'neutro',
  className = '',
}: MarcaCriterioProps) {
  const t = TAMANHO[tamanho];
  let marca;
  if (estado === 'atende') {
    const tinta =
      tom === 'verde'
        ? MARCA_ATENDE_VERDE
        : 'bg-gray-700 text-white dark:bg-gray-300 dark:text-gray-900';
    marca = (
      <span
        aria-hidden="true"
        className={`inline-flex ${t.circulo} flex-none items-center justify-center rounded-full ${tinta}`}
      >
        <svg
          width={t.icone}
          height={t.icone}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12.5 10 17 19 7" />
        </svg>
      </span>
    );
  } else if (estado === 'nao_se_aplica') {
    marca = (
      <span
        aria-hidden="true"
        className={`inline-flex ${t.pilula} flex-none items-center justify-center rounded-full border border-dashed border-gray-400 leading-none text-gray-500 dark:border-gray-500 dark:text-gray-400`}
      >
        {TEXTOS_CRITERIOS.marcas.nao_se_aplica}
      </span>
    );
  } else {
    marca = (
      <span
        aria-hidden="true"
        className={`inline-flex ${t.circulo} flex-none items-center justify-center rounded-full border-[1.5px] border-gray-700 leading-none text-gray-700 dark:border-gray-300 dark:text-gray-300`}
      >
        {TEXTOS_CRITERIOS.marcas[estado]}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center ${className}`} data-estado-criterio={estado}>
      {marca}
      {decorativa ? null : <span className="sr-only">{TEXTOS_CRITERIOS.marcasSr[estado]}</span>}
    </span>
  );
}
