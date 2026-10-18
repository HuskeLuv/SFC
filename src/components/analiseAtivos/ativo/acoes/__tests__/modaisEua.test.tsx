// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import { TEXTOS_EUA } from '@/services/analiseAtivos/textosEua';
import type { OverlayCarteiraResposta } from '@/types/analiseAtivosApi';

/**
 * Stocks e REITs na página do ativo (feature EUA, fatia D): Registrar operação com o corpo do
 * wizard (US$ + câmbio), sem preço exibido; recompra no Asset manual da posição (sem 2º Asset);
 * Planejar sem Asset de catálogo; "Na sua carteira" com o mesmo valor da aba Stocks.
 */

const mocks = vi.hoisted(() => ({
  csrfFetch: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ actingClient: null }) }));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: mocks.csrfFetch }) }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => false,
  useMediaQuery: () => false,
}));
vi.mock('@/components/carteira/mover/moverToast', () => ({ mostrarToastMover: mocks.toast }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/carteira/AddAssetWizard', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="wizard" /> : null),
}));
vi.mock('@/components/carteira/wizard/shared/InstitutionPicker', () => ({
  default: ({
    selectedName,
    onChange,
  }: {
    selectedName: string;
    onChange: (v: { id: string; nome: string }) => void;
  }) => (
    <div>
      <span data-testid="instituicao">{selectedName}</span>
      <button type="button" onClick={() => onChange({ id: 'inst-btg', nome: 'BTG Pactual' })}>
        Escolher BTG
      </button>
    </div>
  ),
}));

import BarraAcoesAtivo from '../BarraAcoesAtivo';
import ModalRegistrarOperacao from '../ModalRegistrarOperacao';
import ModalPlanejar from '../ModalPlanejar';
import BlocoNaCarteira from '@/components/analiseAtivos/ativo/usuario/BlocoNaCarteira';

const LINHA_BRKB = {
  id: 'pf-brkb',
  ticker: 'BRKB',
  quantidade: 3,
  precoAquisicao: 2420,
  cotacaoAtual: 2500,
  valorAtualizado: 7500,
  percentualCarteira: 75,
  objetivo: 0,
  quantoFalta: 0,
  necessidadeAporte: 0,
  rentabilidade: 3.3,
};
const ABA_STOCKS = {
  cotacaoDolar: 5.4,
  secoes: [
    {
      nome: 'Growth',
      ativos: [LINHA_BRKB, { ...LINHA_BRKB, id: 'pf-msft', ticker: 'MSFT', valorAtualizado: 2500 }],
    },
  ],
};
const RESUMO = {
  totais: { dinheiro: 100_000 },
  distribuicao: { stocks: { valor: 54_000, percentual: 54 } },
};
const POSICAO_BRKB = {
  ativo: { nome: 'BRK.B', ticker: 'BRKB', instituicao: { id: 'inst-xp', nome: 'XP' } },
  posicao: {
    quantidade: 3,
    precoMedio: 2420,
    valorAplicado: 7260,
    saldoBruto: 7500,
    rentabilidade: 3.3,
    resultado: 240,
    proventosRecebidos: 0,
    cotacaoAtual: 2500,
  },
  transacoes: [
    {
      id: 't1',
      tipoOperacao: 'Aporte',
      quantity: 3,
      price: 2420,
      total: 7260,
      date: '2026-09-02T00:00:00.000Z',
      notes: JSON.stringify({ operation: { instituicaoId: 'inst-xp' } }),
    },
  ],
};

let overlay: OverlayCarteiraResposta;
let fetchMock: ReturnType<typeof vi.fn>;

function roteador(url: string) {
  if (url.startsWith('/api/analise-ativos/carteira')) return mockFetchResponse(overlay);
  if (url.startsWith('/api/analise-ativos/config'))
    return mockFetchResponse({ habilitada: true, recursos: { eua: true } });
  if (url.startsWith('/api/carteira/stocks')) return mockFetchResponse(ABA_STOCKS);
  if (url.startsWith('/api/carteira/reit'))
    return mockFetchResponse({ cotacaoDolar: 5.4, secoes: [] });
  if (url.startsWith('/api/carteira/resumo')) return mockFetchResponse(RESUMO);
  if (url.startsWith('/api/carteira/configuracao'))
    return mockFetchResponse({ configuracoes: [{ categoria: 'stocks', target: 50 }] });
  if (url.startsWith('/api/ativos/pf-brkb')) return mockFetchResponse(POSICAO_BRKB);
  return mockFetchResponse({ error: 'não mockado' }, 500);
}

function comCliente(ui: React.ReactElement) {
  const client = createTestQueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const ultimoCorpo = () => JSON.parse(mocks.csrfFetch.mock.calls.at(-1)![1].body as string);
const ultimaUrl = () => mocks.csrfFetch.mock.calls.at(-1)![0] as string;

beforeEach(() => {
  mocks.csrfFetch.mockReset();
  mocks.csrfFetch.mockResolvedValue(mockFetchResponse({ success: true }, 201));
  mocks.toast.mockReset();
  overlay = {
    posicoes: {
      'BRK.B': {
        portfolioId: 'pf-brkb',
        quantidade: 3,
        categoria: 'stocks',
        objetivoPct: null,
        estrategia: 'growth',
        tipoFii: null,
        assetId: 'a-brkb',
        tipoAsset: 'stock',
      },
    },
    planejados: {},
  };
  fetchMock = vi.fn(async (url: string) => roteador(String(url)));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const baseRegistrar = {
  aberto: true,
  onFechar: () => {},
  nome: 'Ativo',
  preco: null,
  fiiTipo: null,
  assetId: null,
};

const preencher = (rotulo: RegExp | string, valor: string) =>
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

describe('Registrar operação — Stocks/REITs', () => {
  it('stock sem posição: preço US$ em branco, câmbio da Carteira, corpo do wizard com STOCK-MANUAL', async () => {
    comCliente(<ModalRegistrarOperacao {...baseRegistrar} ticker="AAPL" classe="stock" />);
    await screen.findByText('Sem posição atual');
    const preco = screen.getByLabelText(/Preço por ação/) as HTMLInputElement;
    expect(preco.value).toBe('');
    expect(screen.getByText(TEXTOS_EUA.carteira.semPrecoRegistrar)).toBeInTheDocument();
    const cambio = screen.getByLabelText(TEXTOS_EUA.cotacao.cambio) as HTMLInputElement;
    await waitFor(() => expect(cambio.value).toBe('5,40'));
    expect(screen.getByText('Na Carteira: Stocks · Value (dá para mover depois)')).toBeVisible();
    expect(screen.queryByText(/catálogo da Carteira/)).toBeNull();
    preencher(/Quantidade/, '2');
    preencher(/Preço por ação/, '200');
    fireEvent.change(cambio, { target: { value: '5,5' } });
    // total em R$: 2 × 200 × 5,5
    expect(document.querySelector('[data-resumo-operacao]')!.textContent).toMatch(/R\$\s2\.200,00/);
    fireEvent.click(screen.getByRole('button', { name: 'Escolher BTG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalledTimes(1));
    expect(ultimaUrl()).toBe('/api/carteira/operacao');
    expect(ultimoCorpo()).toEqual({
      tipoAtivo: 'stock',
      assetId: 'STOCK-MANUAL',
      ativo: 'AAPL',
      instituicaoId: 'inst-btg',
      dataCompra: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      quantidade: 2,
      cotacaoUnitaria: 200,
      cotacaoMoeda: 5.5,
      moeda: 'USD',
      valorInvestido: 2200,
      taxaCorretagem: 0,
      estrategia: 'value',
    });
  });

  it('RECOMPRA de BRK.B: manda o Asset manual da posição (não cria outro), na seção da posição', async () => {
    comCliente(<ModalRegistrarOperacao {...baseRegistrar} ticker="BRK.B" classe="stock" />);
    await screen.findByText('Na Carteira: Stocks · Growth (dá para mover depois)');
    // PM como a aba Stocks mostra (US$)
    await screen.findByText(/PM US\$\s2\.420,00/);
    await waitFor(() => expect(screen.getByTestId('instituicao')).toHaveTextContent('XP'));
    preencher(/Quantidade/, '1');
    preencher(/Preço por ação/, '450');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalledTimes(1));
    expect(ultimoCorpo()).toMatchObject({
      tipoAtivo: 'stock',
      assetId: 'a-brkb',
      ativo: 'BRK.B',
      estrategia: 'growth',
      instituicaoId: 'inst-xp',
      cotacaoMoeda: 5.4,
    });
  });

  it('REIT sem posição: REIT-MANUAL, valor em US$ e estrategiaReit', async () => {
    overlay.posicoes = {};
    comCliente(<ModalRegistrarOperacao {...baseRegistrar} ticker="O" classe="reit" />);
    await screen.findByText('Sem posição atual');
    await waitFor(() =>
      expect((screen.getByLabelText(TEXTOS_EUA.cotacao.cambio) as HTMLInputElement).value).toBe(
        '5,40',
      ),
    );
    preencher(/Quantidade/, '10');
    preencher(/Preço por ação/, '57,5');
    fireEvent.click(screen.getByRole('button', { name: 'Escolher BTG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalledTimes(1));
    expect(ultimoCorpo()).toMatchObject({
      tipoAtivo: 'reit',
      assetId: 'REIT-MANUAL',
      ativo: 'O',
      cotacaoUnitaria: 57.5,
      cotacaoMoeda: 5.4,
      valorInvestido: 575,
      estrategiaReit: 'value',
    });
  });

  it('câmbio vazio: erro no campo e nada enviado', async () => {
    overlay.posicoes = {};
    comCliente(<ModalRegistrarOperacao {...baseRegistrar} ticker="AAPL" classe="stock" />);
    await screen.findByText('Sem posição atual');
    const cambio = screen.getByLabelText(TEXTOS_EUA.cotacao.cambio);
    await waitFor(() => expect((cambio as HTMLInputElement).value).toBe('5,40'));
    fireEvent.change(cambio, { target: { value: '' } });
    preencher(/Quantidade/, '2');
    preencher(/Preço por ação/, '200');
    fireEvent.click(screen.getByRole('button', { name: 'Escolher BTG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText(TEXTOS_EUA.carteira.cambioInvalido)).toBeInTheDocument();
    expect(mocks.csrfFetch).not.toHaveBeenCalled();
  });

  it('pela barra: sem o link do formulário completo (o wizard não tem preset EUA)', async () => {
    comCliente(
      <BarraAcoesAtivo ticker="BRK.B" classe="stock" nome="BRK.B" assetId={null} preco={null} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar operação' }));
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: 'abrir o formulário completo' })).toBeNull();
  });
});

describe('Planejar — Stocks/REITs sem Asset de catálogo', () => {
  it('sem posição: grava pela rota do alvo do ticker, com a seção', async () => {
    overlay.posicoes = {};
    mocks.csrfFetch.mockResolvedValue(
      mockFetchResponse({
        ticker: 'AAPL',
        criado: true,
        alvo: {
          origem: 'planejado',
          id: 'wl-aapl',
          objetivoPct: 10,
          categoria: 'stocks',
          abaNome: 'Stocks',
          secao: 'value',
        },
      }),
    );
    comCliente(
      <ModalPlanejar
        aberto
        onFechar={() => {}}
        ticker="AAPL"
        classe="stock"
        nome="AAPL"
        assetId={null}
        preco={null}
      />,
    );
    const campo = await screen.findByLabelText('Peso-alvo dentro de Stocks (%)');
    fireEvent.change(campo, { target: { value: '10' } });
    const salvar = screen.getByRole('button', { name: 'Salvar na Carteira' });
    await waitFor(() => expect(salvar).not.toBeDisabled());
    fireEvent.click(salvar);
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalledTimes(1));
    expect(ultimaUrl()).toBe('/api/analise-ativos/alvos/AAPL');
    expect(ultimoCorpo()).toEqual({ objetivoPct: 10, secao: 'value' });
  });
});

describe('Na sua carteira — Stocks', () => {
  it('BRK.B: os números da aba Stocks (US$), % da carteira em R$ e a nota do mesmo valor', async () => {
    const { container } = comCliente(
      <BlocoNaCarteira
        ticker="BRK.B"
        classe="stock"
        nome="Berkshire"
        assetId={null}
        precoCabecalho={null}
        precoData={null}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-na-carteira="posicao"]')).not.toBeNull(),
    );
    await screen.findByText(/US\$\s7\.500,00/);
    expect(screen.getByText(/US\$\s2\.420,00/)).toBeInTheDocument();
    // 7.500 × 5,40 ÷ 100.000 = 40,50%
    expect(screen.getByText('40,50%')).toBeInTheDocument();
    expect(screen.getByText('Mesmo valor da aba Stocks da Carteira.')).toBeInTheDocument();
  });
});
