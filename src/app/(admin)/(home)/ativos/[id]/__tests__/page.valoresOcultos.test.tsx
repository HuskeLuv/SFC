// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

/**
 * Esconder valores — detalhe do ativo (/ativos/[id], fatia 4). Fixture com os valores-sentinela:
 * com o olho fechado nenhum deles (nem R$/US$) pode aparecer; a última cotação fica. Com o olho
 * aberto, o HTML é idêntico ao de hoje (sem provider).
 */

const midia = vi.hoisted(() => ({ belowLg: false }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'ativo-1' }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/ativos/ativo-1',
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => midia.belowLg }));
vi.mock('@/components/auth/ProtectedRoute', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/hooks/useIndices', () => ({ useIndices: () => ({ indices: [], loading: false }) }));
vi.mock('@/hooks/useMoverOpcoes', () => ({ useMoverOpcoes: () => ({ data: null }) }));
vi.mock('@/hooks/useMoverInvestimento', () => ({
  useMoverInvestimento: () => ({ restaurar: vi.fn(), isPending: false }),
}));
// Gráficos (cobertos pelas fatias 2 e 3 e pelo teste do hook): fora deste teste.
vi.mock('@/components/charts/line/LineChartCarteiraHistorico', () => ({
  default: () => <div data-testid="grafico-historico" />,
}));
vi.mock('@/components/analises/RentabilidadeChart', () => ({
  default: () => <div data-testid="grafico-rentabilidade" />,
}));
vi.mock('@/icons', () => ({ ChevronDownIcon: () => <svg /> }));
vi.mock('@/components/carteira/mover/MoverInvestimento', () => ({ default: () => null }));
vi.mock('@/components/carteira/mover/AtivoNaCarteira', () => ({
  NaCarteiraCartao: () => null,
  NaCarteiraLinha: () => null,
}));

import AtivoDetalhePage from '../page';
import {
  ComValoresOcultos,
  SENTINELAS,
  expectPilulas,
  expectSemValoresExpostos,
} from '@/test/valoresOcultos';

const COTACAO = 'R$ 12,34';
const PROVENTO_TOTAL = 4321.09;

const fixture = (moeda?: 'USD') => ({
  ativo: { nome: 'Empresa Sentinela', ticker: 'SENT3', instituicao: { id: 'i', nome: 'XP' } },
  posicao: {
    quantidade: SENTINELAS.quantidade,
    precoMedio: SENTINELAS.precoMedio,
    valorAplicado: SENTINELAS.aplicado,
    saldoBruto: SENTINELAS.saldo,
    rentabilidade: 12.5,
    resultado: 1111111.11,
    rentabilidadePreco: 10,
    resultadoPreco: 999999.99,
    proventosRecebidos: PROVENTO_TOTAL,
    cotacaoAtual: 12.34,
    ...(moeda
      ? {
          moeda,
          cotacaoDolar: 5.4321,
          taxaData: '2026-10-30',
          valorAplicadoBRL: 2222222.22,
          saldoBrutoBRL: 3333333.33,
        }
      : {}),
  },
  transacoes: [
    {
      id: 't1',
      tipoOperacao: 'Compra',
      quantity: SENTINELAS.quantidade,
      price: SENTINELAS.precoMedio,
      total: SENTINELAS.aplicado,
      date: '2025-01-10T00:00:00.000Z',
      fees: null,
      notes: null,
    },
  ],
  historicoPatrimonio: [
    {
      data: Date.UTC(2025, 0, 31),
      valorAplicado: SENTINELAS.aplicado,
      saldoBruto: SENTINELAS.saldo,
    },
  ],
  historicoTWR: [{ date: Date.UTC(2025, 0, 31), value: 12.5 }],
  proventos: [
    {
      data: '2025-01-20T00:00:00.000Z',
      tipo: 'Dividendo',
      valorTotal: PROVENTO_TOTAL,
      quantidade: SENTINELAS.quantidade,
    },
  ],
  fundamentos: { pl: 8.5, beta: 1.1, dividendYield: '5,2%' },
});

const SENTINELAS_DA_TELA = [
  ...Object.values(SENTINELAS),
  1111111.11,
  999999.99,
  PROVENTO_TOTAL,
  2222222.22,
  3333333.33,
];

function stubAtivo(moeda?: 'USD') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => fixture(moeda) }),
  );
}

async function renderPagina(modo: 'sem-provider' | 'aberto' | 'fechado') {
  const ui = <AtivoDetalhePage />;
  const resultado =
    modo === 'sem-provider'
      ? render(ui)
      : render(ui, {
          wrapper: ({ children }) => (
            <ComValoresOcultos ocultos={modo === 'fechado'}>{children}</ComValoresOcultos>
          ),
        });
  await screen.findByText('Extrato');
  return resultado.container;
}

beforeEach(() => {
  midia.belowLg = false;
  stubAtivo();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each([
  ['computador', false],
  ['celular', true],
])('/ativos/[id] (%s) com o olho fechado', (_nome, belowLg) => {
  beforeEach(() => {
    midia.belowLg = belowLg;
  });

  it('nenhum valor da posição exposto; a última cotação fica', async () => {
    const container = await renderPagina('fechado');
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_DA_TELA });
    expectPilulas(container);
    const cotacao = within(container).getAllByText(COTACAO);
    expect(cotacao.length).toBeGreaterThan(0);
    cotacao.forEach((el) => expect(el.closest('[data-mf-valor-visivel]')).not.toBeNull());
    // Percentuais ficam (decisão 2).
    expect(container).toHaveTextContent('12.50%');
  });

  it('quantidade em pílula curta e preço médio em pílula', async () => {
    const container = await renderPagina('fechado');
    const rotulo = (texto: string) =>
      within(container).getAllByText(texto, { selector: 'p, dt' })[0];
    const valorDe = (texto: string) => {
      const el = rotulo(texto);
      return (el.tagName === 'DT' ? el.nextElementSibling : el.parentElement?.nextElementSibling)!;
    };
    expect(valorDe('Quantidade').querySelector('.mf-sensivel.mf-sensivel--curto')).not.toBeNull();
    const precoMedio = valorDe('Preço médio').querySelector('.mf-sensivel');
    expect(precoMedio).not.toBeNull();
    expect(precoMedio?.classList.contains('mf-sensivel--curto')).toBe(false);
  });

  it('posição em US$: saldo/custo em R$ somem; a linha do câmbio fica', async () => {
    stubAtivo('USD');
    const container = await renderPagina('fechado');
    expectSemValoresExpostos(container, { sentinelas: SENTINELAS_DA_TELA });
    if (belowLg) {
      expect(container).toHaveTextContent('US$ 1 = R$ 5,4321');
    }
  });
});

describe('/ativos/[id] com o olho aberto', () => {
  it.each([
    ['computador', false],
    ['celular', true],
  ])('%s: HTML idêntico ao de hoje (sem provider) e valores à mostra', async (_n, belowLg) => {
    midia.belowLg = belowLg;
    const hoje = (await renderPagina('sem-provider')).innerHTML;
    cleanup();
    const aberto = await renderPagina('aberto');
    expect(aberto.innerHTML).toBe(hoje);
    expect(aberto).toHaveTextContent('9.876.543,21');
    expectPilulas(aberto, 0);
  });
});
