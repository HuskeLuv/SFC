'use client';

/**
 * Quadro em cartões (< lg): ticker, nome, preço + variação do dia, anel de 40px, 3 números da
 * classe (2ª linha no Detalhado), barras de 10 anos e "Na carteira". O cartão inteiro é um link
 * (alvo ≥ 72px). Mesmo conteúdo de célula da tabela (conteudoCelula). Bloco C: número em
 * conferência com o mesmo texto e a mesma hachura da tabela (conferenciaDaCelula).
 *
 * Bloco D (fatia D): com `comparar` (modo Comparar), cada cartão ganha embaixo uma linha de 44px
 * com a caixa "Comparar WEGE3" — FORA do link (nada interativo dentro de <a>); o contorno do
 * cartão passa para o <li>. No limite, a caixa fica desabilitada com o motivo visível. Sem
 * `comparar`, o cartão é o de sempre.
 */
import Link from 'next/link';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import CelulaNaCarteira, {
  type InfoNaCarteira,
} from '@/components/analiseAtivos/quadro/CelulaNaCarteira';
import { HACHURA } from '@/components/analiseAtivos/comum/ChipConferencia';
import {
  CelulaIndice,
  conferenciaDaCelula,
  conteudoCelula,
  hrefAtivo,
  usePrefetchHover,
} from '@/components/analiseAtivos/quadro/TabelaQuadro';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import type { ControleComparar } from '@/components/analiseAtivos/quadro/TabelaQuadro';
import { MAX_ATIVOS_COMPARADOR } from '@/services/analiseAtivos/cenarios/contrato';
import { TEXTOS_ENTRADAS_COMPARADOR } from '@/services/analiseAtivos/textosEntradasComparador';
import { formatarTexto } from '@/services/analiseAtivos/textosTela';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import type { ClasseQuadro, LinhaQuadroApi, ModoQuadro } from '@/types/analiseAtivosApi';

const C = TEXTOS_TELA.quadro.colunas;

/** Campos do cartão por classe: 1ª linha sempre; 2ª só no Detalhado. */
export const CAMPOS_CARTAO: Record<ClasseQuadro, { base: string[]; detalhe: string[] }> = {
  acao: { base: ['pl', 'dy12m', 'roe'], detalhe: ['pvp', 'margemLiquida', 'divLiqEbitda'] },
  fii: { base: ['dy12m', 'pvp', 'obrigacoesPl'], detalhe: ['tipo', 'patrimonio', 'liquidez21'] },
};

export interface CartoesQuadroProps {
  classe: ClasseQuadro;
  modo: ModoQuadro;
  linhas: LinhaQuadroApi[];
  naCarteira: (ticker: string) => InfoNaCarteira;
  carregando?: boolean;
  atualizando?: boolean;
  /** Bloco D: modo Comparar ligado (caixa de 44px por cartão) */
  comparar?: ControleComparar;
}

const TC = TEXTOS_ENTRADAS_COMPARADOR.quadro;
/** Cartão no modo Comparar: o contorno do TABLE_MOBILE_STYLES.card, sem o padding (vai no link). */
const CARTAO_COMPARAR =
  'rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]';

function LinhaCaixa({ ticker, controle }: { ticker: string; controle: ControleComparar }) {
  const desabilitada = controle.desabilitado(ticker);
  return (
    <label
      className={`flex min-h-11 items-center gap-3 rounded-b-2xl border-t border-gray-100 px-4 text-sm dark:border-gray-800 ${
        desabilitada
          ? 'cursor-not-allowed text-gray-500 dark:text-gray-400'
          : 'cursor-pointer text-gray-800 dark:text-white/90'
      } has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-[#0079F2] has-[:focus-visible]:ring-inset dark:has-[:focus-visible]:ring-[#6E9DC4]`}
    >
      <input
        type="checkbox"
        aria-label={formatarTexto(TC.caixa, { ticker })}
        checked={controle.marcado(ticker)}
        disabled={desabilitada}
        onChange={() => controle.alternar(ticker)}
        data-comparar-caixa={ticker}
        className="h-5 w-5 shrink-0 accent-[#396CAA] outline-none dark:[color-scheme:dark]"
      />
      <span aria-hidden="true">
        {desabilitada
          ? formatarTexto(TC.caixaLimite, { max: MAX_ATIVOS_COMPARADOR })
          : formatarTexto(TC.caixa, { ticker })}
      </span>
    </label>
  );
}

export default function CartoesQuadro({
  classe,
  modo,
  linhas,
  naCarteira,
  carregando = false,
  atualizando = false,
  comparar,
}: CartoesQuadroProps) {
  const prefetch = usePrefetchHover();
  if (carregando) {
    return (
      <ul className={TABLE_MOBILE_STYLES.list} aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className={TABLE_MOBILE_STYLES.card} aria-hidden="true">
            <span className="block h-3 w-2/5 rounded bg-gray-200 motion-safe:animate-pulse dark:bg-white/[0.08]" />
            <span className="mt-2 block h-3 w-3/4 rounded bg-gray-200 motion-safe:animate-pulse dark:bg-white/[0.08]" />
            <span className="mt-2 block h-3 w-full rounded bg-gray-200 motion-safe:animate-pulse dark:bg-white/[0.08]" />
          </li>
        ))}
      </ul>
    );
  }
  const campos = CAMPOS_CARTAO[classe];
  const grade = (codigos: string[], l: LinhaQuadroApi) => (
    <dl className={TABLE_MOBILE_STYLES.cardGrid}>
      {codigos.map((c) => (
        <div
          key={c}
          className={`min-w-0 ${conferenciaDaCelula(c, l) ? `${HACHURA} -mx-1 rounded-md px-1` : ''}`}
        >
          <dt className={TABLE_MOBILE_STYLES.dt}>{(C as Record<string, string>)[c] ?? c}</dt>
          <dd className={TABLE_MOBILE_STYLES.dd}>{conteudoCelula(c, l)}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <ul
      className={`${TABLE_MOBILE_STYLES.list} ${atualizando ? 'opacity-70' : ''}`}
      data-quadro-cartoes={classe}
      aria-busy={atualizando || undefined}
    >
      {linhas.map((l) => {
        const v = l.variacaoDiaPct;
        return (
          <li
            key={l.ticker}
            data-ticker={l.ticker}
            className={`[content-visibility:auto] [contain-intrinsic-size:auto_180px] ${
              comparar ? CARTAO_COMPARAR : ''
            }`}
          >
            <Link
              href={hrefAtivo(l.ticker)}
              onTouchStart={() => prefetch.iniciar(l.ticker)}
              onMouseEnter={() => prefetch.iniciar(l.ticker)}
              onMouseLeave={prefetch.cancelar}
              className={`${
                comparar ? 'rounded-t-2xl px-4 py-3.5' : TABLE_MOBILE_STYLES.card
              } ${TABLE_MOBILE_STYLES.cardClickable} block outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]`}
            >
              <div className={TABLE_MOBILE_STYLES.cardHeader}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={TABLE_MOBILE_STYLES.cardTitle}>{l.ticker}</span>
                    {l.indice.estado === 'incompleto' ? (
                      // texto simples (o cartão já é um link; o popover de motivos fica na página)
                      <span className="inline-flex items-center rounded-full border border-dashed border-[#98A2B3] px-2 py-0.5 text-[11px] text-gray-600 dark:text-gray-300">
                        {TEXTOS_TELA.selos.dadosIncompletos}
                      </span>
                    ) : null}
                  </div>
                  <div className={`${TABLE_MOBILE_STYLES.cardSubtitle} truncate`}>{l.nome}</div>
                  <div className="mt-0.5 text-sm tabular-nums text-gray-800 dark:text-white/90">
                    {l.preco.estado === 'ok'
                      ? formatarAnalise(l.preco.valor, 'moeda')
                      : TEXTOS_TELA.formato.semDado}{' '}
                    {v !== null ? (
                      <span
                        className={
                          v < 0 ? TABLE_MOBILE_STYLES.negative : TABLE_MOBILE_STYLES.positive
                        }
                      >
                        {formatarAnalise(v, 'pctSinal')}
                      </span>
                    ) : null}
                  </div>
                </div>
                <CelulaIndice linha={l} tamanho={40} />
              </div>
              {grade(campos.base, l)}
              {modo === 'detalhado' ? grade(campos.detalhe, l) : null}
              <div className="mt-2 flex items-center justify-between gap-3 text-gray-700 dark:text-gray-200">
                {conteudoCelula(classe === 'fii' ? 'rendimento10a' : 'lucro10a', l)}
                <CelulaNaCarteira info={naCarteira(l.ticker)} classe={classe} />
              </div>
            </Link>
            {comparar ? <LinhaCaixa ticker={l.ticker} controle={comparar} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
