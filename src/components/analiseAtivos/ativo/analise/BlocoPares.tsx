'use client';

/**
 * Pares do segmento (fatia C): o próprio ativo primeiro (linha destacada, sem link) e até 5 pares
 * clicáveis (abrem /analise-ativos/[ticker]). Mesma consulta do Valuation (useValuationAtivo).
 * Computador: tabela TABLE_STYLES com th scope="row"; celular: cartões (links de 44px+).
 * Índice incompleto com asterisco; sem Índice/fora do Índice = '—' com o motivo no title.
 * Critério exibido em texto; sem pares: 'sem pares no mesmo segmento'.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CartaoAnalise, {
  FUNDO_STICKY,
  TEXTO_NEGATIVO,
} from '@/components/analiseAtivos/ativo/analise/CartaoAnalise';
import { formatarAnalise, formatarEstado } from '@/components/analiseAtivos/comum/formatarAnalise';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import { useValuationAtivo } from '@/hooks/useAnaliseAtivos';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type {
  BlocoParesProps,
  ClasseQuadro,
  Estado,
  FormatoAnalise,
  LinhaQuadroApi,
} from '@/types/analiseAtivosApi';

export type { BlocoParesProps };

const TP = TEXTOS_TELA.analise.pares;
const C = TP.colunas;
const SEM = TEXTOS_TELA.formato.semDado;

interface ColunaPar {
  codigo: string;
  rotulo: string;
  valor: (l: LinhaQuadroApi) => { texto: string; negativo?: boolean; title?: string };
}

function deEstado(e: Estado<number>, formato: FormatoAnalise) {
  return {
    texto: formatarEstado(e, formato),
    negativo: e.estado === 'ok' && e.valor < 0,
    title: e.estado === 'ok' ? undefined : e.texto,
  };
}

function deNumero(n: number | null, formato: FormatoAnalise) {
  return { texto: n === null ? SEM : formatarAnalise(n, formato) };
}

export function textoIndicePar(l: LinhaQuadroApi): { texto: string; title?: string } {
  const { indice } = l;
  if (
    indice.valor === null ||
    indice.estado === 'sem_score' ||
    indice.estado === 'fora_do_indice'
  ) {
    return { texto: SEM, title: indice.motivos[0]?.texto };
  }
  const texto = formatarAnalise(indice.valor, 'numero');
  return indice.estado === 'incompleto'
    ? { texto: `${texto}*`, title: TEXTOS_TELA.selos.dadosIncompletos }
    : { texto };
}

const COLUNAS: Record<ClasseQuadro, ColunaPar[]> = {
  acao: [
    { codigo: 'pl', rotulo: C.pl, valor: (l) => deEstado(l.pl, 'numero') },
    { codigo: 'pvp', rotulo: C.pvp, valor: (l) => deEstado(l.pvp, 'numero2') },
    { codigo: 'roe', rotulo: C.roe, valor: (l) => deEstado(l.roe, 'pct') },
    { codigo: 'margem', rotulo: C.margem, valor: (l) => deEstado(l.margemLiquida, 'pct') },
    { codigo: 'dy12m', rotulo: C.dy12m, valor: (l) => deEstado(l.dy12m, 'pct') },
    {
      codigo: 'lucrosSeguidos',
      rotulo: C.lucrosSeguidos,
      valor: (l) => deNumero(l.anosLucroConsecutivos, 'inteiro'),
    },
    { codigo: 'indiceMf', rotulo: C.indiceMf, valor: textoIndicePar },
  ],
  fii: [
    { codigo: 'dy12m', rotulo: C.dy12m, valor: (l) => deEstado(l.dy12m, 'pct') },
    { codigo: 'pvp', rotulo: C.pvp, valor: (l) => deEstado(l.pvp, 'numero2') },
    {
      codigo: 'obrigacoesPl',
      rotulo: C.obrigacoesPl,
      valor: (l) => deEstado(l.obrigacoesPl, 'pct'),
    },
    {
      codigo: 'imoveisCris',
      rotulo: C.imoveisCris,
      valor: (l) => deNumero(l.fiiTipo === 'papel' ? l.nCri : l.nImoveisCvm, 'inteiro'),
    },
    {
      codigo: 'patrimonio',
      rotulo: C.patrimonio,
      valor: (l) => deNumero(l.patrimonio, 'moedaCompacta'),
    },
    {
      codigo: 'liquidez',
      rotulo: C.liquidez,
      valor: (l) => deNumero(l.liquidezMedia21, 'moedaCompacta'),
    },
    { codigo: 'indiceMf', rotulo: C.indiceMf, valor: textoIndicePar },
  ],
};

const href = (ticker: string) => `/analise-ativos/${encodeURIComponent(ticker)}`;

export default function BlocoPares({ ticker, classe }: BlocoParesProps) {
  const q = useValuationAtivo(ticker);
  const router = useRouter();
  const pares = q.data?.pares;
  const itens = pares?.itens ?? [];
  const semPares = itens.length <= 1;
  const colunas = COLUNAS[classe];
  const temIncompleto = itens.some((l) => l.indice.estado === 'incompleto');

  return (
    <CartaoAnalise
      id={`pares-${ticker}`}
      titulo={TEXTOS_TELA.blocos.pares}
      sub={pares?.criterio}
      carregando={q.isPending}
      erro={q.isError}
      onTentarNovamente={() => void q.refetch()}
      alturaEsqueleto={220}
    >
      {pares ? (
        <>
          {semPares ? (
            <p className="text-sm text-gray-600 dark:text-gray-300">{TEXTOS_TELA.ativo.semPares}</p>
          ) : null}
          {/* Computador: tabela */}
          <div className={`${TABLE_STYLES.wrapper} hidden max-w-full lg:block`}>
            <table className={`${TABLE_STYLES.table} min-w-max`}>
              <caption className="sr-only">{formatarTexto(TP.caption, { ticker })}</caption>
              <thead>
                <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                  <th
                    scope="col"
                    className={`${TABLE_STYLES.compact.th} sticky left-0 z-10 text-left`}
                    style={TABLE_HEADER_STYLE}
                  >
                    {C.ativo}
                  </th>
                  {colunas.map((c) => (
                    <th
                      key={c.codigo}
                      scope="col"
                      className={`${TABLE_STYLES.compact.th} text-right`}
                    >
                      {c.rotulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itens.map((l, i) => {
                  const proprio = i === 0;
                  return (
                    <tr
                      key={l.ticker}
                      data-par={l.ticker}
                      data-proprio={proprio || undefined}
                      onClick={proprio ? undefined : () => router.push(href(l.ticker))}
                      className={`${TABLE_STYLES.row} ${proprio ? '' : `${TABLE_STYLES.rowHover} cursor-pointer`}`}
                    >
                      <th
                        scope="row"
                        className={`${TABLE_STYLES.compact.td} sticky left-0 z-[1] text-left font-normal ${FUNDO_STICKY}`}
                      >
                        {proprio ? (
                          <span className="font-semibold text-gray-800 dark:text-white/90">
                            {l.ticker}
                            <span className="sr-only"> ({TP.proprio})</span>
                          </span>
                        ) : (
                          <Link
                            href={href(l.ticker)}
                            onClick={(e) => e.stopPropagation()}
                            className={`font-medium ${COR_LINK.classes}`}
                          >
                            {l.ticker}
                          </Link>
                        )}{' '}
                        <span className="text-gray-500 dark:text-gray-400">{l.nome}</span>
                      </th>
                      {colunas.map((c) => {
                        const v = c.valor(l);
                        return (
                          <td
                            key={c.codigo}
                            title={v.title}
                            className={`${TABLE_STYLES.compact.td} text-right tabular-nums ${proprio ? `${TABLE_STYLES.highlightTd} font-medium text-gray-800 dark:text-white/90` : ''} ${v.negativo ? TEXTO_NEGATIVO : ''}`}
                          >
                            {v.texto}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Celular: cartões */}
          <ul
            className="flex flex-col gap-2 lg:hidden"
            aria-label={formatarTexto(TP.caption, { ticker })}
          >
            {itens.map((l, i) => {
              const proprio = i === 0;
              const conteudo = (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate">
                      <span
                        className={`font-semibold ${proprio ? 'text-gray-800 dark:text-white/90' : COR_LINK.classes}`}
                      >
                        {l.ticker}
                      </span>{' '}
                      <span className="text-xs text-gray-500 dark:text-gray-400">{l.nome}</span>
                    </span>
                    {proprio ? (
                      <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                        {TP.proprio}
                      </span>
                    ) : null}
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 max-[359px]:grid-cols-2">
                    {colunas.map((c) => {
                      const v = c.valor(l);
                      return (
                        <div key={c.codigo} className="min-w-0">
                          <dt className="text-[11px] text-gray-500 dark:text-gray-400">
                            {c.rotulo}
                          </dt>
                          <dd
                            title={v.title}
                            className={`text-[13.5px] font-medium tabular-nums ${v.negativo ? TEXTO_NEGATIVO : 'text-gray-800 dark:text-gray-100'}`}
                          >
                            {v.texto}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </>
              );
              return (
                <li key={l.ticker} data-par={l.ticker} data-proprio={proprio || undefined}>
                  {proprio ? (
                    <div className="rounded-xl border border-gray-200 bg-[#0079F2]/[0.06] px-3.5 py-3 dark:border-gray-800 dark:bg-[#0079F2]/[0.16]">
                      {conteudo}
                    </div>
                  ) : (
                    <Link
                      href={href(l.ticker)}
                      className="block min-h-11 rounded-xl border border-gray-200 px-3.5 py-3 active:bg-gray-100 dark:border-gray-800 dark:active:bg-white/[0.05]"
                    >
                      {conteudo}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
          {temIncompleto ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">{TP.notaIncompleto}</p>
          ) : null}
        </>
      ) : null}
    </CartaoAnalise>
  );
}
