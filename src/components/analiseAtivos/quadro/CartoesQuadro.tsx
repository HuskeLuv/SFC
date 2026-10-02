'use client';

/**
 * Quadro em cartões (< lg): ticker, nome, preço + variação do dia, anel de 40px, 3 números da
 * classe (2ª linha no Detalhado), barras de 10 anos e "Na carteira". O cartão inteiro é um link
 * (alvo ≥ 72px). Mesmo conteúdo de célula da tabela (conteudoCelula).
 */
import Link from 'next/link';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import CelulaNaCarteira, {
  type InfoNaCarteira,
} from '@/components/analiseAtivos/quadro/CelulaNaCarteira';
import {
  CelulaIndice,
  conteudoCelula,
  hrefAtivo,
  usePrefetchHover,
} from '@/components/analiseAtivos/quadro/TabelaQuadro';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
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
}

export default function CartoesQuadro({
  classe,
  modo,
  linhas,
  naCarteira,
  carregando = false,
  atualizando = false,
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
        <div key={c} className="min-w-0">
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
            className="[content-visibility:auto] [contain-intrinsic-size:auto_180px]"
          >
            <Link
              href={hrefAtivo(l.ticker)}
              onTouchStart={() => prefetch.iniciar(l.ticker)}
              onMouseEnter={() => prefetch.iniciar(l.ticker)}
              onMouseLeave={prefetch.cancelar}
              className={`${TABLE_MOBILE_STYLES.card} ${TABLE_MOBILE_STYLES.cardClickable} block outline-none focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]`}
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
          </li>
        );
      })}
    </ul>
  );
}
