// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import type { UseOrcamentoV2 } from '@/hooks/useOrcamentoV2';
import type { UseOrcamentoV2Estrutura } from '@/hooks/useOrcamentoV2Estrutura';
import {
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
  renderComValoresOcultos,
} from '@/test/valoresOcultos';
import type { OrcamentoV2Response } from '@/types/orcamentoV2';
import GraficoOrcamento, { GraficoOrcamentoCelular } from '../GraficoOrcamento';
import KpisOrcamento from '../KpisOrcamento';
import OrcamentoV2Cartoes from '../OrcamentoV2Cartoes';
import type { ConteudoOrcamentoV2Props } from '../OrcamentoV2Section';
import OrcamentoV2Tabela, { type OrcamentoV2TabelaProps } from '../OrcamentoV2Tabela';
import { montarPayload } from './payloadAnexoB';

/**
 * Esconder valores — Fase 2, Orçamento v2. O payload do Anexo B com todo valor em dinheiro trocado
 * pelos sentinelas (realizado = saldo, orçado = aplicado): com o olho fechado nenhuma representação
 * deles pode sobrar no texto, em title/aria-label nem no <title> das barras. Os % (consumo, ritmo,
 * índice de poupança, % da receita) continuam visíveis.
 */
const { saldo: REAL, aplicado: ORCADO } = SENTINELAS;
const ORCADO_TXT = '8.765.432,10';

function comSentinelas(base: OrcamentoV2Response = montarPayload()): OrcamentoV2Response {
  return {
    ...base,
    receitaPrevista: { ...base.receitaPrevista, valor: REAL },
    resumo: {
      ...base.resumo,
      orcado: ORCADO,
      realizado: REAL,
      disponivel: -REAL,
      sobraPrevista: REAL,
      orcadoObjetivos: ORCADO,
    },
    categorias: base.categorias.map((c, i) => ({
      ...c,
      orcado: ORCADO,
      realizado: REAL,
      diferenca: i % 2 ? REAL : -REAL,
      subcategorias: c.subcategorias.map((s, j) => {
        // A 1ª sub da 1ª categoria fica em % da receita: o campo segue visível, o "= R$" não.
        const emPct = i === 0 && j === 0;
        return {
          ...s,
          orcado: ORCADO,
          valor: emPct ? null : ORCADO,
          pct: emPct ? 12.5 : null,
          realizado: REAL,
          diferenca: j % 2 ? REAL : -REAL,
        };
      }),
    })),
  };
}

function propsTabela(data: OrcamentoV2Response): OrcamentoV2TabelaProps {
  return {
    data,
    onSalvarOrcado: vi.fn().mockResolvedValue(undefined),
    onMarcarFixa: vi.fn(),
    onSalvarRecolhidas: vi.fn(),
    onCriarSub: vi.fn().mockResolvedValue(undefined),
    onErroCriarSub: vi.fn(),
    onRenomearSub: vi.fn().mockResolvedValue(undefined),
    onBuscarImpacto: vi.fn(),
    onExcluirSub: vi.fn().mockResolvedValue(undefined),
  };
}

function propsCartoes(data: OrcamentoV2Response): ConteudoOrcamentoV2Props {
  return {
    data,
    loading: false,
    error: null,
    ano: data.ano,
    mes: data.mes,
    onMesChange: vi.fn(),
    visao: data.visao,
    onVisaoChange: vi.fn(),
    fonte: data.fonte,
    onFonteChange: vi.fn(),
    orcamento: {
      salvarOrcado: { mutateAsync: vi.fn().mockResolvedValue(undefined) },
      salvarPrefs: { mutate: vi.fn() },
    } as unknown as UseOrcamentoV2,
    estrutura: {} as UseOrcamentoV2Estrutura,
  };
}

describe('Orçamento v2 — esconder valores (olho fechado)', () => {
  it('KPIs: dinheiro vira pílula; % do orçado, ritmo e índice de poupança ficam', () => {
    const { container } = renderComValoresOcultos(<KpisOrcamento data={comSentinelas()} />);
    expectSemValoresExpostos(container);
    // receita, orçado, realizado, disponível, sobra prevista e objetivos
    expectPilulas(container);
    expect(container.querySelectorAll('.mf-sensivel').length).toBeGreaterThanOrEqual(6);
    expect(container.querySelector('[data-mf-kpi="realizado"]')).toHaveTextContent(/do orçado/);
    expect(container.querySelector('[data-mf-kpi="realizado"]')).toHaveTextContent(
      /\d+% do mês passou/,
    );
    expect(container.querySelector('[data-mf-kpi="indice"]')).toHaveTextContent(/\d+,\d%/);
  });

  it('tabela: orçado, realizado e diferença em pílula; consumo em % visível', () => {
    const data = comSentinelas();
    const { container } = renderComValoresOcultos(<OrcamentoV2Tabela {...propsTabela(data)} />);
    expectSemValoresExpostos(container);
    const total = container.querySelector('tr[data-mf-linha="total"]')!;
    expect(total.querySelectorAll('.mf-sensivel')).toHaveLength(3);
    // O consumo (fração do payload) continua em %.
    expect(container.querySelector('[data-mf-consumo]')).toHaveTextContent(/\d+%|—/);
    // Nenhum campo de orçado em R$ mostra o número parado; o de % continua um input.
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('tr.sub input'));
    expect(inputs.every((i) => i.value !== ORCADO_TXT)).toBe(true);
    expect(container.querySelectorAll('[data-mf-orcado-oculto]').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/em % da receita/)[0]).toHaveValue('12,5');
  });

  it('tabela: tocar na pílula do orçado abre o campo com o número; sair volta a pílula', () => {
    const data = comSentinelas();
    const { container } = renderComValoresOcultos(<OrcamentoV2Tabela {...propsTabela(data)} />);
    const sub = data.categorias[1].subcategorias[0];
    const linha = container.querySelector<HTMLElement>(`tr[data-item-id="${sub.id}"]`)!;
    const pilula = linha.querySelector<HTMLButtonElement>('[data-mf-orcado-oculto]')!;
    expect(pilula).toHaveAccessibleName(/valor oculto/);
    expect(pilula.getAttribute('aria-label')).not.toContain(ORCADO_TXT);

    act(() => pilula.click());
    const input = within(linha).getByRole('textbox', { name: /^Orçado de / });
    expect(input).toHaveValue(ORCADO_TXT);
    expect(input).toHaveFocus();
    expect(linha.querySelector('[data-mf-orcado-oculto]')).toBeNull();

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(within(linha).queryByRole('textbox', { name: /^Orçado de / })).toBeNull();
    expect(linha.querySelector('[data-mf-orcado-oculto]')).not.toBeNull();
    expectSemValoresExpostos(linha);
  });

  it('celular: herói, cartões, subcategorias e total sem dinheiro; % e ritmo visíveis', () => {
    const data = comSentinelas();
    const { container } = renderComValoresOcultos(<OrcamentoV2Cartoes {...propsCartoes(data)} />);
    // Abre o gráfico do celular também.
    fireEvent.click(screen.getByRole('button', { name: /Orçado × Real por categoria/ }));
    expectSemValoresExpostos(container);
    expectPilulas(container);
    const heroi = container.querySelector('[data-mf-orcamento-heroi]')!;
    expect(heroi).toHaveTextContent(/\d+% do mês passou/);
    expect(heroi.querySelector('[data-mf-heroi-realizado] .mf-sensivel')).not.toBeNull();
    expect(container.querySelectorAll('[data-mf-orcado-oculto]').length).toBeGreaterThan(0);
    // A sub em % mostra o % no campo e o "= R$" vira pílula.
    expect(screen.getAllByLabelText(/em % da receita/)[0]).toHaveValue('12,5');
  });

  it('gráfico do desktop: barras ficam, eixo sem rótulos e <title> mascarado', () => {
    const data = comSentinelas();
    const { container } = renderComValoresOcultos(
      <GraficoOrcamento
        data={{ ...data, prefs: { ...data.prefs, graficoVisivel: true } }}
        onAlternar={() => {}}
      />,
    );
    expectSemValoresExpostos(container);
    const svg = container.querySelector('svg[role="img"]')!;
    expect(svg.querySelectorAll('rect').length).toBe(data.categorias.length * 2);
    // Só os rótulos das categorias sobram como <text>.
    expect(svg.querySelectorAll('text')).toHaveLength(data.categorias.length);
    expect(svg.querySelector('title')!.textContent).toContain('R$ •••••');
  });

  it('gráfico do celular: o "real/orçado" vira uma pílula por categoria', () => {
    const data = comSentinelas();
    const { container } = renderComValoresOcultos(<GraficoOrcamentoCelular data={data} />);
    fireEvent.click(screen.getByRole('button', { name: /Orçado × Real por categoria/ }));
    expectSemValoresExpostos(container);
    const linhas = container.querySelectorAll('[data-mf-grafico-categoria]');
    expect(linhas.length).toBeGreaterThan(0);
    linhas.forEach((l) => expect(l.querySelectorAll('.mf-sensivel')).toHaveLength(1));
  });
});

describe('Orçamento v2 — olho aberto (igual a hoje)', () => {
  it('KPIs, tabela e cartões mostram os números, sem pílula e com os inputs', () => {
    const data = comSentinelas();
    const kpis = renderComValoresOcultos(<KpisOrcamento data={data} />, { ocultos: false });
    expectPilulas(kpis.container, 0);
    expect(kpis.container.querySelector('[data-mf-kpi="realizado"]')).toHaveTextContent(
      'R$ 9.876.543,21',
    );
    kpis.unmount();

    const tabela = renderComValoresOcultos(<OrcamentoV2Tabela {...propsTabela(data)} />, {
      ocultos: false,
    });
    expectPilulas(tabela.container, 0);
    expect(tabela.container.querySelector('[data-mf-orcado-oculto]')).toBeNull();
    expect(tabela.container.querySelector('tr[data-mf-linha="total"]')).toHaveTextContent(
      '8.765.432,10',
    );
    const sub = data.categorias[1].subcategorias[0];
    expect(
      tabela.container.querySelector<HTMLInputElement>(`tr[data-item-id="${sub.id}"] input`),
    ).toHaveValue(ORCADO_TXT);
    tabela.unmount();

    const cartoes = renderComValoresOcultos(<OrcamentoV2Cartoes {...propsCartoes(data)} />, {
      ocultos: false,
    });
    expectPilulas(cartoes.container, 0);
    expect(cartoes.container.querySelector('[data-mf-heroi-realizado]')).toHaveTextContent(
      'R$ 9.876.543,21',
    );
  });

  it('gráfico do desktop: eixo com os rótulos e <title> com os valores', () => {
    const data = comSentinelas();
    const { container } = renderComValoresOcultos(
      <GraficoOrcamento
        data={{ ...data, prefs: { ...data.prefs, graficoVisivel: true } }}
        onAlternar={() => {}}
      />,
      { ocultos: false },
    );
    const svg = container.querySelector('svg[role="img"]')!;
    expect(svg.querySelectorAll('text')).toHaveLength(data.categorias.length + 5);
    expect(svg.querySelector('title')!.textContent).toContain('R$ 8.765.432,10');
  });
});
