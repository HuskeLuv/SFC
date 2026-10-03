'use client';

/**
 * Proventos por ano (ações: DPA ajustado; FIIs: rendimento por cota) — fatia B.
 * - Só anos FECHADOS; o 'últ. 12m' aparece à parte, em texto.
 * - Ano em conferência (salto > 2× o anterior ou flag): barra TRACEJADA com asterisco, <title>
 *   '(em conferência)', nota na legenda e fora do crescimento anual (CAGR com motivo).
 * - Ano sem dado: toco tracejado. Rótulo de valor só no primeiro e no último ano.
 * - Tabela oculta (sr-only) com os mesmos números para leitor de tela.
 * Barras em patrimonio (#396CAA; escuro tranquilidade #6E9DC4).
 * Bloco C: selo 'em_conferencia' (grupo proventos pelas flags 'conf:') = chip que abre o "Por
 * quê?"; menu ⋯ no cabeçalho e selo de frescor no rodapé (só com relato ligado / params v2).
 */
import ChipConferencia from '@/components/analiseAtivos/comum/ChipConferencia';
import {
  MenuBlocoPagina,
  useConferenciaPagina,
} from '@/components/analiseAtivos/comum/PorQueConferencia';
import SeloEstado from '@/components/analiseAtivos/comum/SeloEstado';
import { RodapeFrescorBloco } from '@/components/analiseAtivos/ativo/topo/SeloFrescor';
import { conferenciaDoCampo } from '@/services/analiseAtivos/leitura/ativo/conferenciasAtivo';
import { formatarAnalise } from '@/components/analiseAtivos/comum/formatarAnalise';
import { TEXTOS_TELA, formatarTexto } from '@/services/analiseAtivos/textosTela';
import type { BlocoDividendosProps } from '@/types/analiseAtivosApi';

export type { BlocoDividendosProps };

const CARD =
  'rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-white/[0.03]';
const W = 320;
const H = 220;
const PX = 8;
const PT = 24;
const PB = 28;

function moeda(v: number): string {
  return formatarAnalise(v, 'moeda');
}

export default function BlocoDividendos({ classe, dividendos }: BlocoDividendosProps) {
  const ctx = useConferenciaPagina();
  const t = TEXTOS_TELA.ativo;
  const d = t.dividendos;
  const titulo =
    classe === 'fii' ? TEXTOS_TELA.blocos.dividendosFii : TEXTOS_TELA.blocos.dividendosAcao;
  const anos = dividendos.anos;
  const reais = anos.map((a) => a.valor).filter((v): v is number => typeof v === 'number');
  const max = Math.max(...reais, 0) * 1.12 || 1;
  const n = Math.max(anos.length, 1);
  const largura = (W - 2 * PX) / n;
  const bw = Math.min(26, largura * 0.62);
  const x = (i: number) => PX + i * largura + (largura - bw) / 2;
  const y = (v: number) => PT + (1 - Math.max(0, v) / max) * (H - PT - PB);
  const primeiro = anos.findIndex((a) => a.valor !== null);
  const ultimo = anos.length - 1 - [...anos].reverse().findIndex((a) => a.valor !== null);
  const temSuspeito = anos.some((a) => a.suspeito);
  const temSemDado = anos.some((a) => a.valor === null);

  const { cagrAnoInicio: ini, cagrAnoFim: fim } = dividendos;
  const cagr =
    dividendos.cagr5aPct !== null && ini !== null && fim !== null
      ? formatarTexto(d.cagr, {
          valor: formatarAnalise(dividendos.cagr5aPct, 'pctSinal'),
          ano: `${ini} a ${fim}`,
        })
      : null;

  const rotuloBarra = (ano: number, valor: number, suspeito?: boolean) =>
    formatarTexto(suspeito ? d.emConferenciaTitulo : d.barraTitulo, { ano, valor: moeda(valor) });

  const resumo = reais.length
    ? `${titulo}: ${anos
        .filter((a) => a.valor !== null)
        .map((a) => rotuloBarra(a.ano, a.valor as number, a.suspeito))
        .join('; ')}`
    : d.semDados;

  return (
    <section
      aria-labelledby="bloco-div-h"
      data-bloco="dividendos"
      className={`${CARD} flex min-w-0 flex-col gap-3`}
    >
      <figure className="m-0 flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="bloco-div-h" className="text-base font-semibold text-gray-800 dark:text-white/90">
            {titulo}
          </h2>
          <span className="inline-flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400" data-cagr>
              {cagr ?? `${t.cagr5a}: ${dividendos.cagrMotivo ?? TEXTOS_TELA.formato.semDado}`}
            </span>
            <MenuBlocoPagina bloco="dividendos" />
          </span>
        </div>
        {dividendos.selo === 'em_conferencia' ? (
          <span className="self-start">
            <ChipConferencia
              conferencia={conferenciaDoCampo(ctx?.conferencias, 'proventosAno')}
              campo="proventosAno"
              rotuloCampo={titulo}
              bloco="dividendos"
            />
          </span>
        ) : dividendos.selo ? (
          <SeloEstado tipo={dividendos.selo} className="self-start" />
        ) : null}

        {reais.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {d.semDados}
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={resumo}
            className="block h-auto max-h-[260px] w-full"
          >
            {anos.map((a, i) => {
              if (a.valor === null) {
                return (
                  <rect
                    key={a.ano}
                    data-ano={a.ano}
                    data-sem-dado
                    x={x(i)}
                    y={H - PB - 10}
                    width={bw}
                    height={10}
                    rx={3}
                    strokeDasharray="3 2"
                    className="fill-none stroke-gray-400 dark:stroke-gray-500"
                  />
                );
              }
              const yy = y(a.valor);
              return (
                <g key={a.ano}>
                  <rect
                    data-ano={a.ano}
                    data-suspeito={a.suspeito ? 'true' : undefined}
                    x={x(i)}
                    y={yy}
                    width={bw}
                    height={Math.max(1, H - PB - yy)}
                    rx={4}
                    strokeDasharray={a.suspeito ? '3 2' : undefined}
                    strokeWidth={a.suspeito ? 1.5 : 0}
                    className={
                      a.suspeito
                        ? 'fill-gray-100 stroke-gray-500 dark:fill-gray-800 dark:stroke-gray-400'
                        : 'fill-[#396CAA] dark:fill-[#6E9DC4]'
                    }
                  >
                    <title>{rotuloBarra(a.ano, a.valor, a.suspeito)}</title>
                  </rect>
                  {i === primeiro || i === ultimo ? (
                    <text
                      x={x(i) + bw / 2}
                      y={yy - 6}
                      textAnchor="middle"
                      className="fill-gray-800 text-[11px] font-semibold dark:fill-white"
                    >
                      {`${formatarAnalise(a.valor, 'numero2')}${a.suspeito ? '*' : ''}`}
                    </text>
                  ) : null}
                </g>
              );
            })}
            {anos.map((a, i) =>
              i === 0 || i === anos.length - 1 || i === Math.floor((anos.length - 1) / 2) ? (
                <text
                  key={`x-${a.ano}`}
                  x={x(i) + bw / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-gray-500 text-[11px] dark:fill-gray-400"
                >
                  {a.ano}
                </text>
              ) : null,
            )}
            <line
              x1={PX}
              x2={W - PX}
              y1={H - PB}
              y2={H - PB}
              className="stroke-gray-300 dark:stroke-gray-700"
            />
          </svg>
        )}

        <table className="sr-only">
          <caption>{titulo}</caption>
          <thead>
            <tr>
              <th scope="col">{t.grafico.colunaAno}</th>
              <th scope="col">{titulo}</th>
            </tr>
          </thead>
          <tbody>
            {anos.map((a) => (
              <tr key={a.ano}>
                <th scope="row">{a.ano}</th>
                <td>
                  {a.valor === null ? TEXTOS_TELA.formato.semDado : moeda(a.valor)}
                  {a.suspeito ? ` (${TEXTOS_TELA.selos.emConferencia})` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {dividendos.ult12m ? (
          <p className="text-sm text-gray-700 dark:text-gray-300" data-ult12m>
            {formatarTexto(d.ult12m, { valor: moeda(dividendos.ult12m.valor) })}
          </p>
        ) : null}
        <figcaption className="text-xs text-gray-500 dark:text-gray-400">
          {classe === 'fii' ? d.figcaptionFii : d.figcaptionAcao}
          {temSuspeito ? ` ${d.notaConferencia}` : ''}
          {temSemDado ? ` ${d.notaSemDado}` : ''}
        </figcaption>
      </figure>
      <RodapeFrescorBloco bloco="dividendos" />
    </section>
  );
}
