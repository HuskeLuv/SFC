'use client';

/**
 * Tabela do Quadro (≥ lg) no padrão TABLE_STYLES: <table> real, cabeçalho seguranca fixo ao rolar,
 * coluna Ativo/Fundo fixa, coluna da ordem destacada (outside no th, highlightTd nos td), aria-sort
 * nos th e o ticker como link dentro do th scope=row. A linha inteira abre a página do ativo; o
 * hover pré-carrega o topo (espera 300 ms, no máximo 1 a cada 2 s).
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
import { COLUNAS, COR_LINK, type ColunaQuadro } from '@/constants/analiseAtivosVisual';
import { prefetchAtivoTopo } from '@/hooks/useAnaliseAtivos';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type {
  ClasseQuadro,
  DirecaoOrdem,
  LinhaQuadroApi,
  ModoQuadro,
  OrdemQuadro,
} from '@/types/analiseAtivosApi';

const T = TEXTOS_TELA.quadro;
const SEM = TEXTOS_TELA.formato.semDado;

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
        <span className="max-w-[7.5rem] text-left text-[11px] leading-tight text-gray-500 dark:text-gray-400">
          {apoio}
        </span>
      ) : null}
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
  legenda: string;
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
  legenda,
}: TabelaQuadroProps) {
  const router = useRouter();
  const prefetch = usePrefetchHover();
  const colunas = COLUNAS[classe][modo];
  const fixoTd = 'sticky left-0 z-10 bg-white dark:bg-gray-900';

  return (
    <div
      className={`${TABLE_STYLES.wrapper} max-h-[70vh] overflow-y-auto`}
      aria-busy={carregando || undefined}
      data-quadro-tabela={classe}
    >
      <table
        className={`${TABLE_STYLES.table} ${modo === 'detalhado' ? 'min-w-[1480px]' : 'min-w-[960px]'}`}
      >
        <caption className="sr-only">{legenda}</caption>
        <thead>
          <tr className={TABLE_STYLES.headRow}>
            {colunas.map((c, i) => (
              <CabecalhoOrdenavel
                key={c.codigo}
                coluna={c}
                rotulo={rotuloColuna(c)}
                ordemAtual={ordem}
                dir={dir}
                onOrdenar={onOrdenar}
                fixa={i === 0}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {carregando
            ? Array.from({ length: 8 }, (_, i) => (
                <tr key={`sk-${i}`} className={TABLE_STYLES.row} aria-hidden="true">
                  {colunas.map((c) => (
                    <td key={c.codigo} className={TABLE_STYLES.td}>
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
                          className={`${TABLE_STYLES.td} ${fixoTd} text-left font-normal ${
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
                        className={`${TABLE_STYLES.td} ${alinhar} whitespace-nowrap tabular-nums ${
                          destaque ? TABLE_STYLES.highlightTd : ''
                        }`}
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
    <span className="flex min-w-[12rem] items-center gap-3">
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
        <span className="block max-w-[14rem] truncate text-xs text-gray-500 dark:text-gray-400">
          {linha.nome}
        </span>
      </span>
    </span>
  );
}
