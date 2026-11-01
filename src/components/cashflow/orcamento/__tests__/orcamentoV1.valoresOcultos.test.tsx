// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { ApexOptions } from 'apexcharts';
import {
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
  renderComValoresOcultos,
} from '@/test/valoresOcultos';
import { formatBRL } from '@/utils/format';
import type { OrcamentoCategoria } from '@/services/cashflow/orcamentoVsReal';
import { OrcamentoTable, type OrcamentoLinha } from '../OrcamentoTable';
import OrcamentoMobileList from '../OrcamentoMobileList';
import OrcamentoResumoMobile from '../OrcamentoResumoMobile';
import OrcamentoMensalChart from '../OrcamentoMensalChart';

/**
 * Esconder valores — Orçamento v1 (Orçamento vs Real), Fase 2: meta, real, diferença e totais em
 * R$ viram pílula; consumo em % fica; a meta em edição mostra o número; o gráfico perde o eixo de
 * R$ e o tooltip vira pílula.
 */

const estado = vi.hoisted(() => ({ graficos: [] as ApexOptions[] }));

vi.mock('next/navigation', () => ({ usePathname: () => '/fluxodecaixa' }));
vi.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }));
vi.mock('next/dynamic', () => ({
  default: () => (props: { options: ApexOptions }) => {
    estado.graficos.push(props.options);
    return <div data-testid="apex" />;
  },
}));

const { saldo, aplicado } = SENTINELAS;

const linha = (over: Partial<OrcamentoLinha>): OrcamentoLinha => ({
  key: 'g-1',
  nome: 'Habitação',
  parentNome: null,
  metaBase: saldo,
  tipoMeta: 'valor',
  metaJanela: saldo,
  real: aplicado,
  isInvestimentos: false,
  ...over,
});

const LINHAS: OrcamentoLinha[] = [
  linha({ key: 'hab', nome: 'Habitação' }),
  // Estourou: real acima da meta (aviso "passou do orçado em R$ …").
  linha({ key: 'lazer', nome: 'Lazer', metaBase: aplicado, metaJanela: aplicado, real: saldo }),
  // Atenção (≥ 80%): aviso "Restam R$ …".
  linha({ key: 'saude', nome: 'Saúde', real: saldo * 0.9 }),
  linha({ key: 'edu', nome: 'Educação', metaBase: null, metaJanela: null }),
];

const INVESTIMENTOS = linha({
  key: 'investimentos',
  nome: 'Investimentos',
  metaBase: 10,
  tipoMeta: 'percentual',
  metaJanela: saldo,
  isInvestimentos: true,
});

const TOTAIS = { meta: saldo, real: aplicado, diferenca: saldo - aplicado };

const CATEGORIAS = [
  {
    groupId: 'hab',
    nome: 'Habitação',
    metaMensal: saldo,
    realPorMes: {
      lancado: Array(12).fill(aplicado),
      consolidado: Array(12).fill(aplicado),
    },
  },
] as unknown as OrcamentoCategoria[];

beforeEach(() => {
  estado.graficos = [];
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
});

describe('OrcamentoTable (desktop) — valores ocultos', () => {
  const ui = () => (
    <OrcamentoTable
      linhas={LINHAS}
      investimentos={INVESTIMENTOS}
      totais={TOTAIS}
      onSaveMeta={vi.fn().mockResolvedValue(undefined)}
    />
  );

  it('olho fechado: meta, real, diferença e total viram pílula; consumo em % fica', () => {
    const { container } = renderComValoresOcultos(ui());
    expectSemValoresExpostos(container);
    expectPilulas(container);
    expect(container.textContent).toContain('90%'); // consumo da Saúde
    expect(container.textContent).toContain('10%'); // meta de investimentos em % da renda
    expect(screen.getByRole('button', { name: /Definir/ })).toBeInTheDocument();
  });

  it('olho fechado: ao editar, o input mostra o número (formulário visível)', () => {
    renderComValoresOcultos(ui());
    fireEvent.click(screen.getAllByTitle(/Meta mensal em R\$/)[0]);
    expect(screen.getByLabelText('Meta de Habitação')).toHaveValue('9876543,21');
  });

  it('olho aberto: texto de hoje, sem pílula', () => {
    const { container } = renderComValoresOcultos(ui(), { ocultos: false });
    expectPilulas(container, 0);
    expect(container.textContent).toContain(formatBRL(saldo));
    expect(container.textContent).toContain(`+${formatBRL(saldo - aplicado)}`);
  });
});

describe('OrcamentoMobileList (celular) — valores ocultos', () => {
  const ui = () => (
    <OrcamentoMobileList
      linhas={LINHAS}
      investimentos={INVESTIMENTOS}
      totais={TOTAIS}
      mesesNaJanela={1}
      onSaveMeta={vi.fn().mockResolvedValue(undefined)}
    />
  );

  it('olho fechado: cartões e total com pílula; aria-label do cartão mascarado', () => {
    const { container } = renderComValoresOcultos(ui());
    expectSemValoresExpostos(container);
    expectPilulas(container);
    const cartao = container.querySelector('[data-mf-orcamento-card="hab"]');
    expect(cartao?.getAttribute('aria-label')).toContain('R$ •••••');
    expect(container.textContent).toContain('(10% da renda)');
  });

  it('olho aberto: texto e aria-label de hoje', () => {
    const { container } = renderComValoresOcultos(ui(), { ocultos: false });
    expectPilulas(container, 0);
    const cartao = container.querySelector('[data-mf-orcamento-card="hab"]');
    expect(cartao?.getAttribute('aria-label')).toContain(
      `real ${formatBRL(aplicado)} de ${formatBRL(saldo)}`,
    );
    expect(container.textContent).toContain(`Sobram ${formatBRL(saldo - aplicado)}`);
  });
});

describe('OrcamentoResumoMobile — valores ocultos', () => {
  const ui = (totais = TOTAIS) => (
    <OrcamentoResumoMobile rotuloJanela="Julho" linhas={LINHAS} totais={totais} />
  );

  it('olho fechado: sobra, real × orçado e avisos com pílula; % fica', () => {
    const { container } = renderComValoresOcultos(ui());
    expectSemValoresExpostos(container);
    expectPilulas(container);
    expect(container.textContent).toMatch(/passou do orçado em .*\(\d+%\)/);
    expect(container.textContent).toMatch(/já usou 90% do orçado\. Restam/);
  });

  it('olho fechado: sem meta, o real da janela vira pílula', () => {
    const { container } = renderComValoresOcultos(ui({ meta: 0, real: saldo, diferenca: -saldo }));
    expectSemValoresExpostos(container);
    expectPilulas(container);
  });

  it('olho aberto: texto de hoje', () => {
    const { container } = renderComValoresOcultos(ui(), { ocultos: false });
    expectPilulas(container, 0);
    expect(container.textContent).toContain(
      `Real ${formatBRL(aplicado)} de ${formatBRL(saldo)} orçados`,
    );
  });
});

describe('OrcamentoMensalChart — valores ocultos', () => {
  const props = {
    mes: 6,
    modoReal: 'lancado' as const,
    categorias: CATEGORIAS,
    orcadoMensal: saldo,
  };

  it('desktop, olho fechado: eixo Y sem rótulo (largura reservada) e tooltip com pílula', () => {
    renderComValoresOcultos(<OrcamentoMensalChart {...props} visao="ano" />);
    const opts = estado.graficos.at(-1)!;
    const yaxis = opts.yaxis as { labels: { formatter: (v: number) => string; minWidth: number } };
    expect(yaxis.labels.formatter(saldo)).toBe('');
    expect(yaxis.labels.minWidth).toBeGreaterThan(0);
    const tooltip = opts.tooltip!.y as { formatter: (v: number) => string };
    expect(tooltip.formatter(saldo)).toContain('mf-pilula-grafico');
    expect(tooltip.formatter(saldo)).not.toContain('9.876.543');
  });

  it('celular, olho fechado: eixo de valor das barras e tooltip sem número', () => {
    renderComValoresOcultos(<OrcamentoMensalChart {...props} visao="mes" variant="mobile" />);
    const opts = estado.graficos.at(-1)!;
    const xaxis = opts.xaxis as { labels: { formatter: (v: string) => string } };
    expect(xaxis.labels.formatter(String(saldo))).toBe('R$ •••••');
    const tooltip = opts.tooltip!.y as { formatter: (v: number) => string };
    expect(tooltip.formatter(saldo)).toContain('mf-pilula-grafico');
  });

  it('celular acumulado, olho fechado: eixo Y vazio', () => {
    renderComValoresOcultos(<OrcamentoMensalChart {...props} visao="ano" variant="mobile" />);
    const opts = estado.graficos.at(-1)!;
    const yaxis = opts.yaxis as { labels: { formatter: (v: number) => string } };
    expect(yaxis.labels.formatter(saldo)).toBe('');
  });

  it('olho aberto: formatters de hoje', () => {
    renderComValoresOcultos(<OrcamentoMensalChart {...props} visao="ano" />, { ocultos: false });
    const opts = estado.graficos.at(-1)!;
    const yaxis = opts.yaxis as { labels: { formatter: (v: number) => string; minWidth?: number } };
    expect(yaxis.labels.formatter(saldo)).toBe(formatBRL(saldo));
    expect(yaxis.labels.minWidth).toBeUndefined();
  });
});
