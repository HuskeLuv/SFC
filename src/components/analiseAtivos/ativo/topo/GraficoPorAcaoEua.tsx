'use client';

/**
 * Gráfico anual por ação de Stocks e REITs (fatia C): 'LPA por ano' (stock) ou 'Caixa operacional
 * por ação por ano' (REIT), barras por ano fiscal (FY) a partir do 10-K da SEC — SEM série de
 * cotação (decisão do Wellington de 17/10). Lê AtivoTopoResposta.grafico (só a série A).
 *
 * Acessível: <figure> com o SVG role=img + resumo no aria-label, tabela sr-only com os pontos e
 * figcaption neutra. Valor negativo abaixo da linha de base, na cor de negativo do app.
 */
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import { RodapeFrescorBloco } from '@/components/analiseAtivos/ativo/topo/SeloFrescor';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { TEXTOS_EUA_TELAS, formatarTexto } from '@/services/analiseAtivos/textosEuaTelas';
import type { GraficoAtivo } from '@/types/analiseAtivosApi';

const CARD =
  'rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]';
const W = 320;
const H = 220;
const PX = 8;
const PT = 22;
const PB = 26;

const G = TEXTOS_EUA_TELAS.ativo.grafico;

export function rotuloPonto(ano: string, valor: number | null): string {
  if (valor === null) return formatarTexto(G.semPonto, { ano });
  const v = formatarAnalise(Math.abs(valor), 'numero2');
  return formatarTexto(valor < 0 ? G.prejuizo : G.barraTitulo, { ano, valor: v });
}

export default function GraficoPorAcaoEua({
  ticker,
  grafico,
}: {
  ticker: string;
  grafico: GraficoAtivo;
}) {
  const pontos = grafico.serieA.pontos;
  const valores = pontos.map((p) => p.valor).filter((v): v is number => typeof v === 'number');
  const max = Math.max(...valores, 0);
  const min = Math.min(...valores, 0);
  const faixa = max - min || 1;
  const altura = H - PT - PB;
  const y = (v: number) => PT + ((max - v) / faixa) * altura;
  const zero = y(0);
  const n = Math.max(pontos.length, 1);
  const largura = (W - 2 * PX) / n;
  const bw = Math.min(26, largura * 0.62);
  const x = (i: number) => PX + i * largura + (largura - bw) / 2;
  const idTitulo = `grafico-eua-${ticker}`;
  const resumo = `${grafico.titulo}: ${pontos.map((p) => rotuloPonto(p.chave, p.valor)).join('; ')}`;

  return (
    <section
      aria-labelledby={idTitulo}
      data-bloco="grafico"
      data-grafico-eua=""
      className={`${CARD} flex min-w-0 flex-col gap-3`}
    >
      <figure className="m-0 flex min-w-0 flex-col gap-2">
        <h2 id={idTitulo} className="text-base font-semibold text-gray-800 dark:text-white/90">
          {grafico.titulo}
        </h2>
        {grafico.insuficiente ? (
          <p className="rounded-xl border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {TEXTOS_TELA.ativo.historicoInsuficiente}
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={resumo}
            className="block h-auto max-h-[260px] w-full"
          >
            {pontos.map((p, i) => {
              if (p.valor === null) {
                return (
                  <rect
                    key={p.chave}
                    data-ano={p.chave}
                    data-sem-dado=""
                    x={x(i)}
                    y={zero - 10}
                    width={bw}
                    height={10}
                    rx={3}
                    strokeDasharray="3 2"
                    className="fill-none stroke-gray-400 dark:stroke-gray-500"
                  />
                );
              }
              const topo = Math.min(y(p.valor), zero);
              const alt = Math.max(1, Math.abs(y(p.valor) - zero));
              const negativo = p.valor < 0;
              return (
                <g key={p.chave}>
                  <rect
                    data-ano={p.chave}
                    x={x(i)}
                    y={topo}
                    width={bw}
                    height={alt}
                    rx={4}
                    className={
                      negativo
                        ? 'fill-[#D92D20] dark:fill-[#F97066]'
                        : 'fill-[#396CAA] dark:fill-[#6E9DC4]'
                    }
                  >
                    <title>{rotuloPonto(p.chave, p.valor)}</title>
                  </rect>
                  {i === 0 || i === pontos.length - 1 ? (
                    <text
                      x={x(i) + bw / 2}
                      y={negativo ? topo + alt + 12 : topo - 6}
                      textAnchor="middle"
                      className="fill-gray-800 text-[11px] font-semibold dark:fill-white"
                    >
                      {formatarAnalise(p.valor, 'numero2')}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {pontos.map((p, i) =>
              i === 0 || i === pontos.length - 1 || i === Math.floor((pontos.length - 1) / 2) ? (
                <text
                  key={`x-${p.chave}`}
                  x={x(i) + bw / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-gray-500 text-[11px] dark:fill-gray-400"
                >
                  {`FY${p.chave}`}
                </text>
              ) : null,
            )}
            <line
              x1={PX}
              x2={W - PX}
              y1={zero}
              y2={zero}
              className="stroke-gray-300 dark:stroke-gray-700"
            />
          </svg>
        )}
        <table className="sr-only">
          <caption>{grafico.titulo}</caption>
          <thead>
            <tr>
              <th scope="col">{TEXTOS_EUA_TELAS.essencial.ano}</th>
              <th scope="col">{grafico.serieA.rotulo}</th>
            </tr>
          </thead>
          <tbody>
            {pontos.map((p) => (
              <tr key={p.chave}>
                <th scope="row">{`FY${p.chave}`}</th>
                <td>
                  {p.valor === null
                    ? TEXTOS_TELA.formato.semDado
                    : formatarAnalise(p.valor, 'numero2')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <figcaption className="text-xs text-gray-500 dark:text-gray-400">
          {grafico.figcaption}
        </figcaption>
      </figure>
      <RodapeFrescorBloco bloco="grafico" />
    </section>
  );
}
