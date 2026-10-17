'use client';

/**
 * Quadro em cartões (< lg; rec. 7). v2.4 (protótipo final): ticker (link) + nome, preço + variação
 * do dia e, embaixo, o tipo (FII) ou o setor (ação); 3 números da classe (ação: ROE, P/L, DY 12m;
 * FII: DY 12m, P/VP, Vacância (CVM)); no Detalhado as barras de 10 anos; no pé a célula "Critérios"
 * (CelulaCriterios, 44 px) e "Na carteira". Mesmo conteúdo de célula da tabela (conteudoCelula).
 * Bloco C: número em conferência com o mesmo texto e a mesma hachura da tabela. v2.5: o tipo do FII
 * é o exibido (Tijolo | Papel) e FoF/Híbrido vêm junto ('Papel · FoF'), como no segmento da tabela.
 *
 * O cartão inteiro abre o ativo por um LINK ESTICADO (o ::after do link do ticker cobre o cartão):
 * a célula Critérios e a caixa do modo Comparar ficam por cima (relative z-10) e nunca dentro do
 * <a> (nada interativo dentro de link). O nome do ativo fica em [data-nome-ativo].
 *
 * Bloco D (fatia D): com `comparar` (modo Comparar), cada cartão ganha embaixo uma linha de 44px
 * com a caixa "Comparar WEGE3". No limite, a caixa fica desabilitada com o motivo visível.
 *
 * Bloco 1 (fatia 0): `acaoLinha(linha)` vai no topo do cartão, ao lado do preço (relative z-10,
 * fora do link esticado: o toque não abre o ativo); `rodapeCartao(linha)` acrescenta uma linha no
 * pé ("adicionado em 28/09/2026"); `complementoCriterios(linha)` vai embaixo da célula Critérios.
 * Sem essas props o DOM é idêntico ao de antes.
 */
import Link from 'next/link';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import CelulaNaCarteira, {
  type InfoNaCarteira,
} from '@/components/analiseAtivos/quadro/CelulaNaCarteira';
import { HACHURA } from '@/components/analiseAtivos/comum/ChipConferencia';
import {
  CelulaCriteriosLinha,
  conferenciaDaCelula,
  conteudoCelula,
  hrefAtivo,
  pararPropagacao,
  rotulosDasDefinicoes,
  usePrefetchHover,
  type ExtensoesLinhaQuadro,
} from '@/components/analiseAtivos/quadro/TabelaQuadro';
import type { ReactNode } from 'react';
import { TABLE_MOBILE_STYLES } from '@/components/ui/table/tableStyles';
import type { ControleComparar } from '@/components/analiseAtivos/quadro/TabelaQuadro';
import { MAX_ATIVOS_COMPARADOR } from '@/services/analiseAtivos/cenarios/contrato';
import { TEXTOS_ENTRADAS_COMPARADOR } from '@/services/analiseAtivos/textosEntradasComparador';
import { TEXTOS_QUADRO } from '@/services/analiseAtivos/textosQuadro';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { ClasseQuadro, LinhaQuadroApi, ModoQuadro } from '@/types/analiseAtivosApi';
import type { DefCriterioChip } from '@/types/analiseAtivosCriterios';

const C = TEXTOS_TELA.quadro.colunas;

/** 'Tijolo' / 'Papel', com 'FoF' ou 'Híbrido' quando o tipo CVM é esse ('Papel · FoF'). */
function apoioFii(l: LinhaQuadroApi): string | null {
  if (!l.fiiTipo) return null;
  const tipo = TEXTOS_TELA.quadro.tipos[l.fiiTipo];
  return l.segmentoTipo
    ? formatarTexto(TEXTOS_QUADRO.segmentoTipo.comSegmento, {
        tipo,
        segmento: TEXTOS_QUADRO.segmentoTipo[l.segmentoTipo],
      })
    : tipo;
}

/** Números do cartão por classe (protótipo final). */
export const CAMPOS_CARTAO: Record<ClasseQuadro, string[]> = {
  acao: ['roe', 'pl', 'dy12m'],
  fii: ['dy12m', 'pvp', 'vacanciaCvm'],
};

export interface CartoesQuadroProps<L extends LinhaQuadroApi = LinhaQuadroApi> extends Omit<
  ExtensoesLinhaQuadro<L>,
  'rotuloColunaAcao'
> {
  classe: ClasseQuadro;
  modo: ModoQuadro;
  linhas: L[];
  naCarteira: (ticker: string) => InfoNaCarteira;
  carregando?: boolean;
  atualizando?: boolean;
  /** Bloco D: modo Comparar ligado (caixa de 44px por cartão) */
  comparar?: ControleComparar;
  /** v2.4: chips da resposta (rótulos do tooltip da célula Critérios) */
  definicoes?: DefCriterioChip[];
  /** bloco 1: linha extra no pé do cartão */
  rodapeCartao?: (linha: L) => ReactNode;
}

const TC = TEXTOS_ENTRADAS_COMPARADOR.quadro;
const FOCO_CARTAO =
  'has-[a[data-link-cartao]:focus-visible]:ring-[3px] has-[a[data-link-cartao]:focus-visible]:ring-[#0079F2] dark:has-[a[data-link-cartao]:focus-visible]:ring-[#6E9DC4]';

function LinhaCaixa({ ticker, controle }: { ticker: string; controle: ControleComparar }) {
  const desabilitada = controle.desabilitado(ticker);
  return (
    <label
      className={`relative z-10 -mx-4 -mb-3.5 mt-3 flex min-h-11 items-center gap-3 rounded-b-2xl border-t border-gray-100 px-4 text-sm dark:border-gray-800 ${
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

/** Preço + variação do dia + apoio (tipo/setor), à direita do topo do cartão. */
function PrecoCartao({ l, apoio }: { l: LinhaQuadroApi; apoio: string | null }) {
  const v = l.variacaoDiaPct;
  return (
    <div className="shrink-0 text-right">
      <div className="text-sm font-semibold text-gray-800 tabular-nums dark:text-white/90">
        {l.preco.estado === 'ok'
          ? formatarAnalise(l.preco.valor, 'moeda')
          : TEXTOS_TELA.formato.semDado}
      </div>
      {v !== null ? (
        <div
          className={`text-xs tabular-nums ${
            v < 0 ? TABLE_MOBILE_STYLES.negative : TABLE_MOBILE_STYLES.positive
          }`}
        >
          {formatarAnalise(v, 'pctSinal')}
        </div>
      ) : null}
      {apoio ? (
        <div className="max-w-[9rem] truncate text-xs text-gray-500 dark:text-gray-400">
          {apoio}
        </div>
      ) : null}
    </div>
  );
}

export default function CartoesQuadro<L extends LinhaQuadroApi = LinhaQuadroApi>({
  classe,
  modo,
  linhas,
  naCarteira,
  carregando = false,
  atualizando = false,
  comparar,
  definicoes,
  acaoLinha,
  complementoCriterios,
  rodapeCartao,
}: CartoesQuadroProps<L>) {
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
  const rotulos = rotulosDasDefinicoes(definicoes);
  const campos = CAMPOS_CARTAO[classe];

  return (
    <ul
      className={`${TABLE_MOBILE_STYLES.list} ${atualizando ? 'opacity-70' : ''}`}
      data-quadro-cartoes={classe}
      aria-busy={atualizando || undefined}
    >
      {linhas.map((l) => {
        const apoio = classe === 'fii' ? apoioFii(l) : (l.setor ?? null);
        return (
          <li
            key={l.ticker}
            data-ticker={l.ticker}
            className={`relative ${TABLE_MOBILE_STYLES.card} ${TABLE_MOBILE_STYLES.cardClickable} ${FOCO_CARTAO} [content-visibility:auto] [contain-intrinsic-size:auto_180px]`}
          >
            <div className={TABLE_MOBILE_STYLES.cardHeader}>
              <div className="min-w-0">
                <Link
                  href={hrefAtivo(l.ticker)}
                  data-link-cartao=""
                  onTouchStart={() => prefetch.iniciar(l.ticker)}
                  onMouseEnter={() => prefetch.iniciar(l.ticker)}
                  onMouseLeave={prefetch.cancelar}
                  className={`${TABLE_MOBILE_STYLES.cardTitle} -my-2 inline-flex min-h-11 items-center outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']`}
                >
                  {l.ticker}
                </Link>
                <div
                  data-nome-ativo=""
                  className={`${TABLE_MOBILE_STYLES.cardSubtitle} -mt-1 truncate`}
                >
                  {l.nome}
                </div>
              </div>
              {acaoLinha ? (
                <div className="flex shrink-0 items-start gap-1">
                  <PrecoCartao l={l} apoio={apoio} />
                  <span
                    className="relative z-10 -my-1 -mr-2"
                    data-coluna="acao"
                    onClick={pararPropagacao}
                  >
                    {acaoLinha(l)}
                  </span>
                </div>
              ) : (
                <PrecoCartao l={l} apoio={apoio} />
              )}
            </div>
            <dl className={TABLE_MOBILE_STYLES.cardGrid}>
              {campos.map((c) => (
                <div
                  key={c}
                  className={`min-w-0 ${conferenciaDaCelula(c, l) ? `${HACHURA} -mx-1 rounded-md px-1` : ''}`}
                >
                  <dt className={TABLE_MOBILE_STYLES.dt}>
                    {(C as Record<string, string>)[c] ?? c}
                  </dt>
                  <dd className={TABLE_MOBILE_STYLES.dd}>{conteudoCelula(c, l)}</dd>
                </div>
              ))}
            </dl>
            {modo === 'detalhado' ? (
              <div className="mt-2 flex items-center gap-2 text-gray-700 dark:text-gray-200">
                {conteudoCelula(classe === 'fii' ? 'rendimento10a' : 'lucro10a', l)}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {classe === 'fii'
                    ? TEXTOS_QUADRO.cartao.serieRendimento
                    : TEXTOS_QUADRO.cartao.serieLucro}
                </span>
              </div>
            ) : null}
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="relative z-10 -ml-1.5" data-coluna="criterios">
                <CelulaCriteriosLinha linha={l} rotulos={rotulos} />
                {complementoCriterios ? (
                  <span className="block pl-1.5 text-[11px] leading-tight text-gray-500 dark:text-gray-400">
                    {complementoCriterios(l)}
                  </span>
                ) : null}
              </span>
              <CelulaNaCarteira info={naCarteira(l.ticker)} classe={classe} />
            </div>
            {rodapeCartao ? (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{rodapeCartao(l)}</div>
            ) : null}
            {comparar ? <LinhaCaixa ticker={l.ticker} controle={comparar} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
