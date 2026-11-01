// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ApexOptions } from 'apexcharts';
import {
  ComValoresOcultos,
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
  renderComValoresOcultos,
} from '@/test/valoresOcultos';
import type { GroupedProventoData, ProventoData } from '@/hooks/useProventos';
import type { CoberturaFgcResponse } from '@/hooks/useCoberturaFgc';

/**
 * Esconder valores — Carteira › Análise (fatia 3): Rentabilidade, Proventos, Risco x Retorno e
 * Cobertura FGC (o IR está em ir/__tests__/ir.valoresOcultos.test.tsx). Fixtures com os
 * SENTINELAS: com o olho fechado nenhuma representação deles aparece (texto, title, aria-label);
 * percentuais continuam. Com o olho aberto a tela é a de hoje (os valores aparecem, sem pílula).
 */

const estado = vi.hoisted(() => ({
  belowLg: false,
  graficos: [] as ApexOptions[],
  proventos: null as unknown,
  fgc: null as unknown,
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/carteira' }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => estado.belowLg }));
vi.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('react-apexcharts', () => ({
  default: (props: { options: ApexOptions }) => {
    estado.graficos.push(props.options);
    return <div data-testid="apex" />;
  },
}));
vi.mock('next/dynamic', () => ({
  default: () => (props: { options: ApexOptions }) => {
    estado.graficos.push(props.options);
    return <div data-testid="apex" />;
  },
}));
vi.mock('@/hooks/useProventos', () => ({ useProventos: () => estado.proventos }));
vi.mock('@/hooks/useCoberturaFgc', () => ({ useCoberturaFgc: () => estado.fgc }));
vi.mock('@/components/form/date-picker', () => ({
  default: ({ label }: { label: string }) => <label>{label}</label>,
}));
vi.mock('@/icons', () => ({ ChevronLeftIcon: () => <svg /> }));
vi.mock('@/components/charts/GaugeChart', () => ({ default: () => <div data-testid="gauge" /> }));
vi.mock('@/hooks/useRiscoRetorno', () => ({
  useRiscoRetorno: () => ({
    data: {
      carteira: { retornoAnual: 12.34, retornoCDI: 10.5, volatilidade: 8.76, sharpe: 0.42 },
      anual: { 2026: { retornoAnual: 5.5, retornoCDI: 9.1, volatilidade: 7.2, sharpe: 0.3 } },
      sensibilidade: [{ ticker: 'PETR4', nome: 'Petrobras', beta: 1.12 }],
      anosDisponiveis: [2026],
    },
    loading: false,
    error: null,
  }),
}));
vi.mock('@/hooks/useSensibilidadeCarteira', () => ({
  useSensibilidadeCarteira: () => ({
    data: {
      windowMonths: 24,
      mesesUtilizados: 24,
      ativos: [
        {
          ticker: 'PETR4',
          nome: 'Petrobras',
          peso: 0.15,
          correlacao: 0.81,
          contribuicaoRisco: 0.25,
          bucket: 'alta',
          mesesUsados: 24,
        },
      ],
      excluidos: [],
    },
  }),
}));
vi.mock('@/context/CarteiraResumoContext', () => ({
  useCarteiraResumoContext: () => ({
    resumo: {
      rentabilidade: 12.5,
      historicoPatrimonio: [
        {
          data: Date.UTC(2025, 0, 2),
          saldoBruto: SENTINELAS.saldo,
          valorAplicado: SENTINELAS.aplicado,
        },
      ],
      historicoTWR: [
        { data: Date.UTC(2025, 0, 2), value: 0 },
        { data: Date.UTC(2026, 5, 30), value: 12.5 },
      ],
    },
    formatPercentage: (v: number) => `${v.toFixed(2)}%`,
  }),
}));
vi.mock('@/hooks/useIndices', () => ({ useIndices: () => ({ indices: [] }) }));
vi.mock('@/hooks/useCarteiraHistorico', () => ({ useCarteiraHistorico: () => ({ data: [] }) }));

import ProventosConsolidado from '../ProventosConsolidado';
import ProventosAgenda from '../ProventosAgenda';
import ProventosDistribuicaoChart from '../ProventosDistribuicaoChart';
import ProventosHistoricoChart from '../ProventosHistoricoChart';
import CoberturaFgc from '../CoberturaFgc';
import RiscoRetorno from '../RiscoRetorno';
import RentabilidadeResumo from '../RentabilidadeResumo';

// ── Fixtures (sentinelas) ───────────────────────────────────────────────────────────────────

const provento = (over: Partial<ProventoData> = {}): ProventoData => ({
  id: 'p1',
  data: '2026-01-15T00:00:00.000Z',
  symbol: 'PETR4',
  ativo: 'PETR4',
  tipo: 'Dividendo',
  classe: 'Ações',
  valor: SENTINELAS.saldo,
  quantidade: SENTINELAS.quantidade,
  valorUnitario: SENTINELAS.precoMedio,
  status: 'realizado',
  ...over,
});

const PROVENTOS = [
  provento(),
  provento({ id: 'p2', data: '2026-02-15T00:00:00.000Z', valor: SENTINELAS.aplicado }),
];

const GROUPED: Record<string, GroupedProventoData> = {
  PETR4: {
    total: SENTINELAS.saldo,
    count: 2,
    items: PROVENTOS,
    yoc: 7.25,
    dividendYield: 6.5,
    classe: 'Ações',
    quantidadeAtual: SENTINELAS.quantidade,
    precoMedio: SENTINELAS.precoMedio,
    ultimoProvento: SENTINELAS.aplicado,
  },
};

const janela = { sum: 0, lastDate: null, topPayer: { name: null, value: 0 } };

const dadosProventos = () => ({
  proventos: PROVENTOS,
  grouped: GROUPED,
  monthly: { '2026-01': { total: SENTINELAS.saldo, count: 1 } },
  yearly: { '2026': { total: SENTINELAS.aplicado, count: 2 } },
  total: SENTINELAS.saldo,
  media: SENTINELAS.aplicado,
  kpis: {
    totalInvestido: SENTINELAS.saldo,
    aportesUlt12m: SENTINELAS.aplicado,
    rendaAcumulada: { periodo: SENTINELAS.saldo, ult12m: SENTINELAS.aplicado, lifetime: 0 },
    mediaMensal: { periodo: SENTINELAS.aplicado, ult12m: SENTINELAS.saldo },
    yoc: { periodo: 7.25, ult12m: 6.5, lifetime: 0 },
    aReceber: {
      futuro: SENTINELAS.saldo,
      esseMes: SENTINELAS.aplicado,
      nextMonth: janela,
      next3Months: janela,
      next12Months: janela,
    },
  },
  loading: false,
  isFetching: false,
  error: null,
  refetch: () => {},
});

const ativoFgc = {
  id: 'a1',
  nome: 'CDB Banco X',
  produto: 'CDB',
  valorAtual: SENTINELAS.saldo,
  valorInvestido: SENTINELAS.aplicado,
  vencimento: '2027-01-01T00:00:00.000Z',
  coberto: true,
  isentoIR: false,
  corretoraNome: 'XP Investimentos',
  fonteInstituicao: 'emissor' as const,
  aceitaEmissor: true,
  origem: 'manual' as const,
  emissorInformadoTexto: null,
  editarEmissorHref: null,
};

const dadosFgc = (): { data: CoberturaFgcResponse; loading: boolean; error: null } => ({
  data: {
    resumo: {
      totalEfetivamenteCoberto: SENTINELAS.aplicado,
      totalNaoCoberto: SENTINELAS.saldo,
      totalExcedente: SENTINELAS.saldo,
      totalValorRendaFixa: SENTINELAS.saldo,
      percentualCoberto: 42.5,
      limiteGlobal: 1_000_000,
      limitePorInstituicao: 250_000,
      totalAtivos: 1,
      totalInstituicoes: 1,
    },
    instituicoes: [
      {
        instituicaoId: 'i1',
        instituicaoNome: 'Banco X',
        cnpj: '00000000',
        ativos: [ativoFgc as never],
        totalCoberto: SENTINELAS.aplicado,
        totalNaoCoberto: SENTINELAS.saldo,
        totalValor: SENTINELAS.saldo,
        limiteFgc: 250_000,
        percentualUtilizado: 97.5,
        excedente: SENTINELAS.saldo,
        chave: 'i1',
        corretoras: [
          { id: 'c1', nome: 'XP' },
          { id: 'c2', nome: 'BTG' },
        ],
        ativosSemEmissor: 0,
        usaCorretoraComoEmissor: false,
        titularNaoEmissor: false,
        conglomerado: 'G1',
        temOpenFinance: false,
        cnpjCalculado: false,
      },
      {
        instituicaoId: 'i2',
        instituicaoNome: 'Banco Y',
        cnpj: '11111111',
        ativos: [],
        totalCoberto: SENTINELAS.aplicado,
        totalNaoCoberto: 0,
        totalValor: SENTINELAS.aplicado,
        limiteFgc: 250_000,
        percentualUtilizado: 50,
        excedente: 0,
        chave: 'i2',
        corretoras: [],
        ativosSemEmissor: 0,
        usaCorretoraComoEmissor: false,
        titularNaoEmissor: false,
        conglomerado: 'G1',
        temOpenFinance: false,
        cnpjCalculado: false,
      },
    ],
    avisosConglomerado: [
      { conglomerado: 'G1', chaves: ['i1', 'i2'], nomes: ['Banco X', 'Banco Y'] },
    ],
    semCobertura: {
      classes: [
        {
          classe: 'acoes',
          rotulo: 'Ações',
          valor: SENTINELAS.saldo,
          quantidadeAtivos: 3,
          nota: null,
        } as never,
      ],
      total: SENTINELAS.saldo,
      totalInvestimentos: SENTINELAS.saldo * 2,
      totalSemProtecao: SENTINELAS.aplicado,
      percentualSemProtecao: 33.3,
    },
  },
  loading: false,
  error: null,
});

beforeEach(() => {
  estado.graficos = [];
  estado.proventos = dadosProventos();
  estado.fgc = dadosFgc();
});

afterEach(() => {
  estado.belowLg = false;
});

const ultimoGrafico = () => estado.graficos[estado.graficos.length - 1];

// ── Proventos ───────────────────────────────────────────────────────────────────────────────

describe('Proventos › Consolidado', () => {
  for (const belowLg of [false, true]) {
    const tela = belowLg ? 'celular' : 'computador';

    it(`${tela}: olho fechado sem R$, sem sentinela e com o YoC (%) visível`, async () => {
      estado.belowLg = belowLg;
      const { container } = renderComValoresOcultos(<ProventosConsolidado />);
      await screen.findAllByTestId('apex');
      expectSemValoresExpostos(container);
      expectPilulas(container);
      expect(container.textContent).toContain('7.25%');
      expect(container.textContent).toContain('100.00%');
      // Distribuição em tabela: quantidade, preço médio, último provento e total.
      fireEvent.click(screen.getByRole('button', { name: 'Tabela' }));
      expectSemValoresExpostos(container);
      expect(container.textContent).toContain('6.50%');
    });
  }

  it('olho aberto: a tela de hoje (valores visíveis, nenhuma pílula)', async () => {
    const { container } = renderComValoresOcultos(<ProventosConsolidado />, { ocultos: false });
    await screen.findAllByTestId('apex');
    expectPilulas(container, 0);
    expect(container.textContent).toContain('9.876.543,21');
    fireEvent.click(screen.getByRole('button', { name: 'Tabela' }));
    expect(container.textContent).toContain('7.777');
    expect(container.textContent).toContain('66,66');
  });
});

describe('Proventos › Agenda', () => {
  for (const belowLg of [false, true]) {
    it(`${belowLg ? 'celular' : 'computador'}: total do mês e valores viram pílula`, () => {
      estado.belowLg = belowLg;
      const { container } = renderComValoresOcultos(<ProventosAgenda />);
      expectSemValoresExpostos(container);
      expectPilulas(container);
      expect(screen.getAllByText(/Realizado/).length).toBeGreaterThan(0);
    });
  }
});

describe('Proventos › gráfico de histórico', () => {
  const w = {
    globals: {
      seriesNames: ['PETR4'],
      colors: ['#0079F2'],
      seriesX: [[Date.UTC(2026, 0, 1)]],
    },
  };
  type Custom = (a: { series: number[][]; dataPointIndex: number; w: typeof w }) => string;

  it('olho fechado: tooltip.custom sem o R$ (pílula no lugar) e com o %', async () => {
    render(
      <ComValoresOcultos>
        <ProventosHistoricoChart proventos={PROVENTOS} />
      </ComValoresOcultos>,
    );
    await waitFor(() => expect(estado.graficos.length).toBeGreaterThan(0));
    const opcoes = ultimoGrafico();
    const html = (opcoes.tooltip!.custom as Custom)({
      series: [[9876.54]],
      dataPointIndex: 0,
      w,
    });
    expect(html).not.toContain('9.876,54');
    expect(html).toContain('mf-pilula-grafico');
    expect(html).toContain('100,00%');
    // Eixo Y em R$ sem rótulo, com a largura reservada.
    const yaxis = opcoes.yaxis as ApexYAxis;
    expect((yaxis.labels!.formatter as (v: number) => string)(SENTINELAS.saldo)).toBe('');
    expect(yaxis.labels!.minWidth).toBeGreaterThan(0);
  });

  it('celular: aria-label do gráfico sem o total em R$', async () => {
    estado.belowLg = true;
    const { container } = render(
      <ComValoresOcultos>
        <ProventosHistoricoChart proventos={PROVENTOS} />
      </ComValoresOcultos>,
    );
    await waitFor(() => expect(estado.graficos.length).toBeGreaterThan(0));
    const img = container.querySelector('[role="img"]')!;
    expect(img.getAttribute('aria-label')).toContain('R$ •••••');
    expectSemValoresExpostos(container);
  });

  it('olho aberto: tooltip e eixo de hoje', async () => {
    estado.belowLg = true;
    const { container } = render(
      <ComValoresOcultos ocultos={false}>
        <ProventosHistoricoChart proventos={PROVENTOS} />
      </ComValoresOcultos>,
    );
    await waitFor(() => expect(estado.graficos.length).toBeGreaterThan(0));
    const opcoes = ultimoGrafico();
    const html = (opcoes.tooltip!.custom as Custom)({ series: [[9876.54]], dataPointIndex: 0, w });
    expect(html).toContain('R$ 9.876,54');
    expect(container.querySelector('[role="img"]')!.getAttribute('aria-label')).toMatch(
      /total de R\$\s18\.641\.975,31 em/,
    );
  });
});

describe('Proventos › gráfico de distribuição (rosca)', () => {
  it('olho fechado: tooltip, valor e total da rosca mascarados; yield (%) intacto', async () => {
    render(
      <ComValoresOcultos>
        <ProventosDistribuicaoChart grouped={GROUPED} viewMode="total" />
      </ComValoresOcultos>,
    );
    await waitFor(() => expect(estado.graficos.length).toBeGreaterThan(0));
    const opcoes = ultimoGrafico();
    const tooltip = (opcoes.tooltip!.y as { formatter: (v: number) => string }).formatter(
      SENTINELAS.saldo,
    );
    expect(tooltip).toContain('mf-pilula-grafico');
    expect(tooltip).not.toContain('9.876');
    const labels = opcoes.plotOptions!.pie!.donut!.labels!;
    expect((labels.value!.formatter as (v: string) => string)(String(SENTINELAS.saldo))).toBe(
      'R$ •••••',
    );
    expect((labels.total!.formatter as (w: unknown) => string)({})).toBe('R$ •••••');
    expect((opcoes.dataLabels!.formatter as (v: number) => string)(42)).toBe('42.00%');
  });

  it('modo yield: só %, nada some', async () => {
    render(
      <ComValoresOcultos>
        <ProventosDistribuicaoChart grouped={GROUPED} viewMode="yield" />
      </ComValoresOcultos>,
    );
    await waitFor(() => expect(estado.graficos.length).toBeGreaterThan(0));
    const labels = ultimoGrafico().plotOptions!.pie!.donut!.labels!;
    expect((labels.total!.formatter as (w: unknown) => string)({})).toBe('7.25%');
  });
});

// ── Cobertura FGC ───────────────────────────────────────────────────────────────────────────

describe('Cobertura FGC', () => {
  for (const belowLg of [false, true]) {
    it(`${belowLg ? 'celular' : 'computador'}: valores por emissor em pílula; % e limites públicos visíveis`, () => {
      estado.belowLg = belowLg;
      const { container } = renderComValoresOcultos(<CoberturaFgc />);
      // Abre o grupo do Banco X (títulos com investido e atual).
      fireEvent.click(screen.getByRole('button', { name: /Banco X/ }));
      expectSemValoresExpostos(container);
      expectPilulas(container);
      expect(container.textContent).toContain('42.5%');
      expect(container.textContent).toContain('97.5%');
      expect(container.textContent).toContain('33.3%');
      // Regra pública do FGC (não é dinheiro do usuário): continua legível.
      expect(container.textContent).toContain('R$ 250 mil');
      expect(container.textContent).toMatch(/R\$\s1\.000\.000,00/);
    });
  }

  it('olho aberto: valores de hoje, nenhuma pílula', () => {
    const { container } = renderComValoresOcultos(<CoberturaFgc />, { ocultos: false });
    fireEvent.click(screen.getByRole('button', { name: /Banco X/ }));
    expectPilulas(container, 0);
    expect(container.textContent).toContain('9.876.543,21');
    expect(container.textContent).toContain('8.765.432,10');
  });
});

// ── Risco x Retorno e Rentabilidade: só %, nada muda ────────────────────────────────────────

describe('Risco x Retorno e Rentabilidade (só %)', () => {
  it('Risco x Retorno: nenhuma pílula, % e correlações visíveis', () => {
    const { container } = renderComValoresOcultos(<RiscoRetorno />);
    expectSemValoresExpostos(container);
    expectPilulas(container, 0);
    expect(container.textContent).toContain('12.34%');
    expect(container.textContent).toContain('0,81');
  });

  it('Resumo de Rentabilidade: nenhuma pílula, % visíveis', () => {
    const { container } = renderComValoresOcultos(<RentabilidadeResumo />);
    expectSemValoresExpostos(container);
    expectPilulas(container, 0);
    expect(container.textContent).toContain('% TOTAL');
    expect(container.textContent).toMatch(/\d+\.\d{2}%/);
  });
});
