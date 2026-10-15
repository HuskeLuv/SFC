'use client';

/**
 * SeletorTipoFii (v2.4, fatia D) — 'Tijolo | Papel' na barra do Comparador, só em FIIs. Grupo de
 * botões com aria-pressed (alvo de 44 px também no computador; pílula visível de 32 px, no mesmo
 * desenho da PilulasJanela). Escolher um tipo deixa na comparação só os fundos daquele tipo
 * (critérios de qualidade diferentes; rec. do protótipo do Pedro). No misto, nenhum fica marcado.
 */
import { TEXTOS_COMPARADOR } from '@/services/analiseAtivos/textosComparador';
import type { SeletorTipoFiiProps } from '@/types/analiseAtivosCriterios';

export type { SeletorTipoFiiProps };

const T = TEXTOS_COMPARADOR.tipoFii;

export type SeletorTipoFiiPropsD = SeletorTipoFiiProps & {
  /** misto (tijolo + papel): nenhum botão pressionado */
  indefinido?: boolean;
};

export default function SeletorTipoFii({
  valor,
  onTrocar,
  indefinido = false,
  className = '',
}: SeletorTipoFiiPropsD) {
  return (
    <div
      role="group"
      aria-label={T.rotulo}
      title={T.dica}
      data-seletor-tipo-fii=""
      className={`inline-flex items-center gap-1 ${className}`}
    >
      {(['tijolo', 'papel'] as const).map((tipo) => {
        const ativo = !indefinido && valor === tipo;
        return (
          <button
            key={tipo}
            type="button"
            aria-pressed={ativo}
            onClick={() => {
              if (!ativo) onTrocar(tipo);
            }}
            data-tipo-fii={tipo}
            className="group inline-flex min-h-11 items-center justify-center focus-visible:outline-none"
          >
            <span
              className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium whitespace-nowrap group-focus-visible:ring-2 group-focus-visible:ring-[#0079F2] dark:group-focus-visible:ring-[#6E9DC4] ${
                ativo
                  ? 'border-[#396CAA] bg-[#EDF2F8] text-[#314666] dark:border-[#6E9DC4] dark:bg-[#6E9DC4]/15 dark:text-[#6E9DC4]'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-[#2E3440] dark:bg-transparent dark:text-gray-300 dark:hover:border-gray-500'
              }`}
            >
              {T[tipo]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
