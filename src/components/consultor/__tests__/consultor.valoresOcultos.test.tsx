// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ApexOptions } from 'apexcharts';

/**
 * Esconder valores — painel do consultor (fatia 4). Cartões, Top 5 e Aportes & Resgates com
 * valores-sentinela: com o olho fechado nenhum R$ aparece; contagens, nomes e % ficam. Os três
 * gráficos: as opções que chegam ao Apex (capturadas no mock) não devolvem dígito de dinheiro.
 */

// Objetos estáveis (como no app): o efeito da página depende de `params` e `user`.
const estaveis = vi.hoisted(() => ({
  params: { clientId: 'c1' },
  router: { replace: () => {}, push: () => {}, back: () => {} },
  auth: { user: { role: 'consultant' }, isLoading: false },
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/consultor/c1',
  useParams: () => estaveis.params,
  useRouter: () => estaveis.router,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => estaveis.auth }));
vi.mock('@/components/auth/ProtectedRoute', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('next/image', () => ({
  default: (props: { alt: string }) => <span data-alt={props.alt} />,
}));

const apex = vi.hoisted(() => ({ ultimas: [] as ApexOptions[] }));
vi.mock('next/dynamic', () => ({
  default: () =>
    function ApexFalso({ options }: { options: ApexOptions }) {
      apex.ultimas.push(options);
      return <div data-testid="apex" />;
    },
}));
vi.mock('@/components/charts/ApexChartWrapper', async () => {
  const { useOpcoesGraficoSensiveis } =
    await import('@/components/charts/useOpcoesGraficoSensiveis');
  return {
    default: function WrapperFalso({ options }: { options: ApexOptions }) {
      apex.ultimas.push(useOpcoesGraficoSensiveis(options));
      return <div data-testid="apex" />;
    },
  };
});

import DashboardMetricCard from '../DashboardMetricCard';
import TopClientsCard from '../TopClientsCard';
import AportesResgatesTable from '../AportesResgatesTable';
import AssetDistributionChart from '../AssetDistributionChart';
import PatrimonioEvolucaoChart from '../PatrimonioEvolucaoChart';
import ConsultantPerformanceChart from '@/components/consultant/ConsultantPerformanceChart';
import ClientePage from '@/app/(admin)/(home)/consultor/[clientId]/page';
import {
  ComValoresOcultos,
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
  renderComValoresOcultos,
} from '@/test/valoresOcultos';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format;
const pct = (v: number) => `${v.toFixed(2)}%`;

afterEach(() => {
  cleanup();
  apex.ultimas = [];
});

const Painel = () => (
  <>
    <DashboardMetricCard title="Total de clientes" value={7} formatter={(v) => String(v)} />
    <DashboardMetricCard title="Patrimônio" value={SENTINELAS.saldo} formatter={brl} />
    <DashboardMetricCard title="Rentabilidade média" value={12.5} formatter={pct} />
    <TopClientsCard
      title="Top 5 - Maior Patrimônio"
      clients={[
        {
          clientId: 'c1',
          name: 'Cliente Sentinela',
          email: 'c1@x.com',
          metric: SENTINELAS.aplicado,
          metricLabel: 'Patrimônio',
          metricFormatter: brl,
          metricValor: 'sensivel',
        },
        {
          clientId: 'c2',
          name: 'Cliente Rentável',
          email: 'c2@x.com',
          metric: 33.33,
          metricLabel: 'Rentabilidade',
          metricFormatter: pct,
        },
      ]}
    />
    <AportesResgatesTable
      currencyFormatter={brl}
      data={[
        {
          clientId: 'c1',
          name: 'Cliente Sentinela',
          email: 'c1@x.com',
          totalAportes: SENTINELAS.aplicado,
          totalResgates: SENTINELAS.saldo,
          tendencia: 'positive',
        },
      ]}
    />
  </>
);

describe('painel do consultor com o olho fechado', () => {
  it('cartões, Top 5 e Aportes & Resgates: sem R$; contagens, nomes e % ficam', () => {
    const { container } = renderComValoresOcultos(<Painel />);
    expectSemValoresExpostos(container);
    expectPilulas(container, 4);
    expect(container).toHaveTextContent('7');
    expect(container).toHaveTextContent('12.50%');
    expect(container).toHaveTextContent('33.33%');
    expect(container).toHaveTextContent('Cliente Sentinela');
    expect(container).toHaveTextContent('Positivo');
  });

  it('olho aberto: HTML idêntico ao de hoje (sem provider)', () => {
    const hoje = render(<Painel />).container.innerHTML;
    cleanup();
    const aberto = render(
      <ComValoresOcultos ocultos={false}>
        <Painel />
      </ComValoresOcultos>,
    ).container;
    expect(aberto.innerHTML).toBe(hoje);
    expect(aberto).toHaveTextContent('9.876.543,21');
  });
});

/** Chama todos os formatters das opções (inclusive responsive[]) e devolve as saídas. */
function saidasDosFormatters(options: unknown, valor: number): string[] {
  const saidas: string[] = [];
  const visitar = (no: unknown, chave = '') => {
    if (typeof no === 'function' && (chave === 'formatter' || chave === 'custom')) {
      try {
        const ctx = { seriesIndex: 0, dataPointIndex: 0, series: [[valor]], w: { globals: {} } };
        const out = chave === 'custom' ? no(ctx) : no(valor, ctx);
        if (out !== undefined && out !== null) saidas.push(String(out));
      } catch {
        // formatter que exige contexto real do Apex: fora da conta
      }
      return;
    }
    if (Array.isArray(no)) no.forEach((item) => visitar(item));
    else if (no && typeof no === 'object') {
      Object.entries(no as Record<string, unknown>).forEach(([k, v]) => visitar(v, k));
    }
  };
  visitar(options);
  return saidas;
}

const SEM_VALOR = (s: string) =>
  !/R\$\s?-?\d/.test(s) && !s.includes('9.876.543') && !/9876K|9,9 ?M|9\.9M/.test(s);

describe('gráficos do consultor com o olho fechado', () => {
  const casos: Array<[string, () => React.ReactElement]> = [
    [
      'PatrimonioEvolucaoChart',
      () => (
        <PatrimonioEvolucaoChart
          currencyFormatter={brl}
          data={[
            { month: '2026-08-01', totalPatrimony: SENTINELAS.aplicado },
            { month: '2026-09-01', totalPatrimony: SENTINELAS.saldo },
          ]}
        />
      ),
    ],
    [
      'AssetDistributionChart',
      () => (
        <AssetDistributionChart
          currencyFormatter={brl}
          data={[{ class: 'Ações', value: SENTINELAS.saldo, percentage: 100 }]}
        />
      ),
    ],
    [
      'ConsultantPerformanceChart',
      () => <ConsultantPerformanceChart data={[{ label: 'Set', value: SENTINELAS.saldo }]} />,
    ],
  ];

  it.each(casos)('%s: formatters sem dígitos de dinheiro', (_nome, ui) => {
    renderComValoresOcultos(ui());
    const opcoes = apex.ultimas.at(-1);
    expect(opcoes).toBeDefined();
    const saidas = saidasDosFormatters(opcoes, SENTINELAS.saldo);
    expect(saidas.length).toBeGreaterThan(0);
    expect(saidas.filter((s) => !SEM_VALOR(s))).toEqual([]);
  });

  it.each(casos)('%s: olho aberto mostra os valores (mesmas opções de hoje)', (_nome, ui) => {
    render(<ComValoresOcultos ocultos={false}>{ui()}</ComValoresOcultos>);
    const saidas = saidasDosFormatters(apex.ultimas.at(-1), SENTINELAS.saldo);
    expect(saidas.some((s) => !SEM_VALOR(s))).toBe(true);
  });
});

describe('cliente do consultor (/consultor/[clientId]) com o olho fechado', () => {
  const detalhe = {
    clientId: 'c1',
    client: { name: 'Cliente Sentinela', email: 'c1@x.com' },
    summary: {
      currentBalance: SENTINELAS.saldo,
      investmentsTotal: SENTINELAS.aplicado,
      monthlyReturnPercentage: 1.5,
      totalAssets: 1,
    },
    balances: {
      total: { income: 10000, expenses: 4000, investments: 0, net: SENTINELAS.saldo },
      monthly: { income: 10000, expenses: 4000, investments: 0, net: 6000 },
    },
    portfolio: {
      currentValue: SENTINELAS.saldo,
      totalInvested: SENTINELAS.aplicado,
      assets: [
        {
          id: 'a1',
          symbol: 'SENT3',
          name: 'Sentinela',
          type: 'stock',
          quantity: SENTINELAS.quantidade,
          avgPrice: SENTINELAS.precoMedio,
          totalInvested: SENTINELAS.aplicado,
          currentPrice: 12.34,
          currentValue: SENTINELAS.saldo,
          profit: 1,
          profitPercentage: 1,
        },
      ],
    },
    monthlyNetHistory: [{ month: '2026-09-01', net: 1234.56, cumulative: 1234.56 }],
    recentCashflows: [
      {
        id: 'm1',
        type: 'receita',
        description: 'Salário',
        value: 8765.43,
        date: '2026-10-05T12:00:00.000Z',
        paid: true,
      },
    ],
  };

  afterEach(() => vi.unstubAllGlobals());

  it('cartões, movimentações, resumo por tipo e gráfico sem R$; % ficam', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => detalhe }),
    );
    const { container } = renderComValoresOcultos(<ClientePage />);
    await screen.findByText('Salário');
    expectSemValoresExpostos(container, {
      sentinelas: [...Object.values(SENTINELAS), 8765.43],
    });
    expectPilulas(container);
    expect(container).toHaveTextContent('100,00%');
    expect(container).toHaveTextContent('60,00%');
    const saidas = saidasDosFormatters(apex.ultimas.at(-1), SENTINELAS.saldo);
    expect(saidas.length).toBeGreaterThan(0);
    expect(saidas.filter((s) => !SEM_VALOR(s))).toEqual([]);
  });
});
