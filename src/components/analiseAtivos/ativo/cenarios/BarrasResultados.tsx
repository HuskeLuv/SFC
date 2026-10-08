'use client';

/**
 * "Resultados lado a lado" (Bloco D, fatia B): uma barra por método, MESMA escala a partir de zero,
 * na ordem fixa dos métodos. Barra de 18px com raio 4: a parte escura vai até "com sua margem" e a
 * parte clara até o resultado (patrimonio/tranquilidade, sem cor semântica). Linha tracejada da
 * cotação com rótulo. O desenho é aria-hidden; a tabela/cartões trazem os mesmos números (texto
 * sr-only). Sem nenhum resultado: um aviso único no lugar das barras.
 */
import type { BarrasCenario } from '@/services/analiseAtivos/regras/valuation/montarCenarios';
import { formatarNumeroBR } from '@/services/analiseAtivos/regras/valuation/arredondamento';
import { TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import { formatarTexto } from '@/services/analiseAtivos/textos';

const T = TEXTOS_CENARIOS.barras;

interface Props {
  barras: BarrasCenario;
  nenhumResultado: boolean;
  /** ação com LPA ≤ 0 e sem proventos: explica por que nenhum método tem resultado */
  explicacaoAcao?: boolean;
}

const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;

export default function BarrasResultados({ barras, nenhumResultado, explicacaoAcao }: Props) {
  if (nenhumResultado || barras.escalaMax <= 0) {
    return (
      <div
        className="flex flex-col gap-1 rounded-xl border border-dashed border-gray-400 bg-gray-50 px-3.5 py-3 text-[13.5px] text-gray-700 dark:border-gray-600 dark:bg-white/[0.03] dark:text-gray-200"
        data-cenarios-sem-resultado=""
      >
        <b className="text-gray-800 dark:text-white/90">{T.nenhumResultado}</b>
        <span>
          {explicacaoAcao ? `${T.nenhumResultadoAcaoLpaNegativo} ` : ''}
          {T.digiteOutros}
        </span>
      </div>
    );
  }
  const max = barras.escalaMax;
  const cot = barras.cotacao;
  return (
    <figure className="m-0 flex flex-col gap-2" data-cenarios-barras="">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h3 className="text-[15px] font-semibold text-gray-800 dark:text-white/90">{T.titulo}</h3>
        <div
          aria-hidden="true"
          className="flex flex-wrap gap-3.5 text-[12.5px] text-gray-700 dark:text-gray-200"
        >
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-3.5 rounded-sm bg-[#396CAA] dark:bg-[#6E9DC4]" />
            {T.legendaMargem}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block h-2.5 w-3.5 rounded-sm bg-[#396CAA]/20 dark:bg-[#6E9DC4]/30" />
            {T.legendaAteResultado}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="inline-block w-4 border-t-2 border-dashed border-[#2D2D2D] dark:border-[#EAEAEA]" />
            {T.legendaCotacao}
          </span>
        </div>
      </div>
      <div aria-hidden="true" className="grid grid-cols-[minmax(84px,118px)_minmax(0,1fr)] gap-x-2">
        {/* faixa da cotação, no topo da coluna das barras */}
        <span />
        <div className="relative mr-12 h-5">
          {cot !== null ? (
            <span
              className="absolute top-0 -translate-x-1/2 text-[11.5px] font-semibold whitespace-nowrap text-gray-800 tabular-nums dark:text-white/90"
              style={{ left: `clamp(32px, ${pct(cot, max)}, calc(100% - 32px))` }}
            >
              {formatarTexto(T.rotuloCotacao, { valor: formatarNumeroBR(cot, 2) })}
            </span>
          ) : null}
        </div>
        {barras.itens.map((b) => (
          <div key={b.metodo} className="contents" data-barra={b.metodo}>
            <span className="self-center py-1.5 text-xs leading-tight font-semibold text-gray-800 dark:text-white/90">
              {b.rotulo}
            </span>
            <div className="relative mr-12 flex min-h-[30px] items-center">
              {b.resultado !== null ? (
                <>
                  <span
                    className="relative block h-[18px] flex-none"
                    style={{ width: pct(b.resultado, max) }}
                  >
                    <span className="absolute inset-0 rounded bg-[#396CAA]/20 dark:bg-[#6E9DC4]/30" />
                    {b.comMargem !== null ? (
                      <span
                        className="absolute inset-y-0 left-0 rounded bg-[#396CAA] dark:bg-[#6E9DC4]"
                        style={{ width: `${(b.comMargem / b.resultado) * 100}%` }}
                      />
                    ) : null}
                  </span>
                  <span
                    className="absolute ml-1.5 text-xs font-semibold whitespace-nowrap text-gray-800 tabular-nums dark:text-white/90"
                    style={{ left: pct(b.resultado, max) }}
                  >
                    {formatarNumeroBR(b.resultado, 2)}
                  </span>
                </>
              ) : (
                <span className="relative z-[1] -mr-12 bg-white pr-1 text-xs text-gray-500 dark:bg-[#1F1F22] dark:text-gray-400">
                  — {b.motivo ?? T.semResultado}
                </span>
              )}
              {cot !== null ? (
                <span
                  className="absolute inset-y-0 border-l-[1.5px] border-dashed border-[#2D2D2D] dark:border-[#EAEAEA]"
                  style={{ left: pct(cot, max) }}
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <figcaption className="text-[13px] text-gray-500 dark:text-gray-400">
        {T.escala}
        <span className="sr-only"> {T.alternativaTexto}</span>
      </figcaption>
    </figure>
  );
}
