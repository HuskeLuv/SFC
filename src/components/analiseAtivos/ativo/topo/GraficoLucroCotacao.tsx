'use client';

/**
 * Gráfico Lucro por ação × Cotação (ações, anual) / VP por cota × Cota (FIIs, mensal), base 100 na
 * janela escolhida (5A/10A, decisão 7). SVG próprio (sem ApexCharts): <figure> + <figcaption> de
 * uma frase, "Ver dados em tabela" (tabela real, alternável), tooltip também pelo TECLADO (foco no
 * gráfico + setas percorrem os pontos, anunciado em aria-live) e nada de animação
 * (prefers-reduced-motion fica atendido por construção).
 *
 * - Só anos fechados; o 'últ. 12m' é um ponto separado, rotulado e sem linha ligando à série.
 * - Prejuízo = lacuna (a linha quebra) com nota; outras faltas (mês sem pregão) não quebram a linha.
 * - Menos de 3 pontos na janela → 'histórico insuficiente para o gráfico'.
 * Cores: SERIES_GRAFICO (outside/potencia no claro; tranquilidade/escolha no escuro).
 *
 * Bloco C (params v2): cotação em conferência (base da cotação / poucos negócios) = trecho
 * TRACEJADO da série de cotação a partir da data da detecção, com o chip "em conferência" e uma
 * nota; ano dos demonstrativos em conferência = ponto tracejado fora do crescimento. Menu ⋯ no
 * cabeçalho e selo de frescor no rodapé. Tudo a partir das conferências do topo (mesmo helper).
 */
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { TABLE_HEADER_STYLE, TABLE_STYLES } from '@/components/ui/table/tableStyles';
import ChipConferencia from '@/components/analiseAtivos/comum/ChipConferencia';
import {
  MenuBlocoPagina,
  useConferenciaPagina,
} from '@/components/analiseAtivos/comum/PorQueConferencia';
import { RodapeFrescorBloco } from '@/components/analiseAtivos/ativo/topo/SeloFrescor';
import { anoDaChave } from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import {
  PERIODOS_GRAFICO,
  recortarJanela,
  type PeriodoGrafico,
  type PontoJanela,
} from '@/services/analiseAtivos/leitura/ativo/seriesGrafico';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { GraficoAtivo, GraficoLucroCotacaoProps } from '@/types/analiseAtivosApi';
import type { DadoBlocoReporte } from '@/types/analiseAtivosCuradoria';

export type { GraficoLucroCotacaoProps };

const CARD =
  'rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]';
/** largura padrão do viewBox; no navegador vira a largura real (texto sem encolher no celular) */
const W_PADRAO = 560;
const W_MIN = 280;
const H = 240;
const PL = 40;
const PR = 56;
const PT = 16;
const PB = 28;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const COR_A = {
  stroke: 'stroke-[#0079F2] dark:stroke-[#6E9DC4]',
  fill: 'fill-[#0079F2] dark:fill-[#6E9DC4]',
  bg: 'bg-[#0079F2] dark:bg-[#6E9DC4]',
};
const COR_B = {
  stroke: 'stroke-[#2D2D2D] dark:stroke-[#EAEAEA]',
  fill: 'fill-[#2D2D2D] dark:fill-[#EAEAEA]',
  bg: 'bg-[#2D2D2D] dark:bg-[#EAEAEA]',
};

function rotuloChave(chave: string): string {
  if (chave.length === 7) return `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;
  return chave;
}

function base(v: number | null): string {
  return v === null ? TEXTOS_TELA.formato.semDado : formatarAnalise(v, 'inteiro');
}

function moeda(v: number | null): string {
  return v === null ? TEXTOS_TELA.formato.semDado : formatarAnalise(v, 'moeda');
}

/** Caminho SVG: quebra só nas lacunas (prejuízo); faltas comuns são ligadas por cima. */
function caminho(
  pontos: PontoJanela[],
  campo: 'a100' | 'b100',
  x: (i: number) => number,
  y: (v: number) => number,
): string {
  let d = '';
  let aberto = false;
  pontos.forEach((p, i) => {
    const v = p[campo];
    if (campo === 'a100' && p.lacuna) {
      aberto = false;
      return;
    }
    if (v === null) return;
    d += `${aberto ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    aberto = true;
  });
  return d;
}

/** Trecho [de, ate] da série (inclusive), para desenhar a parte em conferência tracejada. */
function trecho(
  pontos: PontoJanela[],
  campo: 'b100',
  x: (i: number) => number,
  y: (v: number) => number,
  de: number,
  ate: number,
): string {
  let d = '';
  let aberto = false;
  pontos.forEach((p, i) => {
    if (i < de || i > ate) return;
    const v = p[campo];
    if (v === null) return;
    d += `${aberto ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    aberto = true;
  });
  return d;
}

/** Índice do 1º ponto da janela na data `desde` ou depois (chave 'AAAA' ou 'AAAA-MM'). */
export function indiceDesde(pontos: readonly { chave: string }[], desde: string): number {
  return pontos.findIndex((p) =>
    p.chave.length === 4
      ? Number(p.chave) >= Number(desde.slice(0, 4))
      : p.chave >= desde.slice(0, 7),
  );
}

function dataBr(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function passo(lo: number, hi: number): number {
  const amp = hi - lo;
  if (amp > 800) return 200;
  if (amp > 400) return 100;
  if (amp > 150) return 50;
  if (amp > 60) return 25;
  return 10;
}

export default function GraficoLucroCotacao({ ticker, classe, grafico }: GraficoLucroCotacaoProps) {
  const t = TEXTOS_TELA.ativo;
  const g = t.grafico;
  const id = useId();
  const validos = grafico.periodos.filter((p): p is PeriodoGrafico =>
    (PERIODOS_GRAFICO as readonly string[]).includes(p),
  );
  const periodos: PeriodoGrafico[] = validos.length ? validos : [...PERIODOS_GRAFICO];
  const [periodo, setPeriodo] = useState<PeriodoGrafico>(
    periodos.includes('10A') ? '10A' : periodos[periodos.length - 1],
  );
  const [tabela, setTabela] = useState(false);
  const [ativo, setAtivo] = useState<number | null>(null);
  const [W, setW] = useState(W_PADRAO);
  const caixaRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = caixaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w > 0) setW(Math.max(W_MIN, w));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const janela = useMemo(() => recortarJanela(grafico, periodo), [grafico, periodo]);
  const pontos = janela.pontos;
  const temUlt = !!janela.ult12m && (janela.ult12m.a100 !== null || janela.ult12m.b100 !== null);
  const slots = pontos.length + (temUlt ? 1 : 0);

  const valores = [
    ...pontos.flatMap((p) => [p.lacuna ? null : p.a100, p.b100]),
    janela.ult12m?.a100 ?? null,
    janela.ult12m?.b100 ?? null,
  ].filter((v): v is number => v !== null && Number.isFinite(v));
  const minV = Math.min(0, ...valores);
  const maxV = Math.max(100, ...valores);
  const st = passo(minV, maxV);
  const lo = Math.floor(minV / st) * st;
  const hi = Math.ceil(maxV / st) * st;
  const x = (i: number) => PL + (slots <= 1 ? 0 : (i * (W - PL - PR)) / (slots - 1));
  const y = (v: number) => PT + ((hi - v) / (hi - lo || 1)) * (H - PT - PB);

  const grade: number[] = [];
  for (let v = lo; v <= hi; v += st) grade.push(v);

  const mensal = grafico.granularidade === 'mensal';
  const marcaEixo = (i: number): boolean => {
    const c = pontos[i]?.chave ?? '';
    if (!mensal) {
      const passoX = slots > 1 ? (W - PL - PR) / (slots - 1) : W;
      // o rótulo 'últ. 12m' ocupa o lugar do último ano quando os pontos estão próximos
      if (i === pontos.length - 1 && temUlt && passoX < 56) return false;
      return pontos.length <= 6 || i % 3 === 0 || i === pontos.length - 1;
    }
    if (!c.endsWith('-01')) return false;
    const ano = Number(c.slice(0, 4));
    return periodo === '5A' || ano % 2 === 0;
  };

  const textoPonto = (i: number): string => {
    if (i >= pontos.length && janela.ult12m && grafico.ult12m) {
      return `${t.ult12m}: ${grafico.serieA.rotulo} ${moeda(grafico.ult12m.a)} (${base(
        janela.ult12m.a100,
      )}) · ${grafico.serieB.rotulo} ${moeda(grafico.ult12m.b)} (${base(janela.ult12m.b100)})`;
    }
    const p = pontos[i];
    if (!p) return '';
    const a = p.lacuna ? p.lacuna : `${moeda(p.a)} (${base(p.a100)})`;
    return `${rotuloChave(p.chave)}: ${grafico.serieA.rotulo} ${a} · ${grafico.serieB.rotulo} ${moeda(
      p.b,
    )} (${base(p.b100)})`;
  };

  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!slots) return;
    const atual = ativo ?? slots - 1;
    let prox = atual;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') prox = Math.min(slots - 1, atual + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') prox = Math.max(0, atual - 1);
    else if (e.key === 'Home') prox = 0;
    else if (e.key === 'End') prox = slots - 1;
    else if (e.key === 'Escape') {
      setAtivo(null);
      return;
    } else return;
    e.preventDefault();
    setAtivo(prox);
  };

  const aoMover = (e: MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || slots < 1) return;
    const vx = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((vx - PL) / (W - PL - PR)) * (slots - 1));
    setAtivo(Math.max(0, Math.min(slots - 1, i)));
  };

  // bloco C: cotação em conferência desde a detecção; ano dos demonstrativos em conferência
  const ctx = useConferenciaPagina();
  const confCotacao =
    ctx?.conferencias.find(
      (c) => (c.grupo === 'preco_base' || c.grupo === 'preco_esporadico') && c.desde,
    ) ?? null;
  const idxConf = confCotacao?.desde ? indiceDesde(pontos, confCotacao.desde) : -1;
  // o 'últ. 12m' é sempre o ponto mais recente: com a cotação em conferência ele também está, mesmo
  // quando a data da detecção cai depois do último ano fechado (idxConf = -1)
  const ultConf = !!confCotacao?.desde && temUlt && janela.ult12m?.b100 != null;
  const confLpa = ctx?.conferencias.find((c) => c.grupo === 'fundamentos_escala') ?? null;
  const anoLpa = confLpa?.desde ? anoDaChave(confLpa.desde) : null;
  const idxLpa =
    anoLpa !== null && !mensal ? pontos.findIndex((p) => p.chave === String(anoLpa)) : -1;
  const confGrafico = confCotacao ?? confLpa;
  const notaConf = [
    confCotacao?.desde && (idxConf >= 0 || ultConf)
      ? formatarTexto(TEXTOS_TELA.telaConferencia.cotacaoTracejada, {
          data: dataBr(confCotacao.desde),
        })
      : null,
    anoLpa !== null && idxLpa >= 0
      ? formatarTexto(TEXTOS_TELA.telaConferencia.lpaTracejado, { ano: anoLpa })
      : null,
  ].filter((n): n is string => !!n);

  // "Qual dado?" do relato: o ponto mais recente de cada série como na tela ('últ. 12m' ou o
  // último ano/mês com valor)
  const dadoSerie = (
    serie: GraficoAtivo['serieA'],
    ult: number | null | undefined,
    campo: DadoBlocoReporte['campo'],
  ): DadoBlocoReporte | null => {
    if (ult !== null && ult !== undefined)
      return { campo, rotulo: serie.rotulo, valorExibido: moeda(ult), periodo: t.ult12m };
    const p = [...serie.pontos].reverse().find((q) => q.valor !== null);
    return p
      ? { campo, rotulo: serie.rotulo, valorExibido: moeda(p.valor), periodo: rotuloChave(p.chave) }
      : null;
  };
  const dadosRelato = [
    dadoSerie(grafico.serieA, grafico.ult12m?.a, classe === 'fii' ? 'vpCota' : 'lpa'),
    dadoSerie(grafico.serieB, grafico.ult12m?.b, 'preco'),
  ].filter((d): d is DadoBlocoReporte => d !== null);

  const titulo = grafico.titulo;
  const insuficiente = grafico.insuficiente || janela.insuficiente;
  const baseTexto = janela.base
    ? formatarTexto(g.baseEm, { valor: rotuloChave(janela.base) })
    : null;
  const ultIdx = pontos.length;

  return (
    <section
      aria-labelledby={`${id}-h`}
      data-bloco="grafico"
      data-classe={classe}
      className={`${CARD} flex min-w-0 flex-col gap-3`}
    >
      <figure ref={caixaRef} className="m-0 flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={`${id}-h`} className="text-base font-semibold text-gray-800 dark:text-white/90">
            {titulo}
          </h2>
          <span className="inline-flex items-center gap-2">
            <div
              role="group"
              aria-label={g.periodoGrupo}
              className="inline-flex gap-0.5 rounded-xl bg-gray-100 p-[3px] dark:bg-gray-800"
            >
              {periodos.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={periodo === p}
                  aria-label={formatarTexto(g.periodoAria, { n: p.replace('A', '') })}
                  onClick={() => {
                    setPeriodo(p);
                    setAtivo(null);
                  }}
                  className={`min-h-11 min-w-11 rounded-lg px-3 text-sm font-medium sm:min-h-[34px] ${
                    periodo === p
                      ? 'bg-white text-gray-800 shadow-sm dark:bg-gray-900 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <MenuBlocoPagina bloco="grafico" dados={dadosRelato} />
          </span>
        </div>
        {confGrafico ? (
          <span className="self-start" data-grafico-conferencia={confGrafico.grupo}>
            <ChipConferencia
              conferencia={confGrafico}
              campo={confCotacao ? 'preco' : 'lucroLiquido'}
              rotuloCampo={confCotacao ? grafico.serieB.rotulo : grafico.serieA.rotulo}
              bloco="grafico"
            />
          </span>
        ) : null}

        {insuficiente ? (
          <p className="rounded-xl border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {t.historicoInsuficiente}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700 dark:text-gray-300">
              <span className="inline-flex items-center gap-1.5">
                <i
                  aria-hidden="true"
                  className={`inline-block h-[3px] w-3.5 rounded ${COR_A.bg}`}
                />
                {grafico.serieA.rotulo}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i
                  aria-hidden="true"
                  className={`inline-block h-[3px] w-3.5 rounded ${COR_B.bg}`}
                />
                {grafico.serieB.rotulo}
              </span>
              {baseTexto ? (
                <span className="text-gray-500 dark:text-gray-400">{baseTexto}</span>
              ) : null}
            </div>

            {tabela ? (
              <div className={TABLE_STYLES.wrapper} data-tabela-grafico>
                <table className={TABLE_STYLES.table}>
                  <caption className="sr-only">
                    {titulo} · {ticker}
                  </caption>
                  <thead>
                    <tr className={TABLE_STYLES.headRow} style={TABLE_HEADER_STYLE}>
                      <th scope="col" className={`${TABLE_STYLES.compact.th} text-left`}>
                        {mensal ? g.colunaMes : g.colunaAno}
                      </th>
                      <th scope="col" className={`${TABLE_STYLES.compact.th} text-right`}>
                        {grafico.serieA.rotulo}
                      </th>
                      <th scope="col" className={`${TABLE_STYLES.compact.th} text-right`}>
                        {baseTexto}
                      </th>
                      <th scope="col" className={`${TABLE_STYLES.compact.th} text-right`}>
                        {grafico.serieB.rotulo}
                      </th>
                      <th scope="col" className={`${TABLE_STYLES.compact.th} text-right`}>
                        {baseTexto}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pontos.map((p) => (
                      <tr key={p.chave} className={TABLE_STYLES.row}>
                        <th
                          scope="row"
                          className={`${TABLE_STYLES.compact.td} text-left font-medium`}
                        >
                          {rotuloChave(p.chave)}
                        </th>
                        <td className={`${TABLE_STYLES.compact.td} text-right tabular-nums`}>
                          {p.lacuna ? p.lacuna : moeda(p.a)}
                        </td>
                        <td className={`${TABLE_STYLES.compact.td} text-right tabular-nums`}>
                          {p.lacuna ? TEXTOS_TELA.formato.semDado : base(p.a100)}
                        </td>
                        <td className={`${TABLE_STYLES.compact.td} text-right tabular-nums`}>
                          {moeda(p.b)}
                        </td>
                        <td className={`${TABLE_STYLES.compact.td} text-right tabular-nums`}>
                          {base(p.b100)}
                        </td>
                      </tr>
                    ))}
                    {temUlt && grafico.ult12m && janela.ult12m ? (
                      <tr className={TABLE_STYLES.totalRow}>
                        <th scope="row" className={`${TABLE_STYLES.compact.td} text-left`}>
                          {t.ult12mTabela}
                        </th>
                        <td className={`${TABLE_STYLES.compact.td} text-right tabular-nums`}>
                          {moeda(grafico.ult12m.a)}
                        </td>
                        <td className={`${TABLE_STYLES.compact.td} text-right tabular-nums`}>
                          {base(janela.ult12m.a100)}
                        </td>
                        <td className={`${TABLE_STYLES.compact.td} text-right tabular-nums`}>
                          {moeda(grafico.ult12m.b)}
                        </td>
                        <td className={`${TABLE_STYLES.compact.td} text-right tabular-nums`}>
                          {base(janela.ult12m.b100)}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                className="relative rounded-lg focus-visible:outline-3 focus-visible:outline-[#0079F2] dark:focus-visible:outline-[#6E9DC4]"
                tabIndex={0}
                aria-describedby={`${id}-teclado`}
                onKeyDown={aoTeclar}
                onFocus={() => setAtivo((a) => a ?? slots - 1)}
                onBlur={() => setAtivo(null)}
                data-grafico-svg
              >
                <span id={`${id}-teclado`} className="sr-only">
                  {g.teclado}
                </span>
                <svg
                  viewBox={`0 0 ${W} ${H}`}
                  role="img"
                  aria-labelledby={`${id}-t ${id}-d`}
                  className="block h-auto max-h-[280px] w-full"
                  onMouseMove={aoMover}
                  onMouseLeave={() => setAtivo(null)}
                >
                  <title id={`${id}-t`}>{`${titulo} · ${ticker}`}</title>
                  <desc id={`${id}-d`}>{`${grafico.figcaption} ${baseTexto ?? ''}`}</desc>
                  {grade.map((v) => (
                    <g key={v}>
                      <line
                        x1={PL}
                        x2={W - PR}
                        y1={y(v)}
                        y2={y(v)}
                        className="stroke-gray-200 dark:stroke-gray-800"
                      />
                      <text
                        x={PL - 6}
                        y={y(v) + 4}
                        textAnchor="end"
                        className="fill-gray-500 text-[11px] dark:fill-gray-400"
                      >
                        {v}
                      </text>
                    </g>
                  ))}
                  {pontos.map((p, i) =>
                    marcaEixo(i) ? (
                      <text
                        key={`x-${p.chave}`}
                        x={x(i)}
                        y={H - 8}
                        textAnchor="middle"
                        className="fill-gray-500 text-[11px] dark:fill-gray-400"
                      >
                        {mensal ? p.chave.slice(0, 4) : p.chave}
                      </text>
                    ) : null,
                  )}
                  {temUlt ? (
                    <text
                      x={x(ultIdx)}
                      y={H - 8}
                      textAnchor="middle"
                      className="fill-gray-500 text-[11px] dark:fill-gray-400"
                    >
                      {t.ult12m}
                    </text>
                  ) : null}
                  {idxConf >= 0 ? (
                    <>
                      <path
                        d={trecho(pontos, 'b100', x, y, 0, Math.max(0, idxConf - 1))}
                        fill="none"
                        strokeWidth={2.2}
                        className={COR_B.stroke}
                      />
                      <path
                        data-trecho-conferencia=""
                        d={trecho(
                          pontos,
                          'b100',
                          x,
                          y,
                          Math.max(0, idxConf - 1),
                          pontos.length - 1,
                        )}
                        fill="none"
                        strokeWidth={2.2}
                        strokeDasharray="5 4"
                        className={COR_B.stroke}
                      />
                    </>
                  ) : (
                    <path
                      d={caminho(pontos, 'b100', x, y)}
                      fill="none"
                      strokeWidth={2.2}
                      className={COR_B.stroke}
                    />
                  )}
                  <path
                    d={caminho(pontos, 'a100', x, y)}
                    fill="none"
                    strokeWidth={2.2}
                    className={COR_A.stroke}
                  />
                  {idxLpa >= 0 && pontos[idxLpa]?.a100 != null ? (
                    <circle
                      data-ponto-conferencia=""
                      cx={x(idxLpa)}
                      cy={y(pontos[idxLpa].a100 as number)}
                      r={5}
                      strokeWidth={1.6}
                      strokeDasharray="2 2"
                      className={`fill-white dark:fill-gray-900 ${COR_A.stroke}`}
                    />
                  ) : null}
                  {pontos.map((p, i) =>
                    p.lacuna ? (
                      <circle
                        key={`lac-${p.chave}`}
                        cx={x(i)}
                        cy={y(lo)}
                        r={3.5}
                        strokeDasharray="2 2"
                        className="fill-none stroke-[#D92D20] dark:stroke-[#F97066]"
                      >
                        <title>{`${rotuloChave(p.chave)}: ${p.lacuna}`}</title>
                      </circle>
                    ) : null,
                  )}
                  {temUlt && janela.ult12m ? (
                    <>
                      {janela.ult12m.b100 !== null ? (
                        <circle
                          data-ponto-conferencia={ultConf ? '' : undefined}
                          cx={x(ultIdx)}
                          cy={y(janela.ult12m.b100)}
                          r={ultConf ? 5 : 4}
                          strokeWidth={ultConf ? 1.6 : 2}
                          strokeDasharray={ultConf ? '2 2' : undefined}
                          className={`fill-white dark:fill-gray-900 ${COR_B.stroke}`}
                        />
                      ) : null}
                      {janela.ult12m.a100 !== null ? (
                        <circle
                          cx={x(ultIdx)}
                          cy={y(janela.ult12m.a100)}
                          r={4}
                          strokeWidth={2}
                          className={`fill-white dark:fill-gray-900 ${COR_A.stroke}`}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {ativo !== null && ativo < slots ? (
                    <line
                      x1={x(ativo)}
                      x2={x(ativo)}
                      y1={PT}
                      y2={H - PB}
                      strokeDasharray="3 3"
                      className="stroke-gray-400 dark:stroke-gray-500"
                    />
                  ) : null}
                </svg>
                {ativo !== null && ativo < slots ? (
                  <div
                    aria-hidden="true"
                    data-tooltip
                    className="pointer-events-none absolute top-1 z-10 max-w-[90%] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                    style={
                      x(ativo) > W / 2
                        ? { right: `${((W - x(ativo)) / W) * 100 + 2}%` }
                        : { left: `${(x(ativo) / W) * 100 + 2}%` }
                    }
                  >
                    {textoPonto(ativo)}
                  </div>
                ) : null}
                <p className="sr-only" aria-live="polite">
                  {ativo !== null ? textoPonto(ativo) : ''}
                </p>
              </div>
            )}
          </>
        )}

        <figcaption className="text-xs text-gray-500 dark:text-gray-400">
          {grafico.figcaption} {grafico.lacunas.length > 0 ? `${t.lacunaPrejuizo}. ` : null}
          {notaConf.length > 0 ? `${notaConf.join(' ')} ` : null}
          {!insuficiente ? (
            <button
              type="button"
              onClick={() => setTabela((v) => !v)}
              aria-pressed={tabela}
              className="inline-flex min-h-11 items-center font-medium text-[#396CAA] underline-offset-2 hover:underline sm:min-h-0 dark:text-[#6E9DC4]"
            >
              {tabela ? t.verGrafico : t.verDadosTabela}
            </button>
          ) : null}
        </figcaption>
      </figure>
      <RodapeFrescorBloco bloco="grafico" />
    </section>
  );
}
