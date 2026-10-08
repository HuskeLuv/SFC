// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

const mockHooks = vi.hoisted(() => ({
  useFundamentosAtivo: vi.fn(),
  useValuationAtivo: vi.fn(),
}));
const mockPush = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useAnaliseAtivos', () => mockHooks);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

import BlocoFundamentosEssencial from '../BlocoFundamentosEssencial';
import BlocoValuationMultiplos from '../BlocoValuationMultiplos';
import BlocoMultiplosHistoricos from '../BlocoMultiplosHistoricos';
import BlocoPares from '../BlocoPares';
import BarraPosicao10a from '../BarraPosicao10a';
import CardMultiplo from '../CardMultiplo';
import ChipsGrupo from '../ChipsGrupo';
import { TEXTOS_TELA } from '@/services/analiseAtivos/textosTela';
import { TEXTOS_RAIO_X } from '@/services/analiseAtivos/textosRaioX';
import { MOTIVO_PER_SHARE } from '@/services/analiseAtivos/regras/conferencia/conferenciaAnual';
import {
  API_HGLG11,
  API_ITUB4,
  API_TGMA3,
  API_WEGE3,
  FUNDAMENTOS_WEGE3,
  VALUATION_WEGE3,
} from '@/test/fixtures/analiseAtivos/respostas';
import type {
  FundamentosResposta,
  ItemValuation,
  ValuationResposta,
} from '@/types/analiseAtivosApi';

const TV = TEXTOS_TELA.analise.valuation;

function consulta<T>(data: T | undefined, extra: Record<string, unknown> = {}) {
  return { data, isPending: data === undefined, isError: false, refetch: vi.fn(), ...extra };
}

const itemPl = VALUATION_WEGE3.grupos[0].itens[0];
const itemConf: ItemValuation = {
  ...itemPl,
  codigo: 'dy12m',
  rotulo: 'DY 12m',
  formato: 'pct',
  atual: { estado: 'ok', valor: 3.98 },
  barra: {
    visivel: false,
    min: null,
    media: null,
    max: null,
    nPontos: 9,
    statusTexto: TV.barraConferencia,
    extremo: null,
  },
};

const VALUATION: ValuationResposta = {
  ...VALUATION_WEGE3,
  grupos: [
    VALUATION_WEGE3.grupos[0],
    {
      codigo: 'proventos',
      rotulo: 'Proventos',
      resumo: 'Indicadores de proventos em conferência.',
      explicacao: null,
      itens: [itemConf],
    },
    {
      codigo: 'alavancagem',
      rotulo: 'Alavancagem',
      resumo: '',
      explicacao: TV.explicacaoFinanceira,
      itens: [],
    },
  ],
  pares: {
    criterio: TEXTOS_TELA.ativo.criterioParesAcao,
    itens: [API_WEGE3, API_ITUB4, API_TGMA3],
  },
};

const FUNDAMENTOS: FundamentosResposta = {
  ...FUNDAMENTOS_WEGE3,
  linhas: [
    {
      rotulo: '2024',
      ano: 2024,
      destaque: false,
      valores: {
        receita: { estado: 'ok', valor: 37987 },
        lucro: { estado: 'ausente', motivo: 'controladora_zero', texto: 'lucro da controladora' },
      },
      selos: [],
    },
    {
      rotulo: '2025',
      ano: 2025,
      destaque: true,
      valores: { receita: { estado: 'ok', valor: 40804 }, lucro: { estado: 'ok', valor: -664 } },
      selos: ['proventos_em_conferencia'],
    },
    {
      rotulo: 'Últ. 12m',
      ano: null,
      destaque: false,
      valores: { receita: { estado: 'ok', valor: 40130 }, lucro: { estado: 'ok', valor: 6254 } },
      selos: [],
    },
  ],
};

beforeEach(() => {
  mockHooks.useFundamentosAtivo.mockReset();
  mockHooks.useValuationAtivo.mockReset();
  mockPush.mockReset();
});

describe('BlocoFundamentosEssencial', () => {
  it('tabela com th scope=col/row, Ano fixa, último ano destacado e Últ. 12m', () => {
    mockHooks.useFundamentosAtivo.mockReturnValue(consulta(FUNDAMENTOS));
    render(<BlocoFundamentosEssencial ticker="WEGE3" classe="acao" />);
    const tabela = screen.getByRole('table');
    const cols = within(tabela).getAllByRole('columnheader');
    expect(cols.map((c) => c.getAttribute('scope'))).toEqual(['col', 'col', 'col']);
    expect(cols[0].className).toMatch(/sticky/);
    const linhas = within(tabela).getAllByRole('rowheader');
    expect(linhas.map((l) => l.textContent)).toEqual(['2024', '2025', 'Últ. 12m']);
    expect(linhas.every((l) => l.getAttribute('scope') === 'row')).toBe(true);
    expect(tabela.querySelector('[data-destaque]')?.textContent).toContain('2025');
    // ausente = '—' com o motivo no title; negativo com a cor de negativo
    expect(screen.getByTitle('lucro da controladora').textContent).toBe('—');
    expect(screen.getByText('−664').className).toMatch(/D92D20/);
    expect(screen.getByText(FUNDAMENTOS.notas[0])).toBeTruthy();
  });

  it('carregando e erro com "Tentar de novo"', () => {
    mockHooks.useFundamentosAtivo.mockReturnValue(consulta(undefined));
    const { rerender } = render(<BlocoFundamentosEssencial ticker="WEGE3" classe="acao" />);
    expect(screen.getByRole('status')).toBeTruthy();
    const refetch = vi.fn();
    mockHooks.useFundamentosAtivo.mockReturnValue(
      consulta(undefined, { isPending: false, isError: true, refetch }),
    );
    rerender(<BlocoFundamentosEssencial ticker="WEGE3" classe="acao" />);
    fireEvent.click(screen.getByRole('button', { name: TEXTOS_TELA.analise.tentarNovamente }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('BlocoFundamentosEssencial — decisão 1 do Bloco D (base por ação quebrada)', () => {
  it('LPA oculto: hachura + "—" + chip "em conferência" (sem o número na célula)', () => {
    const fund: FundamentosResposta = {
      ...FUNDAMENTOS_WEGE3,
      colunas: [
        { codigo: 'receita', rotulo: 'Receita', formato: 'moedaMi', fonteCvmAviso: false },
        { codigo: 'lpa', rotulo: 'LPA', formato: 'numero2', fonteCvmAviso: false },
      ],
      linhas: [
        {
          rotulo: '2024',
          ano: 2024,
          destaque: true,
          valores: {
            receita: { estado: 'ok', valor: 8173.6 },
            lpa: {
              estado: 'ausente',
              motivo: MOTIVO_PER_SHARE,
              texto: TEXTOS_RAIO_X.conferencia.saltoAcoes,
              exibicao: 'ocultar',
              valorNaoPublicado: -277.5,
            },
          },
          selos: [],
        },
      ],
    };
    mockHooks.useFundamentosAtivo.mockReturnValue(consulta(fund));
    render(<BlocoFundamentosEssencial ticker="CBAV3" classe="acao" />);
    const celula = screen.getByTitle(TEXTOS_RAIO_X.conferencia.saltoAcoes);
    expect(celula.getAttribute('data-conferencia')).toBe('acoes_escala');
    expect(celula.className).toMatch(/repeating-linear-gradient/);
    expect(celula.textContent).toContain('—');
    expect(celula.textContent).toContain(TEXTOS_TELA.conferencia.chip);
    expect(celula.textContent).not.toContain('277');
  });
});

describe('BlocoValuationMultiplos', () => {
  it('chips de grupo com aria-pressed trocam os cartões e o resumo', () => {
    mockHooks.useValuationAtivo.mockReturnValue(consulta(VALUATION));
    render(<BlocoValuationMultiplos ticker="WEGE3" classe="acao" />);
    const grupo = screen.getByRole('group', { name: TV.gruposRotulo });
    const chips = within(grupo).getAllByRole('button');
    expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    expect(screen.getByText(VALUATION.grupos[0].resumo)).toBeTruthy();
    fireEvent.click(chips[1]);
    expect(chips[1].getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(TV.barraConferencia)).toBeTruthy();
    fireEvent.click(chips[2]);
    expect(screen.getByText(TV.explicacaoFinanceira)).toBeTruthy();
    expect(document.querySelectorAll('[data-multiplo]')).toHaveLength(0);
  });

  it('nenhuma referência a índice de mercado na tela', () => {
    mockHooks.useValuationAtivo.mockReturnValue(consulta(VALUATION));
    const { container } = render(<BlocoValuationMultiplos ticker="WEGE3" classe="acao" />);
    expect(container.textContent).not.toMatch(/ibovespa|ifix|\bibov\b/i);
  });
});

describe('BarraPosicao10a e CardMultiplo', () => {
  it('barra visível: meter com aria-valuetext (mín, média, máx, atual e status)', () => {
    render(<BarraPosicao10a barra={itemPl.barra} atual={27.1} formato="multiplo" rotulo="P/L" />);
    const meter = screen.getByRole('meter');
    expect(meter.getAttribute('aria-valuetext')).toBe(
      'mín 22,0×; média 25,0×; máx 40,0×; atual 27,1× · +8% vs. média 10a',
    );
    expect(meter.getAttribute('aria-label')).toBe('P/L: Posição nos últimos 10 anos');
    expect(screen.getByText('+8% vs. média 10a')).toBeTruthy();
  });

  it('barra oculta: só o motivo, sem meter', () => {
    render(<BarraPosicao10a barra={itemConf.barra} atual={3.98} formato="pct" rotulo="DY 12m" />);
    expect(screen.queryByRole('meter')).toBeNull();
    expect(screen.getByText(TV.barraConferencia)).toBeTruthy();
  });

  it('cartão em conferência tem borda tracejada (forma, não cor) e mostra o valor real', () => {
    const { container } = render(<CardMultiplo item={itemConf} />);
    const card = container.querySelector('[data-multiplo="dy12m"]')!;
    expect(card.getAttribute('data-conferencia')).toBe('true');
    expect(card.className).toMatch(/border-dashed/);
    expect(card.textContent).toContain('3,98%');
  });

  it('valor ausente mostra o motivo em texto visível', () => {
    render(
      <CardMultiplo
        item={{
          ...itemPl,
          atual: { estado: 'ausente', motivo: 'prejuizo', texto: 'P/L não calculado: prejuízo' },
        }}
      />,
    );
    expect(screen.getByText('P/L não calculado: prejuízo')).toBeTruthy();
  });

  it('ChipsGrupo chama onSelecionar', () => {
    const on = vi.fn();
    render(
      <ChipsGrupo
        rotulo="Grupos"
        opcoes={[
          { codigo: 'a', rotulo: 'A' },
          { codigo: 'b', rotulo: 'B' },
        ]}
        selecionado="a"
        onSelecionar={on}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(on).toHaveBeenCalledWith('b');
  });
});

describe('BlocoMultiplosHistoricos', () => {
  it('mini-gráfico com figcaption e "Ver dados em tabela"', () => {
    const v: ValuationResposta = {
      ...VALUATION,
      historicos: [
        {
          codigo: 'pl',
          rotulo: 'P/L',
          formato: 'numero',
          media: 25,
          pontos: [2021, 2022, 2023, 2024, 2025].map((ano, i) => ({ ano, valor: 20 + i * 2 })),
        },
        { codigo: 'pvp', rotulo: 'P/VP', formato: 'numero2', media: null, pontos: [] },
      ],
    };
    mockHooks.useValuationAtivo.mockReturnValue(consulta(v));
    render(<BlocoMultiplosHistoricos ticker="WEGE3" classe="acao" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('média 25,0');
    expect(screen.getByText(TEXTOS_TELA.ativo.historicoInsuficiente)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: TEXTOS_TELA.ativo.verDadosTabela }));
    expect(screen.getAllByRole('rowheader').map((r) => r.textContent)).toEqual([
      '2021',
      '2022',
      '2023',
      '2024',
      '2025',
    ]);
  });
});

describe('BlocoPares', () => {
  it('próprio ativo primeiro e sem link; pares clicáveis; incompleto com asterisco', () => {
    mockHooks.useValuationAtivo.mockReturnValue(consulta(VALUATION));
    render(<BlocoPares ticker="WEGE3" classe="acao" />);
    const tabela = screen.getByRole('table');
    const linhas = within(tabela).getAllByRole('rowheader');
    expect(linhas[0].textContent).toContain('WEGE3');
    expect(within(linhas[0]).queryByRole('link')).toBeNull();
    const link = within(linhas[1]).getByRole('link', { name: 'ITUB4' });
    expect(link.getAttribute('href')).toBe('/analise-ativos/ITUB4');
    fireEvent.click(linhas[2].closest('tr')!);
    expect(mockPush).toHaveBeenCalledWith('/analise-ativos/TGMA3');
    expect(within(tabela).getByText(/\*$/)).toBeTruthy();
    expect(screen.getByText(TEXTOS_TELA.analise.pares.notaIncompleto)).toBeTruthy();
    expect(screen.getByText(TEXTOS_TELA.ativo.criterioParesAcao)).toBeTruthy();
  });

  it('sem pares: texto próprio', () => {
    mockHooks.useValuationAtivo.mockReturnValue(
      consulta({
        ...VALUATION,
        pares: { criterio: TEXTOS_TELA.ativo.criterioParesFii, itens: [API_HGLG11] },
      }),
    );
    render(<BlocoPares ticker="HGLG11" classe="fii" />);
    expect(screen.getByText(TEXTOS_TELA.ativo.semPares)).toBeTruthy();
  });
});
