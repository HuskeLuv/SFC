// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderHook, waitFor } from '@testing-library/react';
import type { ApexOptions } from 'apexcharts';

/**
 * Esconder valores — gráficos da Carteira (fatia 2). Captura as opções que chegam ao Chart (o
 * react-apexcharts e o next/dynamic estão mockados) e confere: eixo Y sem rótulo com a largura
 * reservada, tooltip com pílula, total da rosca mascarado, % visíveis e, com o olho aberto, as
 * opções de hoje (mesma referência).
 */

const ambiente = vi.hoisted(() => ({ isBelowLg: false }));
vi.mock('next/navigation', () => ({ usePathname: () => '/carteira' }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => ambiente.isBelowLg }));
vi.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));

const capturado = vi.hoisted(() => ({ options: null as ApexOptions | null }));
vi.mock('react-apexcharts', () => ({
  default: (props: { options: ApexOptions }) => {
    capturado.options = props.options;
    return <div data-testid="chart" />;
  },
}));
vi.mock('next/dynamic', async () => {
  const mod = await import('react-apexcharts');
  return { default: () => mod.default };
});

import ApexChartWrapper from '../ApexChartWrapper';
import LineChartCarteiraHistorico from '../line/LineChartCarteiraHistorico';
import PieChartCarteiraInvestimentos from '../pie/PieChartCarteiraInvestimentos';
import PieChartStocksAtivo from '../pie/PieChartStocksAtivo';
import PieChartFiiSegmento from '../pie/PieChartFiiSegmento';
import { usePizzaSensivel } from '../pie/usePizzaSensivel';
import { ComValoresOcultos, SENTINELAS, representacoesDoSentinela } from '@/test/valoresOcultos';
import { formatBRL } from '@/utils/format';

type Fn = (...args: unknown[]) => string;

const historico = [
  { data: Date.UTC(2025, 0, 1), valorAplicado: SENTINELAS.aplicado, saldoBruto: SENTINELAS.saldo },
  { data: Date.UTC(2025, 6, 1), valorAplicado: SENTINELAS.aplicado, saldoBruto: SENTINELAS.saldo },
  { data: Date.UTC(2026, 0, 1), valorAplicado: SENTINELAS.aplicado, saldoBruto: SENTINELAS.saldo },
];

const zero = { valor: 0, percentual: 0 };
const distribuicao = {
  reservaEmergencia: { valor: SENTINELAS.aplicado, percentual: 47 },
  reservaOportunidade: zero,
  rendaFixaFundos: { valor: SENTINELAS.saldo, percentual: 53 },
  fimFia: zero,
  fiis: zero,
  acoes: zero,
  stocks: zero,
  reits: zero,
  etfs: zero,
  moedasCriptos: zero,
  previdenciaSeguros: zero,
  opcoes: zero,
};

async function opcoesDoChart(ui: React.ReactElement, ocultos: boolean): Promise<ApexOptions> {
  capturado.options = null;
  render(<ComValoresOcultos ocultos={ocultos}>{ui}</ComValoresOcultos>);
  await waitFor(() => expect(capturado.options).not.toBeNull());
  return capturado.options!;
}

const eixoY = (o: ApexOptions) => (Array.isArray(o.yaxis) ? o.yaxis[0] : o.yaxis)!;
const tooltipY = (o: ApexOptions) => (o.tooltip!.y as { formatter: Fn }).formatter;
const donut = (o: ApexOptions) => o.plotOptions!.pie!.donut!.labels!;

/** Nenhuma forma do sentinela (nem dígito solto) na saída. */
const semSentinela = (saida: string) =>
  [SENTINELAS.saldo, SENTINELAS.aplicado].flatMap(representacoesDoSentinela).forEach((forma) => {
    expect(saida).not.toContain(forma);
  });

// O BroadcastChannel do Node atravessa os workers do vitest: o clique no olho em outro arquivo de
// teste mudaria o estado do provider aqui. Sem canal, cada teste fica com o estado que pediu.
vi.stubGlobal('BroadcastChannel', undefined);

/**
 * O jsdom não mede texto: um canvas falso com 7px por caractere. O eixo Y escondido reserva a
 * largura do rótulo mais largo de hoje — "R$ 10000K" (topo redondo de 9.876.543) = 9 × 7 = 63px.
 */
const LARGURA_EIXO_MEDIDA = 63;

beforeEach(() => {
  ambiente.isBelowLg = false;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        font: '',
        measureText: (t: string) => ({ width: t.length * 7 }),
      }) as unknown as CanvasRenderingContext2D,
  );
});

describe('LineChartCarteiraHistorico (Histórico de patrimônio)', () => {
  it('(a) desktop, olho fechado: eixo Y sem rótulo com a largura de hoje e tooltip com pílula', async () => {
    const o = await opcoesDoChart(<LineChartCarteiraHistorico data={historico} />, true);
    const labels = eixoY(o).labels!;
    expect((labels.formatter as Fn)(2000000)).toBe('');
    expect((labels.formatter as Fn)(SENTINELAS.saldo)).toBe('');
    expect(labels.minWidth).toBe(LARGURA_EIXO_MEDIDA);
    const tip = tooltipY(o)(1234.5);
    expect(tip).toContain('mf-pilula-grafico');
    expect(tip).not.toMatch(/\d/);
    semSentinela(tooltipY(o)(SENTINELAS.saldo));
    // O mês do tooltip e o eixo X continuam; yAxisMin (cálculo) fica intacto.
    expect((o.tooltip!.x as { formatter: Fn }).formatter(Date.UTC(2026, 0, 1))).toBe(
      'Janeiro 2026',
    );
    expect((o.xaxis!.labels!.formatter as Fn)(Date.UTC(2026, 0, 1))).toBe('Jan 2026');
    expect(eixoY(o).min).toBeGreaterThan(0);
    expect(o.legend!.show).toBe(true);
  });

  it('(b) celular, olho fechado: as opções do celular também saem mascaradas', async () => {
    ambiente.isBelowLg = true;
    const o = await opcoesDoChart(<LineChartCarteiraHistorico data={historico} />, true);
    expect(o.chart!.height).toBe(180);
    expect((eixoY(o).labels!.formatter as Fn)(2000000)).toBe('');
    expect(eixoY(o).labels!.minWidth).toBe(LARGURA_EIXO_MEDIDA);
    expect(tooltipY(o)(1234.5)).not.toMatch(/\d/);
  });

  it('(d) olho aberto: eixo e tooltip de hoje, sem largura reservada', async () => {
    const o = await opcoesDoChart(<LineChartCarteiraHistorico data={historico} />, false);
    expect((eixoY(o).labels!.formatter as Fn)(2000000)).toBe('R$ 2000K');
    expect(eixoY(o).labels!.minWidth).toBeUndefined();
    expect(tooltipY(o)(1234.5)).toBe('R$ 1.234,50');
  });
});

describe('ApexChartWrapper (mobileOptions)', () => {
  it('(b) formatter em R$ que vem só nas mobileOptions sai mascarado', async () => {
    ambiente.isBelowLg = true;
    const mobile: ApexOptions = { yaxis: { labels: { formatter: (v: number) => formatBRL(v) } } };
    const o = await opcoesDoChart(
      <ApexChartWrapper
        options={{ chart: { type: 'bar' } }}
        series={[]}
        type="bar"
        mobileOptions={mobile}
      />,
      true,
    );
    expect((eixoY(o).labels!.formatter as Fn)(SENTINELAS.saldo)).toBe('');
  });
});

describe('pizzas da Carteira', () => {
  it('(c) Tipos de investimento: total do centro mascarado; % das fatias ficam', async () => {
    const o = await opcoesDoChart(
      <PieChartCarteiraInvestimentos distribuicao={distribuicao} />,
      true,
    );
    const total = (donut(o).total!.formatter as Fn)();
    expect(total).toContain('•••••');
    expect(total).not.toMatch(/\d/);
    expect((donut(o).value!.formatter as Fn)('53')).toBe('53.00%');
    expect(tooltipY(o)(53)).toBe('53.00%');
  });

  it('(c) Tipos de investimento no celular: total mascarado com as mobileOptions', async () => {
    ambiente.isBelowLg = true;
    const o = await opcoesDoChart(
      <PieChartCarteiraInvestimentos distribuicao={distribuicao} />,
      true,
    );
    expect((donut(o).total!.formatter as Fn)()).not.toMatch(/\d/);
    expect(o.legend!.show).toBe(false);
  });

  it('(c) Stocks (série em valor): centro "•••••" e tooltip "$" vira pílula', async () => {
    const data = [
      { ticker: 'AAPL', valor: SENTINELAS.saldo, percentual: 60, cor: '#314666' },
      { ticker: 'MSFT', valor: SENTINELAS.aplicado, percentual: 40, cor: '#6E9DC4' },
    ] as unknown as React.ComponentProps<typeof PieChartStocksAtivo>['data'];
    const o = await opcoesDoChart(<PieChartStocksAtivo data={data} />, true);
    expect((donut(o).total!.formatter as Fn)({ globals: { seriesTotals: [1, 2] } })).toBe('•••••');
    expect((donut(o).value!.formatter as Fn)(String(SENTINELAS.saldo))).toBe('•••••');
    const tip = tooltipY(o)(SENTINELAS.saldo);
    expect(tip).toContain('mf-pilula-grafico');
    expect(tip).not.toMatch(/\d/);
  });

  it('(c) FII por segmento: centro "R$ •••••", tooltip com pílula', async () => {
    const data = [
      { segmento: 'Logística', valor: SENTINELAS.saldo, percentual: 100, cor: '#314666' },
    ] as unknown as React.ComponentProps<typeof PieChartFiiSegmento>['data'];
    const o = await opcoesDoChart(<PieChartFiiSegmento data={data} />, true);
    const total = (donut(o).total!.formatter as Fn)({
      globals: { seriesTotals: [SENTINELAS.saldo] },
    });
    expect(total).toBe('R$ •••••');
    expect(tooltipY(o)(SENTINELAS.saldo)).not.toMatch(/\d/);
  });

  it('(d) olho aberto: Stocks com as opções de hoje (sem formatter de total)', async () => {
    const data = [
      { ticker: 'AAPL', valor: 10, percentual: 100, cor: '#314666' },
    ] as unknown as React.ComponentProps<typeof PieChartStocksAtivo>['data'];
    const o = await opcoesDoChart(<PieChartStocksAtivo data={data} />, false);
    expect(donut(o).total!.formatter).toBeUndefined();
    expect(tooltipY(o)(1234.5)).toBe('$1,234.50');
  });

  it('(d) usePizzaSensivel: olho aberto devolve a MESMA referência', () => {
    const options: ApexOptions = { chart: { type: 'donut' } };
    const { result } = renderHook(() => usePizzaSensivel(options, { serieEmValor: true }), {
      wrapper: ({ children }) => <ComValoresOcultos ocultos={false}>{children}</ComValoresOcultos>,
    });
    expect(result.current).toBe(options);
  });
});
