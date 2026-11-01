// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ApexOptions } from 'apexcharts';

/**
 * Esconder valores — Fase 3, Aposentadoria: abas Projeção, Acompanhamento e Evolução e os gráficos
 * (fatia 2). Com o olho fechado nenhum R$ (nem sentinela) sobra no texto, title ou aria-label; os
 * campos do formulário do Acompanhamento continuam com o número digitado; % e idades ficam. Com o
 * olho aberto, o texto é o de hoje. Os gráficos: eixo Y sem rótulo com largura reservada, tooltip
 * com pílula, rentabilidade em % intacta.
 */

const ambiente = vi.hoisted(() => ({ isBelowLg: false }));
vi.mock('next/navigation', () => ({ usePathname: () => '/planejamento-financeiro' }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => ambiente.isBelowLg }));

const capturados = vi.hoisted(() => ({ porId: new Map<string, ApexOptions>() }));
vi.mock('react-apexcharts', () => ({
  default: (props: { options: ApexOptions }) => {
    capturados.porId.set(props.options.chart?.id ?? '?', props.options);
    return <div data-testid="chart" />;
  },
}));
vi.mock('next/dynamic', async () => {
  const mod = await import('react-apexcharts');
  return { default: () => mod.default };
});

const SUGESTAO = { off: 10, aporteReal: 4444.44, patFinal: 5555555.55, hasData: true };
vi.mock('@/hooks/useAposentadoria', () => ({
  useAcompanhamentoAuto: () => ({ preview: { asOf: '', derived: [SUGESTAO], fillable: 1 } }),
  useAutoFillEntries: () => ({ mutate: vi.fn(), isPending: false }),
}));
// Cartões e folha do celular são da fatia 3 (só o painel do topo importa aqui).
vi.mock('../mobile/AcompanhamentoCards', () => ({ default: () => <div data-testid="cards" /> }));
vi.mock('../mobile/RegistrarMesSheet', () => ({ default: () => null }));

import ProjecaoTab from '../tabs/ProjecaoTab';
import AcompanhamentoTab from '../tabs/AcompanhamentoTab';
import EvolucaoTab from '../tabs/EvolucaoTab';
import { calc } from '@/services/planejamento/aposentadoria';
import type { AposentadoriaEntryDTO, PlanoUpsertPayload } from '@/hooks/useAposentadoria';
import {
  ComValoresOcultos,
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
} from '@/test/valoresOcultos';

type Fn = (...args: unknown[]) => string;

const PARAMS: PlanoUpsertPayload = {
  idade: 35,
  apos: 60,
  vida: 90,
  rentNom: 11.5,
  inflacao: 4.5,
  rentNomRetiro: null,
  patrimonio: SENTINELAS.saldo,
  aporteM: 3456.78,
  renda: 12345.67,
  trackStartMonth: 1,
  trackStartYear: 2026,
  eventos: [],
  fieldLocks: [],
};

const entries = (fator: number): AposentadoriaEntryDTO[] =>
  Array.from({ length: 9 }, (_, i) => ({
    off: i + 1,
    year: 2026,
    month: i + 2,
    aporteReal: 3517.29,
    patFinal: Math.round(SENTINELAS.saldo * fator * (1 + 0.01 * (i + 1)) * 100) / 100,
  })) as AposentadoriaEntryDTO[];

const SENT = [SENTINELAS.saldo, 3456.78, 12345.67, 3517.29, 4444.44, 5555555.55];

function renderOlho(ui: React.ReactElement, ocultos: boolean) {
  return render(<ComValoresOcultos ocultos={ocultos}>{ui}</ComValoresOcultos>);
}

const noop = () => {};
const acompanhamento = (fator = 1) => (
  <AcompanhamentoTab
    params={PARAMS}
    entries={entries(fator)}
    onSaveEntry={noop}
    onDeleteEntry={noop}
    saving={false}
  />
);

beforeEach(() => {
  ambiente.isBelowLg = false;
  capturados.porId.clear();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        font: '',
        measureText: (t: string) => ({ width: t.length * 7 }),
      }) as unknown as CanvasRenderingContext2D,
  );
});

describe('ProjecaoTab', () => {
  const projection = calc(PARAMS)!;

  it('desktop, olho fechado: análise, cartões e gráfico sem R$; idades e anos ficam', async () => {
    const { container } = renderOlho(<ProjecaoTab params={PARAMS} projection={projection} />, true);
    expectSemValoresExpostos(container, { sentinelas: SENT });
    expectPilulas(container);
    expect(container.textContent).toContain('Aos seus 60 anos você atingiria');
    expect(container.textContent).toContain('30 anos de aposentadoria');
    expect(container.textContent).toContain('em R$ de hoje');
    await waitFor(() => expect(capturados.porId.get('apos-projecao')).toBeDefined());
  });

  it('celular, olho fechado: grade 2×2 e aria-label do gráfico sem R$', () => {
    ambiente.isBelowLg = true;
    const { container } = renderOlho(<ProjecaoTab params={PARAMS} projection={projection} />, true);
    expectSemValoresExpostos(container, { sentinelas: SENT });
    const resumo = container.querySelector('[role="img"]')!;
    expect(resumo.getAttribute('aria-label')).toMatch(/^Projeção: Aos 60: R\$ •••••$/);
  });

  it('olho aberto: o texto de hoje (R$ na análise, nos cartões e no aria-label)', () => {
    ambiente.isBelowLg = true;
    const { container } = renderOlho(
      <ProjecaoTab params={PARAMS} projection={projection} />,
      false,
    );
    expectPilulas(container, 0);
    expect(container.textContent).toMatch(/Aos seus 60 anos você atingiria R\$ [\d.]+,\d{2}/);
    expect(container.querySelector('[role="img"]')!.getAttribute('aria-label')).toMatch(
      /^Projeção: Aos 60: R\$ \d/,
    );
  });
});

describe('AcompanhamentoTab', () => {
  it('desktop, olho fechado: painel, tabela, "Necessário", sugestão e Δ sem R$', () => {
    const { container } = renderOlho(acompanhamento(), true);
    // Escolhe um mês registrado: o formulário carrega os valores e mostra o Δ do patrimônio.
    fireEvent.click(screen.getByText('Mai/26'));
    expectSemValoresExpostos(container, { sentinelas: SENT });
    // Tabela: pílulas curtas (decisão 6).
    const tabela = container.querySelector('table')!;
    expect(tabela.querySelectorAll('.mf-sensivel--curto').length).toBeGreaterThan(0);
    expect(tabela.querySelectorAll('.mf-sensivel:not(.mf-sensivel--curto)')).toHaveLength(0);
    // % e meses ficam.
    expect(container.textContent).toContain('Rent. nominal: 11,5%');
    expect(container.textContent).toMatch(/Necessária: \d+,\d{2}%\/mês/);
    expect(tabela.textContent).toMatch(/[+-]\d+,\d%/);
  });

  it('formulário: os campos ficam com o valor (decisão 3)', () => {
    const { container } = renderOlho(acompanhamento(), true);
    fireEvent.click(screen.getByText('Mai/26'));
    const campos = Array.from(container.querySelectorAll('input')).map((i) => i.value);
    expect(campos).toContain('3517.29');
  });

  it('banner de recálculo (patrimônio >10% abaixo): só os R$ viram pílula', () => {
    const { container } = renderOlho(acompanhamento(0.5), true);
    const banner = screen.getByText(/Para atingir o objetivo original/);
    expect(banner.querySelectorAll('.mf-sensivel')).toHaveLength(2);
    expectSemValoresExpostos(container, { sentinelas: SENT });
  });

  it('celular, olho fechado: painel do topo sem R$', () => {
    ambiente.isBelowLg = true;
    const { container } = renderOlho(acompanhamento(0.5), true);
    expectSemValoresExpostos(container, { sentinelas: SENT });
    expect(screen.getByTestId('cards')).toBeInTheDocument();
  });

  it('olho aberto: o texto de hoje', () => {
    const { container } = renderOlho(acompanhamento(), false);
    expectPilulas(container, 0);
    expect(container.textContent).toMatch(/Aporte: R\$ 3 K\/mês/);
    expect(container.textContent).toMatch(/aporte R\$ 4\.444,44 · patrimônio R\$ 5\.555\.555,55/);
  });
});

describe('Gráficos da Evolução e da Projeção', () => {
  const eixoY = (o: ApexOptions) => (Array.isArray(o.yaxis) ? o.yaxis[0] : o.yaxis)!;
  const tooltipY = (o: ApexOptions) => (o.tooltip!.y as { formatter: Fn }).formatter;

  async function graficos(ocultos: boolean) {
    renderOlho(<EvolucaoTab params={PARAMS} entries={entries(1)} />, ocultos);
    renderOlho(<ProjecaoTab params={PARAMS} projection={calc(PARAMS)!} />, ocultos);
    await waitFor(() => expect(capturados.porId.size).toBe(4));
    return capturados.porId;
  }

  it.each([false, true])(
    'olho fechado (celular=%s): eixo Y em R$ vazio com largura reservada e tooltip com pílula',
    async (celular) => {
      ambiente.isBelowLg = celular;
      const porId = await graficos(true);
      for (const id of ['apos-projecao', 'apos-evol-patrimonio', 'apos-evol-aportes']) {
        const o = porId.get(id)!;
        const labels = eixoY(o).labels!;
        expect((labels.formatter as Fn)(SENTINELAS.saldo), id).toBe('');
        expect(labels.minWidth, id).toBeGreaterThan(0);
        const tip = tooltipY(o)(SENTINELAS.saldo);
        expect(tip, id).toContain('mf-pilula-grafico');
        expect(tip, id).not.toMatch(/\d/);
      }
      // Idade no tooltip e anotações ficam.
      const proj = porId.get('apos-projecao')!;
      expect((proj.tooltip!.x as { formatter: Fn }).formatter(61)).toBe('Idade 61 anos');
      expect(JSON.stringify(proj.annotations)).toContain('Apos. 60');
      // Rentabilidade é % e fica visível.
      const rent = porId.get('apos-evol-rent')!;
      expect((eixoY(rent).labels!.formatter as Fn)(0.75)).toBe('0,75%');
      expect(tooltipY(rent)(0.756)).toBe('0,756%');
    },
  );

  it('olho aberto: eixos e tooltips de hoje, sem largura reservada', async () => {
    const porId = await graficos(false);
    const o = porId.get('apos-evol-patrimonio')!;
    expect((eixoY(o).labels!.formatter as Fn)(250000)).toBe('R$ 250 K');
    expect(eixoY(o).labels!.minWidth).toBeUndefined();
    expect(tooltipY(o)(1234.5)).toBe('R$ 1.234,50');
  });
});
