// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApexOptions } from 'apexcharts';
import {
  ComValoresOcultos,
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
  representacoesDoSentinela,
} from '@/test/valoresOcultos';
import type {
  EvolucaoPonto,
  SaudeFinanceiraIndicadores,
  SaudeFinanceiraPayload,
  TendenciasSaude,
} from '@/hooks/useSaudeFinanceira';
import type { SeguroDTO } from '@/hooks/useSeguros';

/**
 * Esconder valores (Fase 4, fatia 3): Saúde Financeira — Balanço Patrimonial (tabela e celular),
 * Evolução (tabela e gráfico) e cartões do celular (seguros, dados econômicos). Fixtures com
 * SENTINELAS: nenhum R$ nem sentinela no texto nem em title/aria-label; % (taxa de poupança,
 * rentabilidade, grau de independência), status, meses, nomes e Dados Econômicos continuam.
 * Olho aberto: DOM de hoje.
 */

const ambiente = vi.hoisted(() => ({ isBelowLg: false }));
vi.mock('next/navigation', () => ({ usePathname: () => '/saude-financeira' }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => ambiente.isBelowLg,
  useMediaQuery: () => ambiente.isBelowLg,
}));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: vi.fn() }) }));

const S = SENTINELAS;
const evolucaoFixture = vi.hoisted(() => ({ snapshots: [] as unknown[] }));
vi.mock('@/hooks/useSaudeFinanceira', async (orig) => {
  const real = await orig<typeof import('@/hooks/useSaudeFinanceira')>();
  return {
    ...real,
    useSaudeFinanceiraEvolucao: () => ({
      snapshots: evolucaoFixture.snapshots,
      loading: false,
      error: null,
    }),
  };
});

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

import BalancoPatrimonial from '../BalancoPatrimonial';
import EvolucaoTabela from '../EvolucaoTabela';
import EvolucaoChart from '../EvolucaoChart';
import BalancoMobile from '../mobile/BalancoMobile';
import SegurosCards from '../mobile/SegurosCards';
import DadosEconomicosCards from '../mobile/DadosEconomicosCards';
import { montarQuadrantes } from '../BalancoPatrimonial';

const composicao = {
  altaLiquidez: [
    { chave: 'reserva', label: 'Reserva Emergência', valor: S.saldo },
    { chave: 'rf', label: 'Renda Fixa até D+360', valor: S.precoMedio },
  ],
  baixaLiquidez: [{ chave: 'imoveis', label: 'Imóveis & Bens', valor: S.aplicado }],
  passivos: [
    { id: 'd1', nome: 'Nubank', tipo: 'cartao_credito', prazo: 'curto', saldo: S.quantidade },
    {
      id: 'd2',
      nome: 'Apartamento',
      tipo: 'financiamento_imobiliario',
      prazo: 'longo',
      saldo: S.aplicado / 10,
    },
  ],
} as unknown as SaudeFinanceiraPayload['composicao'];

const indicadores = {
  balanco: {
    ativosAltaLiquidez: S.saldo + S.precoMedio,
    ativosBaixaLiquidez: S.aplicado,
    passivosCurtoPrazo: S.quantidade,
    passivosLongoPrazo: S.aplicado / 10,
    patrimonioLiquido: S.saldo / 10,
  },
  metricas: { grauIndependencia: 0.4321 },
} as unknown as SaudeFinanceiraIndicadores;

const tendencias = { patrimonioLiquido: 'up', grauIndependencia: 'flat' } as TendenciasSaude;

const SENTINELAS_SAUDE = [
  S.saldo,
  S.aplicado,
  S.aplicado / 10,
  S.quantidade,
  S.precoMedio,
  S.saldo / 10,
  S.saldo + S.precoMedio,
];

const snapshots: EvolucaoPonto[] = [0, 1, 2].map((i) => ({
  year: 2026,
  month: 6 + i,
  data: {
    rendaMensal: S.precoMedio * 100 + i,
    gastoMensal: S.precoMedio * 50 + i,
    poupancaMensal: S.precoMedio * 50,
    taxaPoupanca: 0.5,
    ativosAltaLiquidez: S.saldo + i,
    ativosBaixaLiquidez: S.aplicado + i,
    passivosCurtoPrazo: S.quantidade,
    passivosLongoPrazo: S.aplicado / 10,
    patrimonioLiquido: S.saldo / 10 + i,
    reservaEmergencia: S.precoMedio,
    mesesCobertura: 4.2,
    grauIndependencia: 0.4,
    rentabilidadeAA: 0.1234,
    status: i === 0 ? 'FR' : 'EQ',
  },
}));

const seguros: SeguroDTO[] = [
  {
    id: 's1',
    nome: 'Seguro de vida',
    tipo: 'vida',
    cobertura: 'total',
    risco: 'alto',
    custoAnual: S.precoMedio * 10,
    capitalSegurado: S.saldo,
    notes: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 's2',
    nome: 'Seguro do carro',
    tipo: 'auto',
    cobertura: 'parcial',
    risco: 'medio',
    custoAnual: S.quantidade,
    capitalSegurado: null,
    notes: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  },
] as SeguroDTO[];

function renderOculto(ui: React.ReactElement, ocultos = true) {
  return render(<ComValoresOcultos ocultos={ocultos}>{ui}</ComValoresOcultos>);
}

/** Olho aberto = o mesmo HTML de hoje (sem provider). */
function expectIgualAHoje(ui: React.ReactElement) {
  render(ui);
  const htmlHoje = document.body.innerHTML;
  cleanup();
  renderOculto(ui, false);
  const corpo = document.body.cloneNode(true) as HTMLElement;
  corpo.querySelectorAll('[data-mf-anuncio-valores]').forEach((el) => el.remove());
  expect(corpo.innerHTML).toBe(htmlHoje);
  cleanup();
}

beforeEach(() => {
  ambiente.isBelowLg = false;
  evolucaoFixture.snapshots = snapshots;
  capturado.options = null;
});

describe('Saúde Financeira — balanço e evolução com o olho fechado (desktop)', () => {
  it('balanço: itens, totais e PL viram pílula; rótulos e grau de independência ficam', () => {
    const { container } = renderOculto(
      <BalancoPatrimonial
        indicadores={indicadores}
        composicao={composicao}
        tendencias={tendencias}
      />,
    );
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_SAUDE });
    // 3 + 6 itens (com os tipos-modelo zerados) + 4 totais + PL.
    const tabela = container.querySelector('table')!;
    expect(tabela.querySelectorAll('.mf-sensivel')).toHaveLength(
      montarQuadrantes(composicao, indicadores).ativo.curto.itens.length +
        montarQuadrantes(composicao, indicadores).ativo.longo.itens.length +
        montarQuadrantes(composicao, indicadores).passivo.curto.itens.length +
        montarQuadrantes(composicao, indicadores).passivo.longo.itens.length +
        5,
    );
    expect(container.textContent).toContain('43,2%');
    expect(container.textContent).toContain('Nubank (');
    expect(container.textContent).toContain('Total do Patrimônio Líquido');
    // A seta de tendência do PL continua ao lado da pílula.
    expect(container.querySelector('[title="vs mês anterior"]')).not.toBeNull();
  });

  it('tabela de evolução: R$ em pílula curta; taxa de poupança, rentabilidade e status ficam', () => {
    const { container } = renderOculto(<EvolucaoTabela snapshots={snapshots} />);
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_SAUDE });
    // 7 linhas em R$ × 3 meses, todas curtas.
    expect(container.querySelectorAll('tbody .mf-sensivel--curto')).toHaveLength(21);
    expect(container.querySelectorAll('.mf-sensivel:not(.mf-sensivel--curto)')).toHaveLength(0);
    expect(container.textContent).toContain('50,0%');
    expect(container.textContent).toContain('12,3%');
    expect(container.textContent).toContain('Jul/26');
    expect(container.textContent).toContain('EQ');
  });

  it('gráfico de evolução: eixo Y sem rótulo com largura reservada, tooltip com pílula', async () => {
    const { container } = renderOculto(<EvolucaoChart />);
    await waitFor(() => expect(capturado.options).not.toBeNull());
    const o = capturado.options!;
    const eixo = (Array.isArray(o.yaxis) ? o.yaxis[0] : o.yaxis)!;
    expect((eixo.labels!.formatter as (v: number) => string)(S.saldo)).toBe('');
    expect(eixo.labels!.minWidth).toBeGreaterThan(0);
    const tip = (o.tooltip!.y as { formatter: (v: number) => string }).formatter(S.saldo);
    expect(tip).toContain('mf-pilula-grafico');
    for (const forma of representacoesDoSentinela(S.saldo)) expect(tip).not.toContain(forma);
    // Meses e nomes das séries ficam.
    expect(o.xaxis!.categories).toContain('Jul/26');
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_SAUDE });
  });

  it('gráfico de evolução no celular: eixo compacto também sem rótulo', async () => {
    ambiente.isBelowLg = true;
    renderOculto(<EvolucaoChart />);
    await waitFor(() => expect(capturado.options).not.toBeNull());
    const o = capturado.options!;
    const eixo = (Array.isArray(o.yaxis) ? o.yaxis[0] : o.yaxis)!;
    expect((eixo.labels!.formatter as (v: number) => string)(S.saldo)).toBe('');
    const tip = (o.tooltip!.y as { formatter: (v: number) => string }).formatter(S.aplicado);
    expect(tip).toContain('mf-pilula-grafico');
  });
});

describe('Saúde Financeira — celular com o olho fechado', () => {
  it('balanço no celular: itens em pílula curta, subtotais, totais e PL em pílula', () => {
    const { container } = renderOculto(
      <BalancoMobile quadrantes={montarQuadrantes(composicao, indicadores)} />,
    );
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_SAUDE });
    expect(container.querySelectorAll('li .mf-sensivel--curto').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('li .mf-sensivel:not(.mf-sensivel--curto)')).toHaveLength(0);
    // Faixas recolhíveis: o botão continua com o rótulo (só o subtotal vira pílula).
    const faixas = container.querySelectorAll('button[data-mf-section]');
    expect(faixas).toHaveLength(4);
    faixas.forEach((f) => expect(f.querySelector('.mf-sensivel')).not.toBeNull());
    expect(container.textContent).toContain('Ativos curto prazo');
  });

  it('balanço inteiro abaixo de lg (tabela + celular) sem valores', () => {
    ambiente.isBelowLg = true;
    const { container } = renderOculto(
      <BalancoPatrimonial
        indicadores={indicadores}
        composicao={composicao}
        tendencias={tendencias}
      />,
    );
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_SAUDE });
    expectPilulas(container);
  });

  it('seguros: custo e capital em pílula; nomes, tipo, cobertura e risco ficam', () => {
    const { container } = renderOculto(
      <SegurosCards seguros={seguros} onEdit={vi.fn()} onDelete={vi.fn()} />,
    );
    expectSemValoresExpostos(container, {
      sentinelas: [S.precoMedio * 10, S.saldo, S.quantidade],
    });
    expectPilulas(container, 3);
    expect(container.textContent).toContain('Seguro de vida');
    expect(container.textContent).toContain('Parcial');
    expect(container.textContent).toContain('Alto');
    expect(container.textContent).toContain('—');
    // Botões continuam (não são embrulhados).
    expect(container.querySelector('[aria-label="Editar Seguro de vida"]')).not.toBeNull();
  });

  it('dados econômicos (mercado) continuam visíveis', () => {
    const { container } = renderOculto(
      <DadosEconomicosCards
        linhas={[{ chave: 'cdi', label: 'CDI', aa: 0.1415, destaque: false } as never]}
      />,
    );
    expectPilulas(container, 0);
    expect(container.textContent).toContain('14,15% a.a.');
  });
});

describe('Saúde Financeira — olho aberto = DOM de hoje', () => {
  it('balanço (desktop e celular), evolução e seguros', () => {
    expectIgualAHoje(
      <BalancoPatrimonial
        indicadores={indicadores}
        composicao={composicao}
        tendencias={tendencias}
      />,
    );
    expectIgualAHoje(<EvolucaoTabela snapshots={snapshots} />);
    expectIgualAHoje(<SegurosCards seguros={seguros} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expectIgualAHoje(<BalancoMobile quadrantes={montarQuadrantes(composicao, indicadores)} />);
    ambiente.isBelowLg = true;
    expectIgualAHoje(
      <BalancoPatrimonial
        indicadores={indicadores}
        composicao={composicao}
        tendencias={tendencias}
      />,
    );
  });

  it('gráfico: opções idênticas às de hoje com o olho aberto', async () => {
    render(<EvolucaoChart />);
    await waitFor(() => expect(capturado.options).not.toBeNull());
    const hoje = capturado.options!;
    cleanup();
    capturado.options = null;
    renderOculto(<EvolucaoChart />, false);
    await waitFor(() => expect(capturado.options).not.toBeNull());
    const o = capturado.options!;
    const eixo = (Array.isArray(o.yaxis) ? o.yaxis[0] : o.yaxis)!;
    expect(eixo.labels!.minWidth).toBeUndefined();
    expect((eixo.labels!.formatter as (v: number) => string)(S.saldo)).toBe(
      (
        (Array.isArray(hoje.yaxis) ? hoje.yaxis[0] : hoje.yaxis)!.labels!.formatter as (
          v: number,
        ) => string
      )(S.saldo),
    );
    expect(JSON.stringify(o)).toBe(JSON.stringify(hoje));
  });
});
