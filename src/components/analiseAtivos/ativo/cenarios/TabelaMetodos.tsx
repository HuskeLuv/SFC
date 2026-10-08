'use client';

/**
 * Resultados dos métodos (Bloco D, fatia B). Ordem fixa, sem ranking.
 *
 * - Computador: tabela TABLE_STYLES (Método · Suas premissas · Resultado · vs. cotação · Com sua
 *   margem), coluna Método fixa com fundo opaco; "vs. cotação" em cinza neutro com sinal, sem cor
 *   semântica nem seta; "—" com o motivo na própria célula.
 * - Celular (decisão 13): CARTÕES (ul com aria-label) — método e resultado, premissas, motivo do
 *   "—" e um dl com "vs. cotação" e "Com sua margem"; o último cartão é a cotação de hoje.
 */
import { FUNDO_STICKY } from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import {
  formatarComSinalBR,
  formatarNumeroBR,
} from '@/services/analiseAtivos/regras/valuation/arredondamento';
import type { LinhaCenario } from '@/services/analiseAtivos/regras/valuation/montarCenarios';
import { TEXTOS_CENARIOS } from '@/services/analiseAtivos/textosCenarios';
import { formatarTexto } from '@/services/analiseAtivos/textos';

const T = TEXTOS_CENARIOS;

export function reais(v: number | null): string {
  return v === null ? '—' : `R$ ${formatarNumeroBR(v, 2)}`;
}

export function vsTexto(v: number | null): string {
  return v === null ? '—' : `${formatarComSinalBR(v, 0)}%`;
}

interface Props {
  linhas: LinhaCenario[];
  cotacao: number | null;
  margemPct: number;
  celular: boolean;
}

export default function TabelaMetodos({ linhas, cotacao, margemPct, celular }: Props) {
  const legenda = formatarTexto(T.resultados.caption, {
    valor: reais(cotacao),
    n: margemPct,
  });

  if (celular) {
    return (
      <ul
        aria-label={`${T.resultados.rotuloListaCelular}. ${legenda}`}
        className="m-0 flex list-none flex-col gap-2 p-0"
        data-cenarios-cartoes=""
      >
        {linhas.map((l) => (
          <li
            key={l.metodo}
            data-metodo={l.metodo}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2.5 gap-y-0.5 rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-800"
          >
            <span className="text-[14.5px] font-semibold text-gray-800 dark:text-white/90">
              {l.rotulo}
              {l.usaDadoEmConferencia ? (
                <small className="block text-xs font-normal text-gray-500 dark:text-gray-400">
                  {l.usaDadoEmConferencia}
                </small>
              ) : null}
            </span>
            <span className="text-right text-[17px] font-semibold text-gray-800 tabular-nums dark:text-white/90">
              {reais(l.resultado)}
            </span>
            <span className="col-span-2 text-[12.5px] text-gray-500 dark:text-gray-400">
              {l.premissasTexto}
            </span>
            {l.motivoSemResultado ? (
              <span className="col-span-2 text-[12.5px] text-gray-700 dark:text-gray-200">
                {l.motivoSemResultado}
              </span>
            ) : null}
            <dl className="col-span-2 mt-1 mb-0 flex flex-wrap gap-x-[18px] gap-y-1 text-[13px]">
              <div className="flex gap-1.5">
                <dt className="text-gray-500 dark:text-gray-400">{T.colunas.vsCotacao}</dt>
                <dd
                  className="m-0 text-gray-800 tabular-nums dark:text-white/90"
                  data-vs-cotacao=""
                >
                  {vsTexto(l.vsCotacaoPct)}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-gray-500 dark:text-gray-400">{T.colunas.comMargem}</dt>
                <dd className="m-0 text-gray-800 tabular-nums dark:text-white/90">
                  {reais(l.comMargem)}
                </dd>
              </div>
            </dl>
          </li>
        ))}
        <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2.5 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-white/[0.03]">
          <span className="text-[14.5px] font-semibold text-gray-800 dark:text-white/90">
            {T.resultados.cotacaoHoje}
          </span>
          <span className="text-right text-[17px] font-semibold text-gray-800 tabular-nums dark:text-white/90">
            {reais(cotacao)}
          </span>
        </li>
      </ul>
    );
  }

  return (
    <div
      className={TABLE_STYLES.wrapper}
      role="region"
      tabIndex={0}
      aria-label={T.resultados.rotuloRegiao}
      data-cenarios-tabela=""
    >
      <table className={TABLE_STYLES.table}>
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
            <th
              scope="col"
              className={`${TABLE_STYLES.th} sticky left-0 z-10 text-left`}
              style={TABLE_HEADER_STYLE}
            >
              {T.colunas.metodo}
            </th>
            <th scope="col" className={`${TABLE_STYLES.th} text-left`}>
              {T.colunas.premissas}
            </th>
            <th scope="col" className={`${TABLE_STYLES.th} text-right`}>
              {T.colunas.resultado}
            </th>
            <th scope="col" className={`${TABLE_STYLES.th} text-right`}>
              {T.colunas.vsCotacao}
            </th>
            <th scope="col" className={`${TABLE_STYLES.th} text-right`}>
              {T.colunas.comMargem}
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.metodo} className={TABLE_STYLES.row} data-metodo={l.metodo}>
              <th
                scope="row"
                className={`${TABLE_STYLES.td} sticky left-0 z-[1] min-w-[150px] text-left font-semibold text-gray-800 dark:text-white/90 ${FUNDO_STICKY}`}
              >
                {l.rotulo}
                {l.usaDadoEmConferencia ? (
                  <small className="block text-xs font-normal text-gray-500 dark:text-gray-400">
                    {l.usaDadoEmConferencia}
                  </small>
                ) : null}
              </th>
              <td className={`${TABLE_STYLES.td} min-w-[150px] text-[12.5px]`}>
                {l.premissasTexto}
              </td>
              <td className={`${TABLE_STYLES.td} text-right whitespace-nowrap`}>
                {l.resultado !== null ? (
                  <span className="font-semibold text-gray-800 tabular-nums dark:text-white/90">
                    {reais(l.resultado)}
                  </span>
                ) : (
                  <>
                    <span className="text-gray-500 dark:text-gray-400">—</span>
                    {l.motivoSemResultado ? (
                      <span className="ml-auto block max-w-[190px] text-right text-xs whitespace-normal text-gray-500 dark:text-gray-400">
                        {l.motivoSemResultado}
                      </span>
                    ) : null}
                  </>
                )}
              </td>
              <td
                className={`${TABLE_STYLES.td} text-right whitespace-nowrap text-gray-700 tabular-nums dark:text-gray-200`}
                data-vs-cotacao=""
              >
                {vsTexto(l.vsCotacaoPct)}
              </td>
              <td className={`${TABLE_STYLES.td} text-right whitespace-nowrap tabular-nums`}>
                {reais(l.comMargem)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
