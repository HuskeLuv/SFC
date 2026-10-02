'use client';

/**
 * Mini-gráfico de um múltiplo histórico (fatia C): linha dos anos fiscais fechados (outside no
 * claro / tranquilidade no escuro) com a média tracejada em cinza. viewBox 320 com margem direita
 * de 64 para o rótulo da média não ser cortado. <figure> com figcaption de uma frase e
 * "Ver dados em tabela". Menos de 3 pontos: "histórico insuficiente para o gráfico".
 */
import { useId, useState } from 'react';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import { COR_LINK } from '@/constants/analiseAtivosVisual';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { HistoricoMultiplo } from '@/types/analiseAtivosApi';

const TH = TEXTOS_TELA.analise.historicos;
const W = 320;
const H = 130;
const PL = 40;
const PR = 64;
const PT = 12;
const PB = 22;

export interface MiniGraficoMultiploProps {
  historico: HistoricoMultiplo;
}

export default function MiniGraficoMultiplo({ historico }: MiniGraficoMultiploProps) {
  const [tabela, setTabela] = useState(false);
  const idTabela = useId();
  const { pontos, formato, rotulo, media } = historico;
  const validos = pontos.filter((p): p is { ano: number; valor: number } => p.valor !== null);
  const titulo = formatarTexto(TH.titulo, { valor: rotulo });
  const fmt = (v: number) => formatarAnalise(v, formato);

  if (validos.length < 3) {
    return (
      <figure className="flex min-w-0 flex-col gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{titulo}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {TEXTOS_TELA.ativo.historicoInsuficiente}
        </p>
      </figure>
    );
  }

  const valores = validos.map((p) => p.valor);
  const minV = Math.min(...valores);
  const maxV = Math.max(...valores);
  const pad = (maxV - minV) * 0.15 || Math.abs(maxV) * 0.1 || 1;
  const lo = Math.min(minV, media ?? minV) - pad;
  const hi = Math.max(maxV, media ?? maxV) + pad;
  const n = Math.max(pontos.length - 1, 1);
  const x = (i: number) => PL + (i * (W - PL - PR)) / n;
  const y = (v: number) => PT + ((hi - v) / (hi - lo)) * (H - PT - PB);

  let d = '';
  let ligado = false;
  pontos.forEach((p, i) => {
    if (p.valor === null) {
      ligado = false;
      return;
    }
    d += `${ligado ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`;
    ligado = true;
  });
  const iUltimo = pontos.map((p) => p.valor !== null).lastIndexOf(true);
  const ultimo = pontos[iUltimo];
  const aria = [
    titulo,
    media !== null ? formatarTexto(TH.media, { valor: fmt(media) }) : null,
    `${TEXTOS_TELA.analise.valuation.legenda.min} ${fmt(minV)}`,
    `${TEXTOS_TELA.analise.valuation.legenda.max} ${fmt(maxV)}`,
    ultimo?.valor != null ? `${ultimo.ano}: ${fmt(ultimo.valor)}` : null,
  ]
    .filter(Boolean)
    .join('; ');

  return (
    <figure className="flex min-w-0 flex-col gap-2" data-historico={historico.codigo}>
      <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{titulo}</h3>
      {tabela ? (
        <table id={idTabela} className="w-full text-xs text-gray-700 dark:text-gray-200">
          <caption className="sr-only">{titulo}</caption>
          <thead>
            <tr className="text-gray-500 dark:text-gray-400">
              <th scope="col" className="py-1 text-left font-medium">
                {TEXTOS_TELA.analise.fundamentos.ano}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {rotulo}
              </th>
            </tr>
          </thead>
          <tbody>
            {pontos.map((p) => (
              <tr key={p.ano} className="border-t border-gray-100 dark:border-gray-800">
                <th scope="row" className="py-1 text-left font-normal">
                  {p.ano}
                </th>
                <td className="py-1 text-right tabular-nums">
                  {p.valor === null ? TEXTOS_TELA.formato.semDado : fmt(p.valor)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={aria}
          className="h-auto max-h-[170px] w-full overflow-visible text-[10px]"
        >
          {media !== null ? (
            <>
              <line
                x1={PL}
                x2={W - PR}
                y1={y(media)}
                y2={y(media)}
                strokeDasharray="4 3"
                className="stroke-gray-400 dark:stroke-gray-500"
              />
              <text x={W - PR + 4} y={y(media) + 3.5} className="fill-gray-500 dark:fill-gray-400">
                {formatarTexto(TH.media, { valor: fmt(media) })}
              </text>
            </>
          ) : null}
          <path
            d={d}
            fill="none"
            strokeWidth={2.2}
            className="stroke-[#0079F2] dark:stroke-[#6E9DC4]"
          />
          {ultimo?.valor != null ? (
            <circle
              cx={x(iUltimo)}
              cy={y(ultimo.valor)}
              r={3.5}
              className="fill-[#0079F2] dark:fill-[#6E9DC4]"
            />
          ) : null}
          <text
            x={PL - 4}
            y={y(maxV) + 3.5}
            textAnchor="end"
            className="fill-gray-500 dark:fill-gray-400"
          >
            {fmt(maxV)}
          </text>
          <text
            x={PL - 4}
            y={y(minV) + 3.5}
            textAnchor="end"
            className="fill-gray-500 dark:fill-gray-400"
          >
            {fmt(minV)}
          </text>
          <text x={x(0)} y={H - 6} textAnchor="middle" className="fill-gray-500 dark:fill-gray-400">
            {pontos[0].ano}
          </text>
          <text
            x={x(pontos.length - 1)}
            y={H - 6}
            textAnchor="middle"
            className="fill-gray-500 dark:fill-gray-400"
          >
            {pontos[pontos.length - 1].ano}
          </text>
        </svg>
      )}
      <figcaption className="text-xs text-gray-500 dark:text-gray-400">
        {formatarTexto(TH.figcaption, { valor: rotulo })}{' '}
        <button
          type="button"
          aria-expanded={tabela}
          aria-controls={tabela ? idTabela : undefined}
          onClick={() => setTabela((v) => !v)}
          className={`inline-flex min-h-11 items-center underline-offset-2 hover:underline lg:min-h-0 ${COR_LINK.classes}`}
        >
          {tabela ? TEXTOS_TELA.ativo.verGrafico : TEXTOS_TELA.ativo.verDadosTabela}
        </button>
      </figcaption>
    </figure>
  );
}
