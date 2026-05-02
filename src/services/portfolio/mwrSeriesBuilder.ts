/**
 * Constrói uma série temporal de MWR cumulativo a partir do histórico de
 * patrimônio + fluxos de caixa. Cada ponto da série é o MWR (período, em %)
 * desde o `startDate` da janela até aquele dia.
 *
 * Mantém paralelo com `historicoTWR` — mesmo formato `{data, value}` em
 * percentual, primeiro ponto = 0%, valor cresce/diminui conforme aportes e
 * variação de mercado. Diferente do TWR, MWR pondera por quanto tempo cada
 * real ficou exposto, então aportes recentes em janelas de alta puxam o
 * número pra baixo (e vice-versa).
 *
 * Período (não anualizado) é a métrica natural pra este gráfico:
 * - Em janelas curtas, o MWR anualizado oscila demais.
 * - Coincide visualmente com a escala do TWR cumulativo.
 *
 * Performance: para 900 dias × ~50 cashflows × ~20 iterações de Newton, fica
 * < 100ms. Newton-Raphson aquece rápido com guess do dia anterior, mas o
 * ganho de manter estado entre iterações é marginal — implementamos o
 * caminho simples (recomputa do zero por dia).
 */

import { computeMwr, type CashFlow } from './mwrCalculator';

export interface MwrSeriesPoint {
  data: number;
  value: number;
}

export interface BuildMwrSeriesParams {
  /** Série de patrimônio com `data`, `valorAplicado`, `saldoBruto` (do builder ou snapshot). */
  historicoPatrimonio: Array<{ data: number; valorAplicado: number; saldoBruto: number }>;
  /**
   * Fluxos de caixa por dia (opcional). Se não fornecido, derivado das
   * diferenças de `valorAplicado` entre pontos consecutivos.
   * Convenção: amount > 0 = aporte na carteira, amount < 0 = resgate.
   */
  cashFlowsByDay?: Map<number, number>;
  /**
   * Data de início da janela (timestamp ms). Pontos antes deste timestamp são
   * filtrados. Se omitido, usa o primeiro ponto do histórico.
   */
  startMs?: number;
}

/**
 * Deriva fluxos de caixa diários a partir das diferenças de `valorAplicado`.
 * Usado quando o cashFlowsByDay não está disponível (caminho do snapshot).
 *
 * Convenção: aporte = valorAplicado sobe; resgate = valorAplicado cai.
 */
const deriveCashFlowsFromValorAplicado = (
  historico: Array<{ data: number; valorAplicado: number }>,
): Map<number, number> => {
  const flows = new Map<number, number>();
  let prev = 0;
  for (const point of historico) {
    const delta = point.valorAplicado - prev;
    if (Math.abs(delta) > 0.005) {
      flows.set(point.data, delta);
    }
    prev = point.valorAplicado;
  }
  return flows;
};

export const buildMwrSeries = ({
  historicoPatrimonio,
  cashFlowsByDay,
  startMs,
}: BuildMwrSeriesParams): MwrSeriesPoint[] => {
  if (historicoPatrimonio.length === 0) return [];

  const effectiveStart = startMs ?? historicoPatrimonio[0].data;
  const filtered = historicoPatrimonio.filter((p) => p.data >= effectiveStart);
  if (filtered.length === 0) return [];

  const flowsMap = cashFlowsByDay ?? deriveCashFlowsFromValorAplicado(historicoPatrimonio);
  const allFlows: CashFlow[] = Array.from(flowsMap.entries()).map(([date, amount]) => ({
    date,
    amount,
  }));

  const startPoint = filtered[0];
  const flowOnStart = flowsMap.get(startPoint.data) ?? 0;
  const initialSaldoEnd = startPoint.saldoBruto;
  // Saldo PRÉ-janela: subtrai aportes do dia 0 do saldo end-of-day pra evitar
  // dupla contagem (mesma lógica do route rentabilidade-janelas).
  const initialSaldoPre = Math.max(0, initialSaldoEnd - Math.max(0, flowOnStart));

  const series: MwrSeriesPoint[] = [];
  for (const point of filtered) {
    if (point.data === effectiveStart) {
      series.push({ data: point.data, value: 0 });
      continue;
    }
    const result = computeMwr({
      initialValue: initialSaldoPre,
      initialDate: effectiveStart,
      terminalValue: point.saldoBruto,
      terminalDate: point.data,
      cashFlows: allFlows,
    });
    // Converte fração → percentual pra alinhar com escala do historicoTWR.
    series.push({ data: point.data, value: result.mwrPeriod * 100 });
  }
  return series;
};
