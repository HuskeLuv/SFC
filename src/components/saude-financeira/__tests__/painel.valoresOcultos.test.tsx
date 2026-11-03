// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApexOptions } from 'apexcharts';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import {
  ComValoresOcultos,
  expectPilulas,
  expectSemValoresExpostos,
  representacoesDoSentinela,
} from '@/test/valoresOcultos';
import type { SaudeFinanceiraResponse } from '@/hooks/useSaudeFinanceira';
import type { SeguroDTO } from '@/hooks/useSeguros';

/**
 * Esconder valores (Fase 4, fatia 2): Saúde Financeira — painel e risco. Fixtures com sentinelas
 * em R$ (renda, gasto, poupança, metas patrimoniais, PL, custo e capital dos seguros). Com o olho
 * fechado nenhum R$ nem sentinela aparece no texto nem em title/aria-label; índices, %, meses,
 * status, idades, datas e os Dados Econômicos (mercado) continuam. Formulários: valor do campo
 * fica (decisão 3). Olho aberto: DOM de hoje.
 */

const ambiente = vi.hoisted(() => ({ isBelowLg: false }));
vi.mock('next/navigation', () => ({ usePathname: () => '/saude-financeira' }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => ambiente.isBelowLg }));
vi.mock('@/icons', () => ({ ChevronDownIcon: () => <svg /> }));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: vi.fn() }) }));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { name: 'Cliente Demo' }, actingClient: null }),
}));

// Valores-sentinela (pt-BR na tela com centavos; improváveis).
const S = {
  renda: 12345.67,
  gasto: 7654.32,
  poupanca: 4691.35,
  reserva: 15432.19,
  alta: 27408.49,
  pl: 263319.36,
  ideal: 345678.91,
  independencia: 1876543.21,
  custoVida: 2345.61,
  capitalVida: 765432.19,
  custoAuto: 3456.72,
} as const;
const SENTINELAS_PAINEL = Object.values(S);

const saude = {
  asOf: '2026-10-15T12:00:00.000Z',
  indicadores: {
    economia: {
      cdiAA: 0.1415,
      rentabilidadeAA: 0.1287,
      rentabilidadeFonte: 'carteira',
      inflacaoAA: 0.0468,
      ganhoRealAA: 0.0782,
    },
    fluxo: {
      rendaMensal: S.renda,
      gastoMensal: S.gasto,
      poupancaMensal: S.poupanca,
      taxaPoupanca: S.poupanca / S.renda,
    },
    benchmarks: {
      reservaEmergencia: { necessario: S.gasto * 3, atual: S.reserva, atingido: 0.672 },
      patrimonioSeguranca: { necessario: S.gasto * 12, atual: S.alta, atingido: 0.298 },
      patrimonioIdeal: { necessario: S.ideal, atual: S.pl, atingido: S.pl / S.ideal },
      independencia: { necessario: S.independencia, atual: S.pl, atingido: 0.14 },
    },
    balanco: {
      ativosAltaLiquidez: S.alta,
      ativosBaixaLiquidez: 0,
      ativosTotal: S.alta,
      passivosCurtoPrazo: 0,
      passivosLongoPrazo: 0,
      passivosTotal: 0,
      patrimonioLiquido: S.pl,
    },
    metricas: {
      mesesCobertura: 3.58,
      endividamentoCurtoPrazo: 0.23,
      passivoSobreAtivo: 0.47,
      grauIndependencia: 0.14,
    },
    status: { codigo: 'EQ', motivos: ['Reserva de emergência acima do necessário'] },
  },
  fontes: {
    cashflow: { year: 2026, activeMonths: 10 },
    inflacao: 'ipca-12m',
    idade: 38,
    idadeAlvo: 60,
  },
  config: { multReserva: 3, multSeguranca: 12, fatorIdeal: 0.1, coberturaMinimaMeses: 6 },
  composicao: { altaLiquidez: [], baixaLiquidez: [], passivos: [] },
  tendencias: {
    rendaMensal: 'up',
    gastoMensal: 'down',
    poupancaMensal: 'up',
    taxaPoupanca: 'flat',
    ativosAltaLiquidez: 'up',
    passivosTotal: 'down',
    patrimonioLiquido: 'up',
    mesesCobertura: 'up',
    grauIndependencia: 'flat',
  },
} as unknown as SaudeFinanceiraResponse;

const seguros: SeguroDTO[] = [
  {
    id: 's1',
    nome: 'Seguro de vida',
    tipo: 'vida',
    cobertura: 'total',
    risco: 'alto',
    custoAnual: S.custoVida,
    capitalSegurado: S.capitalVida,
    notes: null,
    createdAt: saude.asOf,
    updatedAt: saude.asOf,
  },
  {
    id: 's2',
    nome: 'Seguro do carro',
    tipo: 'auto',
    cobertura: 'parcial',
    risco: 'medio',
    custoAnual: S.custoAuto,
    capitalSegurado: null,
    notes: null,
    createdAt: saude.asOf,
    updatedAt: saude.asOf,
  },
];

vi.mock('@/hooks/useSaudeFinanceira', async (orig) => {
  const real = await orig<typeof import('@/hooks/useSaudeFinanceira')>();
  return {
    ...real,
    useSaudeFinanceira: () => ({ data: saude, loading: false, error: null }),
    useSaudeFinanceiraEvolucao: () => ({ snapshots: [], loading: false, error: null }),
    useUpdateSaudeConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});
vi.mock('@/hooks/useSeguros', async (orig) => {
  const real = await orig<typeof import('@/hooks/useSeguros')>();
  const mutacao = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    ...real,
    useSeguros: () => ({ seguros, loading: false, error: null }),
    useCreateSeguro: mutacao,
    useUpdateSeguro: mutacao,
    useDeleteSeguro: mutacao,
  };
});

// Blocos de outras fatias (Balanço, Evolução, cartões de seguros do celular): fora deste teste.
vi.mock('../BalancoPatrimonial', () => ({ default: () => <div data-testid="balanco" /> }));
vi.mock('../EvolucaoChart', () => ({ default: () => <div data-testid="evolucao" /> }));
vi.mock('../mobile/SegurosCards', () => ({ default: () => <div data-testid="seguros-cards" /> }));

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

import SaudeFinanceiraRoot from '../SaudeFinanceiraRoot';
import StatusHero from '../StatusHero';
import FluxoCards from '../FluxoCards';
import GestaoRisco from '../GestaoRisco';
import MetasPatrimoniais from '../MetasPatrimoniais';
import ClienteHeader from '../ClienteHeader';
import DadosEconomicos from '../DadosEconomicos';
import MetasConfigForm from '../MetasConfigForm';
import SeguroForm from '../SeguroForm';

function Arvore({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>;
}

function renderOculto(ui: React.ReactElement, ocultos = true) {
  return render(
    <Arvore>
      <ComValoresOcultos ocultos={ocultos}>{ui}</ComValoresOcultos>
    </Arvore>,
  );
}

/** Olho aberto = o mesmo HTML de hoje (sem provider). */
function expectIgualAHoje(ui: React.ReactElement) {
  render(<Arvore>{ui}</Arvore>);
  const htmlHoje = document.body.innerHTML;
  cleanup();
  renderOculto(ui, false);
  const corpo = document.body.cloneNode(true) as HTMLElement;
  corpo.querySelectorAll('[data-mf-anuncio-valores]').forEach((el) => el.remove());
  expect(corpo.innerHTML).toBe(htmlHoje);
  cleanup();
}

const { indicadores, tendencias } = saude;

beforeEach(() => {
  ambiente.isBelowLg = false;
  capturado.options = null;
});

describe('Saúde Financeira (painel) — olho fechado (desktop)', () => {
  it('página: cabeçalho, dados econômicos, fluxo, metas, status e seguros sem valores', async () => {
    const { container } = renderOculto(<SaudeFinanceiraRoot />);
    await waitFor(() => expect(capturado.options).not.toBeNull());
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_PAINEL });
    expectPilulas(container);
    // Ficam: status, índices, %, idades, mercado.
    expect(container.textContent).toContain('Equilibrado');
    expect(container.textContent).toContain('38 anos');
    expect(container.textContent).toContain('14,15%');
    expect(container.textContent).toContain('47,0%');
  });

  it('fluxo: renda, gasto e poupança viram pílula; taxa de poupança fica', () => {
    const { container } = renderOculto(
      <FluxoCards indicadores={indicadores} tendencias={tendencias} cashflowYear={2026} />,
    );
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_PAINEL });
    expectPilulas(container, 3);
    expect(container.textContent).toContain('38,0%');
    expect(container.textContent).toContain('vs mês anterior');
  });

  it('metas patrimoniais: atual e necessário viram pílula; % atingido fica', () => {
    const { container } = renderOculto(
      <MetasPatrimoniais indicadores={indicadores} idade={38} config={saude.config} />,
    );
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_PAINEL });
    expectPilulas(container, 8);
    expect(container.textContent).toContain('67%');
    expect(container.textContent).toContain('10% × renda anual × idade (38 anos)');
  });

  it('status, cabeçalho e dados econômicos: nada a esconder (índices e mercado visíveis)', () => {
    const { container } = renderOculto(
      <>
        <StatusHero indicadores={indicadores} tendencias={tendencias} />
        <ClienteHeader nome="Cliente Demo" fontes={saude.fontes} asOf={saude.asOf} />
        <DadosEconomicos indicadores={indicadores} />
      </>,
    );
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_PAINEL });
    expectPilulas(container, 0);
    expect(container.textContent).toContain('3,6 meses');
    expect(container.textContent).toContain('12,87%');
  });

  it('gestão de risco: custo anual e capital viram pílula; tooltip da bolha com pílula', async () => {
    const { container } = renderOculto(<GestaoRisco />);
    await waitFor(() => expect(capturado.options).not.toBeNull());
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_PAINEL });
    expectPilulas(container, 3);
    expect(container.textContent).toContain('Seguro de vida');
    expect(container.textContent).toContain('Parcial');
    const custom = capturado.options!.tooltip!.custom as (o: unknown) => string;
    const w = { config: { series: [{ data: [{ nome: 'Seguro de vida', custo: S.custoVida }] }] } };
    const html = custom({ seriesIndex: 0, dataPointIndex: 0, w });
    expect(html).toContain('mf-pilula-grafico');
    expect(html).toContain('Seguro de vida');
    for (const forma of representacoesDoSentinela(S.custoVida)) expect(html).not.toContain(forma);
    // Eixos (risco × cobertura) ficam.
    const eixoY = capturado.options!.yaxis as ApexYAxis;
    expect((eixoY.labels!.formatter as (v: number) => string)(3)).toBe('Total');
    // Eixo de categorias: sem largura reservada (a área do gráfico não encolhe nem pula).
    expect(eixoY.labels!.minWidth).toBeUndefined();
    // Rolar a página sobre o gráfico não pode dar zoom nos eixos (ticket 86e3vxd5r).
    expect(capturado.options!.chart!.zoom).toMatchObject({
      enabled: false,
      allowMouseWheelZoom: false,
    });
  });

  it('formulários: o valor do campo fica (decisão 3)', () => {
    const { container } = renderOculto(
      <>
        <SeguroForm seguro={seguros[0]} onCancel={vi.fn()} onSaved={vi.fn()} />
        <MetasConfigForm config={saude.config} defaults={saude.config} onClose={vi.fn()} />
      </>,
    );
    expect(container.querySelector<HTMLInputElement>('#seguro-custo')!.value).toBe(
      String(S.custoVida),
    );
    expect(container.querySelector<HTMLInputElement>('#seguro-capital')!.value).toBe(
      String(S.capitalVida),
    );
    expect(container.querySelector<HTMLInputElement>('#cfg-reserva')!.value).toBe('3');
    expectPilulas(container, 0);
  });
});

describe('Saúde Financeira (painel) — olho fechado (celular)', () => {
  beforeEach(() => {
    ambiente.isBelowLg = true;
  });

  it('página: resumo do Balanço (PL) vira pílula curta; grade do fluxo sem valores', async () => {
    const { container } = renderOculto(<SaudeFinanceiraRoot />);
    await waitFor(() => expect(capturado.options).not.toBeNull());
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_PAINEL });
    const balanco = container.querySelector('button[aria-controls="saude-bloco-balanco"]')!;
    expect(balanco.textContent).toMatch(/^Balanço PatrimonialPL /);
    expect(balanco.querySelectorAll('.mf-sensivel--curto')).toHaveLength(1);
    const grade = container.querySelector('dl[data-mf-mobile]')!;
    expect(grade.querySelectorAll('.mf-sensivel')).toHaveLength(3);
    expect(grade.textContent).toContain('38,0%');
  });
});

describe('Saúde Financeira (painel) — olho aberto: DOM idêntico ao de hoje', () => {
  it.each([
    ['desktop', false],
    ['celular', true],
  ])('%s', (_nome, celular) => {
    ambiente.isBelowLg = celular;
    expectIgualAHoje(<SaudeFinanceiraRoot />);
    expectIgualAHoje(
      <FluxoCards indicadores={indicadores} tendencias={tendencias} cashflowYear={2026} />,
    );
    expectIgualAHoje(
      <MetasPatrimoniais indicadores={indicadores} idade={38} config={saude.config} />,
    );
    expectIgualAHoje(<GestaoRisco />);
  });

  it('gráfico de seguros: tooltip com o R$', async () => {
    renderOculto(<GestaoRisco />, false);
    await waitFor(() => expect(capturado.options).not.toBeNull());
    const custom = capturado.options!.tooltip!.custom as (o: unknown) => string;
    const w = { config: { series: [{ data: [{ nome: 'Seguro de vida', custo: S.custoVida }] }] } };
    expect(custom({ seriesIndex: 0, dataPointIndex: 0, w })).toContain('R$ 2.345,61');
  });
});
