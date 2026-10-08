'use client';

/**
 * Tabela do Quadro (≥ lg) no padrão TABLE_STYLES: <table> real, cabeçalho seguranca fixo ao rolar,
 * coluna Ativo/Fundo fixa, coluna da ordem destacada (outside no th, highlightTd nos td), aria-sort
 * nos th e o ticker como link dentro do th scope=row. A linha inteira abre a página do ativo; o
 * hover pré-carrega o topo (espera 300 ms, no máximo 1 a cada 2 s).
 *
 * Bloco C: campo em conferência (flags 'conf:', lidas por conferenciasAtivo — o mesmo helper da
 * página) = célula hachurada + "em conferência" em 11px; 'ocultar' mostra '—' (a API não manda o
 * número e a ordenação o põe no fim), 'selo' mostra o valor. A linha é um link: aqui o chip é só
 * texto (o "Por quê?" fica na página do ativo).
 *
 * Bloco D (fatia D): com `comparar` (modo Comparar do Quadro), uma coluna de caixas de 56px fixa à
 * esquerda (a coluna Ativo/Fundo passa a ficar fixa logo depois dela): caixa de 18px numa área de
 * 44×44, nome "Comparar WEGE3", clique sem abrir o ativo; no limite, as não marcadas ficam
 * desabilitadas com o motivo no title (o anúncio fica na bandeja). Sem `comparar`, nada muda.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, type ReactNode } from 'react';
import AnelIndice from '@/components/analiseAtivos/comum/AnelIndice';
import BarrasDezAnos from '@/components/analiseAtivos/comum/BarrasDezAnos';
import SeloIncompleto from '@/components/analiseAtivos/comum/SeloIncompleto';
import ValorAnalise from '@/components/analiseAtivos/comum/ValorAnalise';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import CabecalhoOrdenavel from '@/components/analiseAtivos/quadro/CabecalhoOrdenavel';
import CelulaNaCarteira, {
  type InfoNaCarteira,
} from '@/components/analiseAtivos/quadro/CelulaNaCarteira';
import { TABLE_STYLES } from '@/components/ui/table/tableStyles';
import { MYFINANCE_BRAND } from '@/constants/brandColors';
import { COLUNAS, COR_LINK, type ColunaQuadro } from '@/constants/analiseAtivosVisual';
import { prefetchAtivoTopo } from '@/hooks/useAnaliseAtivos';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import { HACHURA } from '@/components/analiseAtivos/comum/ChipConferencia';
import { conferenciaDaLinha } from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import { ehCampoTela } from '@/services/analiseAtivos/regras/comum/conferencia';
import { TEXTOS_ENTRADAS_COMPARADOR } from '@/services/analiseAtivos/textosEntradasComparador';
import { MAX_ATIVOS_COMPARADOR } from '@/services/analiseAtivos/cenarios/contrato';
import type { SelecaoComparar } from '@/components/analiseAtivos/quadro/useSelecaoComparar';
import type {
  ClasseQuadro,
  DirecaoOrdem,
  LinhaQuadroApi,
  ModoQuadro,
  OrdemQuadro,
} from '@/types/analiseAtivosApi';

const T = TEXTOS_TELA.quadro;
const SEM = TEXTOS_TELA.formato.semDado;
/** td do padrão com px-3: o Resumo (Índice MF e Na carteira inclusive) cabe sem rolar a 1440. */
export const TD_QUADRO = TABLE_STYLES.td.replace('px-4', 'px-3');

export const ESPERA_PREFETCH_MS = 300;
export const INTERVALO_PREFETCH_MS = 2_000;

export function rotuloColuna(c: ColunaQuadro): string {
  return (T.colunas as Record<string, string>)[c.rotulo] ?? c.rotulo;
}

export function hrefAtivo(ticker: string): string {
  return `/analise-ativos/${encodeURIComponent(ticker)}`;
}

/** Rótulo acessível das barras de 10 anos. */
export function ariaSerie(l: LinhaQuadroApi): string {
  const comDado = l.serie10a.filter((p) => p.valor !== null);
  const positivos = comDado.filter((p) => (p.valor ?? 0) > 0).length;
  if (comDado.length === 0) return T.semSerie;
  return formatarTexto(l.tipoSerie === 'rendimento' ? T.serieRendAria : T.serieLucroAria, {
    n: positivos,
    total: comDado.length,
  });
}

/** Texto curto embaixo do anel (critérios, incompleto, sem Índice, fora do Índice). */
export function apoioIndice(l: LinhaQuadroApi): string | null {
  const i = l.indice;
  if (i.estado === 'sem_score') return TEXTOS_TELA.indice.semScoreCurto;
  if (i.estado === 'fora_do_indice') return TEXTOS_TELA.indice.foraDoIndice;
  if (i.estado === 'incompleto') return TEXTOS_TELA.selos.dadosIncompletos;
  if (i.criteriosAtendidos !== null && i.criteriosAplicaveis !== null) {
    return `${i.criteriosAtendidos}/${i.criteriosAplicaveis}`;
  }
  return null;
}

export function CelulaIndice({
  linha,
  tamanho = 32,
}: {
  linha: LinhaQuadroApi;
  tamanho?: 32 | 40;
}) {
  const apoio = apoioIndice(linha);
  return (
    <span className="inline-flex items-center gap-2" data-estado-indice={linha.indice.estado}>
      <AnelIndice valor={linha.indice.valor} estado={linha.indice.estado} tamanho={tamanho} />
      {apoio ? (
        <span className="max-w-[5rem] text-left text-[11px] leading-tight whitespace-normal text-gray-500 dark:text-gray-400">
          {apoio}
        </span>
      ) : null}
    </span>
  );
}

/** Campo da coluna em conferência pelas flags 'conf:' (bloco C); null = como hoje. */
export function conferenciaDaCelula(codigo: string, l: LinhaQuadroApi) {
  return ehCampoTela(codigo) ? conferenciaDaLinha(l, codigo) : null;
}

/** Valor (ou '—') + "em conferência" em 11px, para célula/cartão do Quadro (bloco C). */
function ComConferencia({ grupo, children }: { grupo: string; children: ReactNode }) {
  return (
    <span className="inline-flex flex-col items-end" data-conferencia={grupo}>
      {children}
      <span className="text-[11px] leading-tight font-normal text-gray-700 dark:text-gray-300">
        {TEXTOS_TELA.conferencia.chip}
      </span>
    </span>
  );
}

/** DY com o motivo visível embaixo (ausente) ou "em conferência" (valor com proventos suspeitos). */
export function CelulaDy({ linha }: { linha: LinhaQuadroApi }) {
  const dy = linha.dy12m;
  if (dy.estado === 'ok' && linha.proventosEmConferencia) {
    return (
      <span className="inline-flex flex-col items-end">
        <ValorAnalise valor={dy} formato="pct" />
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          {TEXTOS_TELA.selos.emConferencia}
        </span>
      </span>
    );
  }
  return <ValorAnalise valor={dy} formato="pct" mostrarMotivo={dy.estado === 'ausente'} />;
}

export function CelulaSeguidos({ n }: { n: number | null }) {
  if (n === null) return <span className="text-gray-400">{SEM}</span>;
  const texto = formatarTexto(T.anos, { n });
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <BarrasDezAnos modo="seguidos" quantidade={n} ariaLabel={texto} />
      <span className="sr-only">{texto}</span>
    </span>
  );
}

function numeroOuTraco(v: number | null, formato: 'inteiro' | 'moedaCompacta'): ReactNode {
  return v === null ? <span className="text-gray-400">{SEM}</span> : formatarAnalise(v, formato);
}

/** Conteúdo de uma célula (exceto Ativo e Na carteira), compartilhado com os cartões. */
export function conteudoCelula(codigo: string, l: LinhaQuadroApi): ReactNode {
  const conf = conferenciaDaCelula(codigo, l);
  if (conf) {
    const base =
      codigo === 'dy12m' ? <ValorAnalise valor={l.dy12m} formato="pct" /> : conteudoBase(codigo, l);
    return <ComConferencia grupo={conf.grupo}>{base}</ComConferencia>;
  }
  return conteudoBase(codigo, l);
}

function conteudoBase(codigo: string, l: LinhaQuadroApi): ReactNode {
  switch (codigo) {
    case 'setor':
      return l.setor ?? <span className="text-gray-400">{SEM}</span>;
    case 'segmento':
      return l.segmentoCvm ?? <span className="text-gray-400">{SEM}</span>;
    case 'tipo':
      return l.fiiTipo ? T.tipos[l.fiiTipo] : <span className="text-gray-400">{SEM}</span>;
    case 'preco':
      return <ValorAnalise valor={l.preco} formato="moeda" />;
    case 'lucrosSeguidos':
      return <CelulaSeguidos n={l.anosLucroConsecutivos} />;
    case 'roe':
      return <ValorAnalise valor={l.roe} formato="pct" />;
    case 'pl':
      return <ValorAnalise valor={l.pl} formato="multiplo" />;
    case 'pvp':
      return <ValorAnalise valor={l.pvp} formato="numero2" />;
    case 'dy12m':
      return <CelulaDy linha={l} />;
    case 'margemLiquida':
      return <ValorAnalise valor={l.margemLiquida} formato="pct" />;
    case 'divLiqEbitda':
      return <ValorAnalise valor={l.divLiqEbitda} formato="multiplo" />;
    case 'payout':
      return <ValorAnalise valor={l.payout} formato="pct" />;
    case 'obrigacoesPl':
      return <ValorAnalise valor={l.obrigacoesPl} formato="pct" />;
    case 'vacanciaCvm':
      return <ValorAnalise valor={l.vacanciaCvm} formato="pct" />;
    case 'liquidez21':
      return numeroOuTraco(l.liquidezMedia21, 'moedaCompacta');
    case 'patrimonio':
      return numeroOuTraco(l.patrimonio, 'moedaCompacta');
    case 'valorMercado':
      return numeroOuTraco(l.valorMercado, 'moedaCompacta');
    case 'cotistas':
      return numeroOuTraco(l.cotistas, 'inteiro');
    case 'imoveisCris':
      return `${l.nImoveisCvm ?? SEM} / ${l.nCri ?? SEM}`;
    case 'lucro10a':
    case 'rendimento10a':
      return <BarrasDezAnos modo="lucro" serie={l.serie10a} ariaLabel={ariaSerie(l)} />;
    case 'indiceMf':
      return <CelulaIndice linha={l} />;
    default:
      return null;
  }
}

/** Selo de posição para sobrepor no logo: só as 4 letras. */
export function LogoTicker({ ticker, tamanho = 34 }: { ticker: string; tamanho?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: tamanho, height: tamanho }}
      className="inline-flex shrink-0 items-center justify-center rounded-lg bg-gray-100 text-[10px] font-semibold tracking-tight text-[#314666] dark:bg-white/[0.06] dark:text-[#6E9DC4]"
    >
      {ticker.slice(0, 4)}
    </span>
  );
}

/** Pré-carrega o topo do ativo no hover: espera 300 ms e no máximo 1 a cada 2 s. */
export function usePrefetchHover() {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimo = useRef(0);
  const iniciar = useCallback(
    (ticker: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const agora = Date.now();
        if (agora - ultimo.current < INTERVALO_PREFETCH_MS) return;
        ultimo.current = agora;
        void prefetchAtivoTopo(qc, ticker).catch(() => undefined);
      }, ESPERA_PREFETCH_MS);
    },
    [qc],
  );
  const cancelar = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  return { iniciar, cancelar };
}

export interface TabelaQuadroProps {
  classe: ClasseQuadro;
  modo: ModoQuadro;
  ordem: OrdemQuadro;
  dir: DirecaoOrdem;
  linhas: LinhaQuadroApi[];
  onOrdenar: (ordem: OrdemQuadro) => void;
  naCarteira: (ticker: string) => InfoNaCarteira;
  /** linhas de esqueleto no lugar dos dados (carregando) */
  carregando?: boolean;
  /** mostrando a página anterior enquanto a nova ordem/filtro chega (placeholderData) */
  atualizando?: boolean;
  legenda: string;
  /** Bloco D: modo Comparar ligado (coluna de caixas); ausente = Quadro de sempre */
  comparar?: ControleComparar;
}

/** O que as caixas do modo Comparar usam da seleção (tabela e cartões). */
export type ControleComparar = Pick<SelecaoComparar, 'marcado' | 'desabilitado' | 'alternar'>;

const TC = TEXTOS_ENTRADAS_COMPARADOR.quadro;

/** Caixa do modo Comparar: input nativo de 18px numa área de 44×44 (tabela). */
export function CaixaComparar({
  ticker,
  controle,
}: {
  ticker: string;
  controle: ControleComparar;
}) {
  const desabilitada = controle.desabilitado(ticker);
  return (
    <label
      className="-my-2 inline-grid h-11 w-11 cursor-pointer place-items-center rounded-lg has-[:disabled]:cursor-not-allowed has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-[#0079F2] dark:has-[:focus-visible]:ring-[#6E9DC4]"
      title={
        desabilitada
          ? formatarTexto(TC.caixaDesabilitada, { max: MAX_ATIVOS_COMPARADOR })
          : undefined
      }
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        aria-label={formatarTexto(TC.caixa, { ticker })}
        checked={controle.marcado(ticker)}
        disabled={desabilitada}
        onChange={() => controle.alternar(ticker)}
        data-comparar-caixa={ticker}
        className="h-[18px] w-[18px] cursor-pointer accent-[#396CAA] outline-none dark:[color-scheme:dark] disabled:cursor-not-allowed"
      />
    </label>
  );
}

export default function TabelaQuadro({
  classe,
  modo,
  ordem,
  dir,
  linhas,
  onOrdenar,
  naCarteira,
  carregando = false,
  atualizando = false,
  legenda,
  comparar,
}: TabelaQuadroProps) {
  const router = useRouter();
  const prefetch = usePrefetchHover();
  const colunas = COLUNAS[classe][modo];
  // fundo opaco (a coluna fixa passa por cima das outras ao rolar); mesmo tom do card escuro
  const fundoFixo =
    'z-10 bg-white group-hover:bg-gray-50 dark:bg-[#1F1F22] dark:group-hover:bg-[#26262A]';
  // modo Comparar: a coluna de caixas (56px) fica em left-0 e a Ativo/Fundo logo depois
  const fixoTd = `sticky ${comparar ? 'left-14' : 'left-0'} ${fundoFixo}`;

  return (
    <div
      className={`${TABLE_STYLES.wrapper} max-h-[70vh] overflow-y-auto bg-white dark:bg-[#1F1F22] ${
        atualizando ? 'opacity-70 motion-safe:transition-opacity' : ''
      }`}
      aria-busy={carregando || atualizando || undefined}
      data-quadro-tabela={classe}
    >
      <table
        className={`${TABLE_STYLES.table} ${modo === 'detalhado' ? 'min-w-[1480px]' : 'min-w-[960px]'}`}
      >
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr className={TABLE_STYLES.headRow}>
            {comparar ? (
              <th
                scope="col"
                className="sticky top-0 left-0 z-30 w-14 min-w-14 px-1.5"
                style={{ backgroundColor: MYFINANCE_BRAND.seguranca }}
                data-coluna="comparar"
              >
                <span className="sr-only">{TC.colunaCaixa}</span>
              </th>
            ) : null}
            {colunas.map((c, i) => (
              <CabecalhoOrdenavel
                key={c.codigo}
                coluna={c}
                rotulo={rotuloColuna(c)}
                ordemAtual={ordem}
                dir={dir}
                onOrdenar={onOrdenar}
                fixa={i === 0 && !comparar}
                className={i === 0 && comparar ? 'left-14 z-30!' : ''}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {carregando
            ? Array.from({ length: 8 }, (_, i) => (
                <tr key={`sk-${i}`} className={TABLE_STYLES.row} aria-hidden="true">
                  {comparar ? <td className="w-14 px-1.5" /> : null}
                  {colunas.map((c) => (
                    <td key={c.codigo} className={TD_QUADRO}>
                      <span className="block h-3 w-full max-w-[6rem] rounded bg-gray-200 motion-safe:animate-pulse dark:bg-white/[0.08]" />
                    </td>
                  ))}
                </tr>
              ))
            : linhas.map((l) => (
                <tr
                  key={l.ticker}
                  data-ticker={l.ticker}
                  className={`${TABLE_STYLES.row} ${TABLE_STYLES.rowHover} group cursor-pointer [content-visibility:auto] [contain-intrinsic-size:auto_56px]`}
                  onClick={() => router.push(hrefAtivo(l.ticker))}
                  onMouseEnter={() => prefetch.iniciar(l.ticker)}
                  onMouseLeave={prefetch.cancelar}
                >
                  {comparar ? (
                    <td
                      className={`sticky left-0 w-14 min-w-14 px-1.5 text-center ${fundoFixo}`}
                      data-coluna="comparar"
                    >
                      <CaixaComparar ticker={l.ticker} controle={comparar} />
                    </td>
                  ) : null}
                  {colunas.map((c, i) => {
                    const destaque = c.ordem !== null && c.ordem === ordem;
                    const alinhar =
                      c.alinhamento === 'direita'
                        ? 'text-right'
                        : c.alinhamento === 'centro'
                          ? 'text-center'
                          : 'text-left';
                    if (i === 0) {
                      return (
                        <th
                          key={c.codigo}
                          scope="row"
                          className={`${TD_QUADRO} ${fixoTd} text-left font-normal ${
                            destaque ? TABLE_STYLES.highlightTd : ''
                          }`}
                        >
                          <CelulaAtivo linha={l} />
                        </th>
                      );
                    }
                    return (
                      <td
                        key={c.codigo}
                        className={`${TD_QUADRO} ${alinhar} whitespace-nowrap tabular-nums ${
                          destaque ? TABLE_STYLES.highlightTd : ''
                        } ${conferenciaDaCelula(c.codigo, l) ? HACHURA : ''}`}
                        data-coluna={c.codigo}
                      >
                        {c.codigo === 'naCarteira' ? (
                          <CelulaNaCarteira info={naCarteira(l.ticker)} classe={classe} />
                        ) : (
                          conteudoCelula(c.codigo, l)
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

function CelulaAtivo({ linha }: { linha: LinhaQuadroApi }) {
  return (
    <span className="flex min-w-[9rem] items-center gap-3">
      <LogoTicker ticker={linha.ticker} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <Link
            href={hrefAtivo(linha.ticker)}
            onClick={(e) => e.stopPropagation()}
            className={`font-semibold ${COR_LINK.classes} outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-[#0079F2] dark:focus-visible:ring-[#6E9DC4]`}
          >
            {linha.ticker}
          </Link>
          {linha.indice.estado === 'incompleto' ? (
            <SeloIncompleto motivos={linha.indice.motivos} ticker={linha.ticker} />
          ) : null}
        </span>
        <span className="block max-w-[9rem] truncate text-xs text-gray-500 dark:text-gray-400">
          {linha.nome}
        </span>
      </span>
    </span>
  );
}
