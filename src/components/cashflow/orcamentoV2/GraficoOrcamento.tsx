'use client';

/**
 * Gráfico compacto "Orçado × Real por categoria" (spec v.8: substitui a rosca do app; cada par de
 * barras responde "passou ou não"). Desktop: barras verticais agrupadas, card recolhível com a
 * preferência `graficoVisivel`. Celular: barras horizontais, começa recolhido (lista primeiro).
 *
 * Orçado em cinza (`transparencia` #CCCCCC; cinza neutro no escuro) e Real na cor do status que o
 * servidor mandou (tons de `lib/orcamento/tons`, §8). Nada é recalculado aqui.
 */
import { useState } from 'react';
import type { StatusOrcamento } from '@/lib/orcamento/regras';
import type { CategoriaV2, OrcamentoV2Response } from '@/types/orcamentoV2';
import { mesLongo, num, periodoCurto } from './apresentacao';

/** Rótulo curto do eixo (spec v.8, ABBR); a chave é o nome normalizado da categoria. */
const ABREVIADO: Record<string, string> = {
  'animais de estimação': 'Pets',
  'despesas pessoais': 'Pessoais',
  'despesas com dependentes': 'Dependentes',
  'despesas empresa': 'Empresa',
  'despesas financeiras': 'Financeiras',
  'planejamento financeiro': 'Planejamento',
  'despesas variáveis': 'Variáveis',
};

const abreviado = (nome: string) => ABREVIADO[nome.trim().toLowerCase()] ?? nome;

/** Preenchimento (SVG) e fundo (HTML) do Real por status. */
const FILL_REAL: Record<StatusOrcamento, string> = {
  ok: 'fill-[#0079F2]',
  warn: 'fill-[#D97706]',
  bad: 'fill-[#D92D20] dark:fill-[#F97066]',
  none: 'fill-gray-400 dark:fill-gray-500',
};
const BG_REAL: Record<StatusOrcamento, string> = {
  ok: 'bg-[#0079F2]',
  warn: 'bg-[#D97706]',
  bad: 'bg-[#D92D20] dark:bg-[#F97066]',
  none: 'bg-gray-400 dark:bg-gray-500',
};
const FILL_ORCADO = 'fill-[#CCCCCC] dark:fill-gray-600';
const BG_ORCADO = 'bg-[#CCCCCC] dark:bg-gray-600';

const CARD = 'rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]';

function Chevron({ aberto }: { aberto: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`h-3 w-3 transition-transform ${aberto ? '' : '-rotate-90'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Legenda() {
  const item = (cor: string, texto: string) => (
    <span className="inline-flex items-center gap-1.5">
      <i aria-hidden className={`inline-block h-2.5 w-2.5 rounded-[3px] ${cor}`} />
      {texto}
    </span>
  );
  return (
    <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11.5px] text-gray-500 dark:text-gray-400">
      {item(BG_ORCADO, 'Orçado')}
      {item(BG_REAL.ok, 'Real')}
      {item(BG_REAL.warn, 'à frente do ritmo')}
      {item(BG_REAL.bad, 'estouro')}
    </span>
  );
}

/** "Outubro 2026" ou "Acumulado ago–out 2026" (a partir do 1º mês com orçado). */
function rotuloPeriodo(data: OrcamentoV2Response): string {
  if (data.visao === 'ano') return `Acumulado ${periodoCurto(data)} ${data.ano}`;
  return mesLongo({ ano: data.ano, mes: data.mes });
}

const tituloBarra = (c: CategoriaV2) =>
  `${c.nome} · orçado R$ ${num(c.orcado)} · realizado R$ ${num(c.realizado)}`;

/** Valor do eixo: "12,5 mil" a partir de mil. */
const eixo = (v: number) =>
  v >= 1000
    ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
    : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

const W = 1100;
const H = 190;
const PL = 52;
const PR = 10;
const PT = 14;
const PB = 34;

function BarrasVerticais({ categorias }: { categorias: CategoriaV2[] }) {
  const n = Math.max(1, categorias.length);
  const max = Math.max(...categorias.map((c) => Math.max(c.orcado, c.realizado)), 0) * 1.12 || 1;
  const bw = (W - PL - PR) / n;
  const y = (v: number) => PT + (H - PT - PB) * (1 - v / max);
  const w = bw * 0.28;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full overflow-visible"
      role="img"
      aria-label="Orçado e realizado por categoria"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line
            x1={PL}
            x2={W - PR}
            y1={y(max * f)}
            y2={y(max * f)}
            className="stroke-gray-100 dark:stroke-gray-800"
          />
          <text
            x={PL - 8}
            y={y(max * f) + 4}
            textAnchor="end"
            fontSize={10.5}
            className="fill-gray-400 dark:fill-gray-500"
          >
            {eixo(max * f)}
          </text>
        </g>
      ))}
      {categorias.map((c, i) => {
        const x = PL + bw * i;
        return (
          <g key={c.id} data-mf-grafico-categoria={c.id}>
            <title>{tituloBarra(c)}</title>
            <rect
              x={x + bw * 0.18}
              y={y(c.orcado)}
              width={w}
              height={H - PB - y(c.orcado)}
              rx={2}
              className={FILL_ORCADO}
            />
            <rect
              x={x + bw * 0.18 + w + 3}
              y={y(c.realizado)}
              width={w}
              height={H - PB - y(c.realizado)}
              rx={2}
              className={FILL_REAL[c.status]}
            />
            <text
              x={x + bw / 2}
              y={H - 10}
              textAnchor="middle"
              fontSize={10.5}
              className="fill-gray-500 dark:fill-gray-400"
            >
              {abreviado(c.nome)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Desktop: card recolhível; abrir/fechar grava `graficoVisivel` nas prefs. */
export default function GraficoOrcamento({
  data,
  onAlternar,
}: {
  data: OrcamentoV2Response;
  onAlternar: (visivel: boolean) => void;
}) {
  const [aberto, setAberto] = useState(data.prefs.graficoVisivel);
  const alternar = () => {
    setAberto(!aberto);
    onAlternar(!aberto);
  };
  return (
    <section data-mf-grafico-orcamento="" className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <h3 className="flex items-center gap-2.5 text-sm font-semibold text-gray-800 dark:text-white/90">
          <button
            type="button"
            onClick={alternar}
            aria-expanded={aberto}
            aria-label={aberto ? 'Ocultar gráfico' : 'Mostrar gráfico'}
            title={aberto ? 'Ocultar gráfico' : 'Mostrar gráfico'}
            className="grid h-[1.375rem] w-[1.375rem] place-items-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-300 dark:hover:bg-white/5"
          >
            <Chevron aberto={aberto} />
          </button>
          Orçado × Real por categoria
          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
            {rotuloPeriodo(data)}
          </span>
        </h3>
        <Legenda />
      </div>
      {aberto && (
        <div className="px-4 pb-2">
          <BarrasVerticais categorias={data.categorias} />
        </div>
      )}
    </section>
  );
}

/** Celular: barras horizontais (só categorias com orçado ou real), começa recolhido. */
export function GraficoOrcamentoCelular({ data }: { data: OrcamentoV2Response }) {
  const [aberto, setAberto] = useState(false);
  const categorias = data.categorias.filter((c) => c.orcado || c.realizado);
  const max = Math.max(...categorias.map((c) => Math.max(c.orcado, c.realizado)), 0) || 1;
  return (
    <section data-mf-grafico-orcamento="" className={CARD}>
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
        className="flex min-h-11 w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-gray-800 dark:text-white/90"
      >
        <span className="grid h-[1.375rem] w-[1.375rem] shrink-0 place-items-center rounded-md border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300">
          <Chevron aberto={aberto} />
        </span>
        <span className="min-w-0 flex-1">Orçado × Real por categoria</span>
        <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
          {aberto ? 'ocultar' : 'ver'}
        </span>
      </button>
      {aberto && (
        <div className="space-y-2 px-4 pb-3">
          {categorias.map((c) => (
            <div
              key={c.id}
              data-mf-grafico-categoria={c.id}
              title={tituloBarra(c)}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs"
            >
              <span className="truncate text-gray-600 dark:text-gray-300">{abreviado(c.nome)}</span>
              <span className="relative h-3 min-w-0 rounded-sm bg-gray-50 dark:bg-white/[0.03]">
                <i
                  aria-hidden
                  className={`absolute inset-y-0 left-0 rounded-sm ${BG_ORCADO}`}
                  style={{ width: `${(c.orcado / max) * 100}%` }}
                />
                <i
                  aria-hidden
                  className={`absolute left-0 top-1/4 h-1/2 rounded-sm ${BG_REAL[c.status]}`}
                  style={{ width: `${Math.min(100, (c.realizado / max) * 100)}%` }}
                />
              </span>
              <span className="text-right tabular-nums text-gray-700 dark:text-gray-200">
                {Math.round(c.realizado).toLocaleString('pt-BR')}
                <small className="text-gray-400 dark:text-gray-500">
                  /{Math.round(c.orcado).toLocaleString('pt-BR')}
                </small>
              </span>
            </div>
          ))}
          <div className="pt-1">
            <Legenda />
          </div>
        </div>
      )}
    </section>
  );
}
