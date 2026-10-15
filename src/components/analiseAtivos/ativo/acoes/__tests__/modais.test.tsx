// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import { esperarDomLimpo } from '@/test/utils/varrerDom';
import { queryKeys } from '@/lib/queryKeys';
import { TEXTOS_OPERACAO } from '@/services/analiseAtivos/textosAcoesCarteira';
import type { OverlayCarteiraResposta } from '@/types/analiseAtivosApi';

const mocks = vi.hoisted(() => ({
  auth: { actingClient: null as null | { id: string; name: string; email: string } },
  csrfFetch: vi.fn(),
  celular: false,
  toast: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: mocks.csrfFetch }) }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => mocks.celular,
  useMediaQuery: () => mocks.celular,
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
  default: ({ isOpen, preset }: { isOpen: boolean; preset: unknown }) =>
    isOpen ? <div data-testid="wizard">{JSON.stringify(preset)}</div> : null,
}));
// O seletor real de instituição é um autocomplete com busca; aqui basta escolher uma.
vi.mock('@/components/carteira/wizard/shared/InstitutionPicker', () => ({
  default: ({
    selectedName,
    onChange,
    error,
  }: {
    selectedName: string;
    onChange: (v: { id: string; nome: string }) => void;
    error?: string;
  }) => (
    <div>
      <span data-testid="instituicao">{selectedName}</span>
      <button type="button" onClick={() => onChange({ id: 'inst-btg', nome: 'BTG Pactual' })}>
        Escolher BTG
      </button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  ),
}));

import BarraAcoesAtivo, { ChipsCarteira } from '../BarraAcoesAtivo';
import ModalRegistrarOperacao, { lerNumero, lerQuantidade } from '../ModalRegistrarOperacao';
import ModalPlanejar from '../ModalPlanejar';
import ModalVerNaCarteira from '../ModalVerNaCarteira';
import ModalComparar from '../ModalComparar';
import BlocoNaCarteira from '@/components/analiseAtivos/ativo/usuario/BlocoNaCarteira';

// ---------------------------------------------------------------------------
// Fixtures: as rotas reais da Carteira (caso 33 da spec: WEGE3, 120 ações a R$ 52,30 = R$ 6.276
// = 3,8% da carteira TOTAL → totais.dinheiro = 6.276 ÷ 0,038 ≈ R$ 165.158)
// ---------------------------------------------------------------------------

const PRECO = 52.3;
const TOTAL_CARTEIRA = 6276 / 0.038;
let linhaWege: Record<string, unknown>;
let overlay: OverlayCarteiraResposta;
let fetchMock: ReturnType<typeof vi.fn>;

function abaAcoes() {
  return {
    secoes: [
      {
        nome: 'Growth',
        ativos: [
          linhaWege,
          {
            id: 'pf-outras',
            ticker: 'OUTR3',
            quantidade: 1,
            precoAquisicao: 1,
            cotacaoAtual: 158_882,
            valorAtualizado: 158_882, // 165.158 − 6.276
            percentualCarteira: 96.2,
            objetivo: 0,
            quantoFalta: 0,
            necessidadeAporte: 0,
            rentabilidade: 0,
          },
        ],
      },
    ],
  };
}
const ABA_FII = {
  secoes: [
    {
      nome: 'Papel',
      ativos: [
        {
          id: 'wl-kncr',
          ticker: 'KNCR11',
          quantidade: 0,
          precoAquisicao: 0,
          cotacaoAtual: 0,
          valorAtualizado: 0,
          percentualCarteira: 0,
          objetivo: 10,
          quantoFalta: 10,
          necessidadeAporte: 0,
          rentabilidade: 0,
          planejado: true,
        },
        {
          id: 'pf-mxrf',
          ticker: 'MXRF11',
          quantidade: 100,
          precoAquisicao: 10,
          cotacaoAtual: 10,
          valorAtualizado: 1000,
          percentualCarteira: 100,
          objetivo: 0,
          quantoFalta: 0,
          necessidadeAporte: 0,
          rentabilidade: 0,
        },
      ],
    },
  ],
};
const RESUMO = {
  totais: { dinheiro: TOTAL_CARTEIRA },
  distribuicao: {
    acoes: { valor: 165_158, percentual: 33 },
    fiis: { valor: 1000, percentual: 0.2 },
  },
};
const CONFIG = { configuracoes: [{ categoria: 'acoes', target: 35 }] };
const POSICAO_WEGE = {
  ativo: {
    nome: 'WEG',
    ticker: 'WEGE3',
    instituicao: { id: 'inst-xp', nome: 'XP Investimentos' },
  },
  posicao: {
    quantidade: 120,
    precoMedio: 38.5,
    valorAplicado: 4620,
    saldoBruto: 6276,
    rentabilidade: 41.2,
    resultado: 1904,
    proventosRecebidos: 248,
    cotacaoAtual: PRECO,
  },
  transacoes: [
    {
      id: 't2',
      tipoOperacao: 'Aporte',
      quantity: 20,
      price: 40,
      total: 800,
      date: '2026-03-02T00:00:00.000Z',
      notes: JSON.stringify({ operation: { instituicaoId: 'inst-xp' } }),
    },
    {
      id: 't1',
      tipoOperacao: 'Aporte',
      quantity: 100,
      price: 38.2,
      total: 3820,
      date: '2025-05-02T00:00:00.000Z',
      notes: JSON.stringify({ operation: { instituicaoId: 'inst-xp' } }),
    },
  ],
};
const SUGESTOES = {
  ticker: 'WEGE3',
  janela: 5,
  itens: ['EMBJ3', 'MOTV3', 'TUPY3', 'AAAA3', 'ZZZZ3'].map((t, i) => ({
    ticker: t,
    nome: `Empresa ${t}`,
    mesmoSetor: i < 3,
    metrica: { rotulo: 'P/L', valor: { estado: 'ok', valor: 10 + i }, formato: 'multiplo' },
    criterios: { n: 3, de: 6 },
  })),
};

function roteador(url: string) {
  if (url.startsWith('/api/analise-ativos/carteira')) return mockFetchResponse(overlay);
  if (url.startsWith('/api/analise-ativos/config'))
    return mockFetchResponse({ habilitada: true, recursos: { comparador: true } });
  if (url.includes('/comparar-sugestoes')) return mockFetchResponse(SUGESTOES);
  if (url.startsWith('/api/analise-ativos/ativos/KNCR11'))
    return mockFetchResponse({ classe: 'fii', tags: ['FII de tijolo'], cotacao: { preco: 100 } });
  if (url.startsWith('/api/carteira/acoes')) return mockFetchResponse(abaAcoes());
  if (url.startsWith('/api/carteira/fii')) return mockFetchResponse(ABA_FII);
  if (url.startsWith('/api/carteira/resumo')) return mockFetchResponse(RESUMO);
  if (url.startsWith('/api/carteira/configuracao')) return mockFetchResponse(CONFIG);
  if (url.startsWith('/api/ativos/pf-wege3')) return mockFetchResponse(POSICAO_WEGE);
  if (url.startsWith('/api/ativos/price-at')) return mockFetchResponse({}, 404);
  return mockFetchResponse({ error: 'não mockado' }, 500);
}

let client: ReturnType<typeof createTestQueryClient>;
function comCliente(ui: React.ReactElement) {
  client = createTestQueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const dialogo = () => screen.getByRole('dialog');
const ultimoCorpo = () => JSON.parse(mocks.csrfFetch.mock.calls.at(-1)![1].body as string);
const ultimaUrl = () => mocks.csrfFetch.mock.calls.at(-1)![0] as string;
const OPERACAO = { textosOperacao: Object.values(TEXTOS_OPERACAO) };

beforeEach(() => {
  mocks.auth.actingClient = null;
  mocks.celular = false;
  mocks.csrfFetch.mockReset();
  mocks.csrfFetch.mockResolvedValue(mockFetchResponse({ success: true }, 201));
  mocks.toast.mockReset();
  linhaWege = {
    id: 'pf-wege3',
    ticker: 'WEGE3',
    quantidade: 120,
    precoAquisicao: 38.5,
    cotacaoAtual: PRECO,
    valorAtualizado: 6276,
    percentualCarteira: 3.8,
    objetivo: 0,
    quantoFalta: 0,
    necessidadeAporte: 0,
    rentabilidade: 41.2,
  };
  overlay = {
    posicoes: {
      WEGE3: {
        portfolioId: 'pf-wege3',
        quantidade: 120,
        categoria: 'acoes',
        objetivoPct: null,
        estrategia: 'growth',
        tipoFii: null,
      },
    },
    planejados: {
      KNCR11: {
        watchlistId: 'wl-kncr',
        id: 'wl-kncr',
        categoria: 'fiis',
        objetivoPct: 10,
        secao: 'tvm',
      },
    },
  };
  fetchMock = vi.fn(async (url: string) => roteador(String(url)));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Registrar operação (rec. 2)
// ---------------------------------------------------------------------------

const baseRegistrar = {
  aberto: true,
  onFechar: () => {},
  nome: 'Ativo',
  preco: PRECO,
  fiiTipo: null,
};

async function preencher(qtd: string) {
  fireEvent.change(screen.getByLabelText(/Quantidade/), { target: { value: qtd } });
}

describe('ModalRegistrarOperacao', () => {
  it('compra NOVA de ação: seção automática Value (sem campo); payload exato; CSRF e invalidação', async () => {
    comCliente(
      <ModalRegistrarOperacao {...baseRegistrar} ticker="PETR4" classe="acao" assetId="a-petr" />,
    );
    await screen.findByText('Sem posição atual');
    expect(screen.queryByLabelText(/Seção na Carteira/)).toBeNull();
    expect(dialogo().querySelector('select')).toBeNull();
    expect(
      screen.getByText('Na Carteira: Ações · Value (dá para mover depois)'),
    ).toBeInTheDocument();
    const invalidar = vi.spyOn(client, 'invalidateQueries');
    await preencher('10');
    fireEvent.click(screen.getByRole('button', { name: 'Escolher BTG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalledTimes(1));
    expect(ultimaUrl()).toBe('/api/carteira/operacao');
    expect(mocks.csrfFetch.mock.calls[0][1].method).toBe('POST');
    expect(ultimoCorpo()).toEqual({
      tipoAtivo: 'acao',
      assetId: 'a-petr',
      ativo: 'PETR4',
      instituicaoId: 'inst-btg',
      dataCompra: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      quantidade: 10,
      cotacaoUnitaria: PRECO,
      valorInvestido: 523,
      taxaCorretagem: 0,
      estrategia: 'value',
    });
    // invalidatePortfolioDerivedQueries: carteira, ativos e o overlay da análise
    await waitFor(() => {
      const keys = invalidar.mock.calls.map((c) => JSON.stringify(c[0]?.queryKey));
      expect(keys).toContain(JSON.stringify(queryKeys.analiseAtivos.carteira()));
      expect(keys).toContain(JSON.stringify(queryKeys.carteira.all));
      expect(keys).toContain(JSON.stringify(queryKeys.assets.all));
    });
    expect(mocks.toast).toHaveBeenCalled();
  });

  it('resumo ao vivo: total, nova posição e novo preço médio', async () => {
    comCliente(
      <ModalRegistrarOperacao {...baseRegistrar} ticker="WEGE3" classe="acao" assetId="a-wege" />,
    );
    await screen.findByText(/Na Carteira: Ações · Growth/);
    await screen.findByText(/PM R\$\s38,50/);
    await preencher('10');
    const resumo = document.querySelector('[data-resumo-operacao]')!;
    // 10 × 52,30 = 523,00; 130 ações; (120 × 38,50 + 523) ÷ 130 = 39,56
    expect(resumo.textContent).toMatch(/R\$\s523,00/);
    expect(resumo.textContent).toContain('130 ações');
    expect(resumo.textContent).toMatch(/R\$\s39,56/);
  });

  it("quantidade no formato brasileiro: '1.000' grava 1.000 ações, nunca 1", async () => {
    expect(lerQuantidade('1.000')).toBe(1000);
    expect(lerQuantidade('2.500')).toBe(2500);
    expect(lerQuantidade('1.000.000')).toBe(1_000_000);
    expect(lerQuantidade('1.000,00')).toBe(1000);
    expect(lerQuantidade('120')).toBe(120);
    expect(lerQuantidade('1.5')).toBe(1.5); // não inteiro: a validação recusa
    expect(lerNumero('52.30')).toBe(52.3); // preço segue aceitando ponto decimal
    comCliente(
      <ModalRegistrarOperacao {...baseRegistrar} ticker="WEGE3" classe="acao" assetId="a-wege" />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('instituicao')).toHaveTextContent('XP Investimentos'),
    );
    await preencher('1.000');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalled());
    expect(ultimoCorpo()).toMatchObject({ quantidade: 1000 });
  });

  it('RECOMPRA: seção da posição (Growth), sem campo, e já vem com a instituição', async () => {
    comCliente(
      <ModalRegistrarOperacao {...baseRegistrar} ticker="WEGE3" classe="acao" assetId="a-wege" />,
    );
    expect(
      await screen.findByText('Na Carteira: Ações · Growth (dá para mover depois)'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Seção na Carteira/)).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId('instituicao')).toHaveTextContent('XP Investimentos'),
    );
    await preencher('5');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalled());
    expect(ultimoCorpo()).toMatchObject({
      tipoAtivo: 'acao',
      estrategia: 'growth',
      instituicaoId: 'inst-xp',
      quantidade: 5,
    });
  });

  it('compra de PLANEJADO FII: seção do plano (tvm), não a da CVM (tijolo)', async () => {
    comCliente(
      <ModalRegistrarOperacao
        {...baseRegistrar}
        ticker="KNCR11"
        classe="fii"
        assetId="a-kncr"
        preco={100}
        fiiTipo="tijolo"
      />,
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-secao-automatica]')?.getAttribute('data-secao-automatica'),
      ).toBe('tvm'),
    );
    expect(document.querySelector('[data-secao-automatica]')!.textContent).toMatch(
      /^Na Carteira: .+ · Papel \(TVM\) \(dá para mover depois\)$/,
    );
    await preencher('3');
    fireEvent.click(screen.getByRole('button', { name: 'Escolher BTG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalled());
    expect(ultimoCorpo()).toMatchObject({ tipoAtivo: 'fii', tipoFii: 'tvm', assetId: 'a-kncr' });
    expect(ultimoCorpo()).not.toHaveProperty('estrategia');
  });

  it.each([
    ['tijolo', 'tijolo', 'Tijolo'],
    ['papel', 'tvm', 'Papel (TVM)'],
    ['fof', 'fofi', 'Fundo de fundos'],
  ] as const)('FII novo %s → seção %s (automática)', async (fiiTipo, secao, rotulo) => {
    comCliente(
      <ModalRegistrarOperacao
        {...baseRegistrar}
        ticker="HGLG11"
        classe="fii"
        assetId="a-hglg"
        fiiTipo={fiiTipo}
      />,
    );
    expect(
      await screen.findByText(`Na Carteira: FIIs · ${rotulo} (dá para mover depois)`),
    ).toBeInTheDocument();
    expect(document.querySelector('[data-secao-automatica]')).toHaveAttribute(
      'data-secao-automatica',
      secao,
    );
    await preencher('2');
    fireEvent.click(screen.getByRole('button', { name: 'Escolher BTG' }));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalled());
    expect(ultimoCorpo()).toMatchObject({ tipoAtivo: 'fii', tipoFii: secao });
  });

  it('VENDA: resgate SEM instituicaoId (da última aquisição); sem seção; nunca acima da posição', async () => {
    comCliente(
      <ModalRegistrarOperacao {...baseRegistrar} ticker="WEGE3" classe="acao" assetId="a-wege" />,
    );
    await screen.findByText(/Na Carteira: Ações · Growth/);
    fireEvent.click(screen.getByRole('button', { name: 'Venda' }));
    expect(screen.queryByText(/Na Carteira:/)).toBeNull();
    expect(await screen.findByText('XP Investimentos (da última aquisição)')).toBeInTheDocument();

    await preencher('121');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(
      await screen.findByText('Você tem 120 ações; a operação não pode passar disso.'),
    ).toBeInTheDocument();
    expect(mocks.csrfFetch).not.toHaveBeenCalled();

    await preencher('20');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalled());
    expect(ultimaUrl()).toBe('/api/carteira/resgate');
    expect(ultimoCorpo()).toEqual({
      portfolioId: 'pf-wege3',
      dataResgate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      metodoResgate: 'quantidade',
      quantidade: 20,
      cotacaoUnitaria: PRECO,
    });
    expect(ultimoCorpo()).not.toHaveProperty('instituicaoId');
  });

  it('Venda indisponível sem posição (com o motivo)', async () => {
    comCliente(
      <ModalRegistrarOperacao {...baseRegistrar} ticker="PETR4" classe="acao" assetId="a-petr" />,
    );
    const venda = await screen.findByRole('button', { name: 'Venda' });
    expect(venda).toBeDisabled();
    expect(venda).toHaveAccessibleDescription('Disponível quando houver posição.');
  });

  it.each([
    'Campos obrigatórios: tipoAtivo, instituicaoId',
    'Instituição inválida para este investimento',
  ])('erro 400 real da rota aparece no modal: %s', async (mensagem) => {
    mocks.csrfFetch.mockResolvedValue(mockFetchResponse({ error: mensagem }, 400));
    comCliente(
      <ModalRegistrarOperacao {...baseRegistrar} ticker="WEGE3" classe="acao" assetId="a-wege" />,
    );
    await screen.findByText(/Na Carteira: Ações · Growth/);
    await waitFor(() =>
      expect(screen.getByTestId('instituicao')).toHaveTextContent('XP Investimentos'),
    );
    await preencher('1');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }));
    expect(await screen.findByText(`Não foi possível registrar: ${mensagem}`)).toBeInTheDocument();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('caso 32: varrerDom limpo na compra e na venda (Compra/Venda pela lista própria)', async () => {
    comCliente(
      <ModalRegistrarOperacao {...baseRegistrar} ticker="WEGE3" classe="acao" assetId="a-wege" />,
    );
    await screen.findByText(/Na Carteira: Ações · Growth/);
    esperarDomLimpo(dialogo(), OPERACAO);
    fireEvent.click(screen.getByRole('button', { name: 'Venda' }));
    await screen.findByText('XP Investimentos (da última aquisição)');
    esperarDomLimpo(dialogo(), OPERACAO);
  });

  it('todos os botões e campos com 44 px (min-h-11)', async () => {
    comCliente(
      <ModalRegistrarOperacao {...baseRegistrar} ticker="WEGE3" classe="acao" assetId="a-wege" />,
    );
    await screen.findByText(/Na Carteira: Ações · Growth/);
    for (const el of within(dialogo()).getAllByRole('button')) {
      if (el.textContent === 'Escolher BTG') continue; // mock do seletor
      expect(el.className, el.textContent ?? '').toMatch(/min-h-11|h-11/);
    }
  });

  it('campos com 48 px e fonte de 16 px no celular (sem zoom do iOS), 44/14 no computador', async () => {
    comCliente(
      <ModalRegistrarOperacao {...baseRegistrar} ticker="WEGE3" classe="acao" assetId="a-wege" />,
    );
    await screen.findByText(/Na Carteira: Ações · Growth/);
    const campos = dialogo().querySelectorAll<HTMLElement>(
      'input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]), select',
    );
    expect(campos.length).toBeGreaterThan(0);
    for (const el of campos) {
      expect(el.className, el.getAttribute('name') ?? el.id).toMatch(/\bmin-h-12\b/);
      expect(el.className).toMatch(/\btext-base\b/);
      expect(el.className).toMatch(/\blg:min-h-11\b/);
    }
  });
});

// ---------------------------------------------------------------------------
// Planejar na carteira (rec. 1, caso 33)
// ---------------------------------------------------------------------------

describe('ModalPlanejar — caso 33 na base da carteira total (planning_asset_targets)', () => {
  const props = {
    aberto: true,
    onFechar: () => {},
    ticker: 'WEGE3',
    classe: 'acao' as const,
    nome: 'WEG',
    assetId: 'a-wege',
    preco: PRECO,
  };

  /** Rota do alvo falsa: grava/apaga em overlay.alvos (como o servidor faria). */
  function rotaAlvoFalsa() {
    mocks.csrfFetch.mockImplementation(async (url: string, init: RequestInit) => {
      const t = url.split('/').pop()!;
      if (init.method === 'PUT') {
        const { targetPct } = JSON.parse(String(init.body));
        const alvo = { targetPct, atualizadoEm: '2026-10-15T12:00:00.000Z' };
        overlay.alvos = { ...(overlay.alvos ?? {}), [t]: alvo };
        return mockFetchResponse({ ticker: t, alvo });
      }
      const alvos = { ...(overlay.alvos ?? {}) };
      const removido = !!alvos[t];
      delete alvos[t];
      overlay.alvos = alvos;
      return mockFetchResponse({ ticker: t, removido });
    });
  }

  it('campo em branco (ex.: 5); resumo ao vivo: R$ 9.909 · 189 ações · −2,2 p.p. (R$ 3.633 · 69 ações)', async () => {
    comCliente(<ModalPlanejar {...props} />);
    await screen.findByText(/120 ações · 3,8% da carteira · R\$ 6\.276/);
    const campo = screen.getByLabelText('Peso-alvo na carteira (%)') as HTMLInputElement;
    expect(campo.value).toBe('');
    expect(campo.placeholder).toBe('ex.: 5');
    expect(dialogo().textContent).toContain('Planejar na carteira · WEGE3');
    expect(dialogo().textContent).toContain(
      'Informe o peso-alvo para ver a diferença em relação à sua posição atual.',
    );
    fireEvent.change(campo, { target: { value: '6' } });
    const resumo = document.querySelector('[data-resumo-plano]')!;
    expect(resumo.textContent).toContain('R$ 9.909');
    expect(resumo.textContent).toContain('189');
    expect(resumo.textContent).toContain('−2,2 p.p. (R$ 3.633 · 69 ações)');
    expect(dialogo().textContent).toContain('Classe no Planejamento');
    expect(dialogo().textContent).toContain('Ações · 33,0% da carteira (alvo da classe: 35%)');
    expect(dialogo().textContent).not.toMatch(/faltam|compre/i);
    // sem Seção: o alvo não cria Watchlist
    expect(dialogo().querySelector('select')).toBeNull();
    esperarDomLimpo(dialogo());
  });

  it('salvar → PUT do alvo, chip "Planejado" e card 6,0%; remover → DELETE, chip some; Carteira intacta', async () => {
    rotaAlvoFalsa();
    function Tela() {
      const [aberto, setAberto] = React.useState(true);
      return (
        <>
          <div data-testid="chips">
            <ChipsCarteira ticker="WEGE3" classe="acao" />
          </div>
          <BlocoNaCarteira
            ticker="WEGE3"
            classe="acao"
            nome="WEG"
            assetId="a-wege"
            precoCabecalho={PRECO}
            precoData="2026-10-10"
          />
          <button type="button" onClick={() => setAberto(true)}>
            reabrir
          </button>
          <ModalPlanejar {...props} aberto={aberto} onFechar={() => setAberto(false)} />
        </>
      );
    }
    comCliente(<Tela />);
    await screen.findByText(/120 ações · 3,8% da carteira/);
    expect(within(screen.getByTestId('chips')).queryByText('Planejado')).toBeNull();
    fireEvent.change(screen.getByLabelText('Peso-alvo na carteira (%)'), {
      target: { value: '6' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar no Planejamento' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(ultimaUrl()).toBe('/api/analise-ativos/alvos/WEGE3');
    expect(mocks.csrfFetch.mock.calls[0][1].method).toBe('PUT');
    expect(ultimoCorpo()).toEqual({ targetPct: 6 });
    expect(await within(screen.getByTestId('chips')).findByText('Planejado')).toBeInTheDocument();
    const card = () => document.querySelector('[data-na-carteira="posicao"]')!;
    await waitFor(() => expect(card().textContent).toContain('alvo planejado por você: 6,0%'));
    expect(card().textContent).toContain('posição atual 3,8%');
    expect(card().textContent).toContain('desvio −2,2 p.p. (R$ 3.633)');
    expect(card().textContent).not.toMatch(/faltam|compre/i);

    fireEvent.click(screen.getByRole('button', { name: 'reabrir' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Ajustar plano · WEGE3');
    await waitFor(() =>
      expect((screen.getByLabelText('Peso-alvo na carteira (%)') as HTMLInputElement).value).toBe(
        '6',
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remover do plano' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(ultimaUrl()).toBe('/api/analise-ativos/alvos/WEGE3');
    expect(mocks.csrfFetch.mock.calls.at(-1)![1].method).toBe('DELETE');
    await waitFor(() => expect(card().textContent).toContain('sem alvo planejado'));
    await waitFor(() =>
      expect(within(screen.getByTestId('chips')).queryByText('Planejado')).toBeNull(),
    );
    // Carteira intacta: o Planejar nunca chama /objetivo nem /planejados
    const urls = [
      ...mocks.csrfFetch.mock.calls.map((c) => String(c[0])),
      ...fetchMock.mock.calls.map((c) => String(c[0])),
    ];
    expect(urls.some((u) => /\/objetivo|\/planejados/.test(u))).toBe(false);
  });

  it('Objetivo da aba > 0: linha informativa no card e no modal; não acende o chip', async () => {
    linhaWege.objetivo = 25;
    overlay.posicoes.WEGE3.objetivoPct = 25;
    comCliente(
      <>
        <div data-testid="chips">
          <ChipsCarteira ticker="WEGE3" classe="acao" />
        </div>
        <BlocoNaCarteira
          ticker="WEGE3"
          classe="acao"
          nome="WEG"
          assetId="a-wege"
          precoCabecalho={PRECO}
          precoData="2026-10-10"
        />
        <ModalPlanejar {...props} />
      </>,
    );
    await waitFor(() => expect(document.querySelectorAll('[data-objetivo-aba]').length).toBe(2));
    for (const el of document.querySelectorAll('[data-objetivo-aba]')) {
      expect(el.textContent).toBe('Objetivo na aba Ações da Carteira: 25%');
    }
    // o campo do alvo não herda o Objetivo da aba
    expect((screen.getByLabelText('Peso-alvo na carteira (%)') as HTMLInputElement).value).toBe('');
    expect(within(screen.getByTestId('chips')).queryByText('Planejado')).toBeNull();
  });

  it('ativo só com alvo (sem posição): card com o alvo e o valor equivalente', async () => {
    overlay.alvos = { PETR4: { targetPct: 5, atualizadoEm: '2026-10-15T12:00:00.000Z' } };
    comCliente(
      <BlocoNaCarteira
        ticker="PETR4"
        classe="acao"
        nome="Petrobras"
        assetId="a-petr"
        precoCabecalho={30}
        precoData="2026-10-10"
      />,
    );
    const card = await waitFor(() => {
      const el = document.querySelector('[data-na-carteira="planejado"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(card.textContent).toContain('Você não tem PETR4');
    expect(card.textContent).toContain('alvo planejado por você: 5,0%');
    // 5% × 165.157,89 = R$ 8.258 (resumo carregado só por causa do alvo)
    await waitFor(() =>
      expect(card.querySelector('[data-valor-alvo]')!.textContent).toBe(
        'Valor equivalente ao alvo: R$ 8.258',
      ),
    );
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContain('/api/carteira/resumo');
    expect(card.textContent).not.toMatch(/faltam|compre/i);
  });

  it('fora de (0, 100] mostra o erro e não grava; "12,5" grava 12.5', async () => {
    rotaAlvoFalsa();
    comCliente(
      <ModalPlanejar {...props} ticker="KNCR11" classe="fii" assetId="a-kncr" preco={100} />,
    );
    const campo = (await screen.findByLabelText(/Peso-alvo na carteira/)) as HTMLInputElement;
    // o Objetivo do plano antigo (10% da aba) não vira o alvo: o campo começa em branco
    expect(campo.value).toBe('');
    for (const v of ['120', '0', '-1']) {
      fireEvent.change(campo, { target: { value: v } });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar no Planejamento' }));
      expect(await screen.findByText('Informe um peso-alvo entre 0 e 100%.')).toBeInTheDocument();
    }
    expect(mocks.csrfFetch).not.toHaveBeenCalled();
    fireEvent.change(campo, { target: { value: '12,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar no Planejamento' }));
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalled());
    expect(ultimaUrl()).toBe('/api/analise-ativos/alvos/KNCR11');
    expect(ultimoCorpo()).toEqual({ targetPct: 12.5 });
  });
});

// ---------------------------------------------------------------------------
// Ver na Carteira e Comparar
// ---------------------------------------------------------------------------

describe('ModalVerNaCarteira', () => {
  const props = { aberto: true, onFechar: () => {}, classe: 'acao' as const, nome: 'X' };

  it('com posição e alvo: alvo planejado (% da carteira) e desvio na base total', async () => {
    overlay.alvos = { WEGE3: { targetPct: 6, atualizadoEm: '2026-10-15T12:00:00.000Z' } };
    comCliente(<ModalVerNaCarteira {...props} ticker="WEGE3" assetId="a-wege" />);
    await screen.findByText('120 ações');
    await waitFor(() => expect(dialogo().textContent).toContain('6,0% da carteira'));
    expect(dialogo().textContent).toContain('posição 3,8% · desvio −2,2 p.p.');
  });

  it('com posição: GET /api/ativos/[id], números, operações e link da Carteira completa', async () => {
    comCliente(<ModalVerNaCarteira {...props} ticker="WEGE3" assetId="a-wege" />);
    await screen.findByText('120 ações');
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContain('/api/ativos/pf-wege3');
    expect(dialogo().textContent).toContain('R$ 6.276');
    expect(dialogo().textContent).toContain('+41,2%');
    expect(within(dialogo()).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Abrir Carteira completa' })).toHaveAttribute(
      'href',
      '/ativos/pf-wege3',
    );
    esperarDomLimpo(dialogo(), OPERACAO);
  });

  it('sem posição: "Você ainda não tem" e o alvo planejado, se houver', async () => {
    overlay.alvos = { KNCR11: { targetPct: 4, atualizadoEm: '2026-10-15T12:00:00.000Z' } };
    comCliente(<ModalVerNaCarteira {...props} ticker="KNCR11" classe="fii" assetId="a-k" />);
    expect(
      await screen.findByText(
        'Você ainda não tem KNCR11 na carteira. Há um alvo planejado de 4,0% da carteira no seu Planejamento.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Abrir Carteira completa' })).toBeNull();
  });
});

describe('ModalComparar', () => {
  const props = { aberto: true, onFechar: () => {}, classe: 'acao' as const, nome: 'WEG' };

  it('sugestões; escolher até 3; "Abrir comparador" com o ativo no 1º slot (não grava)', async () => {
    comCliente(<ModalComparar {...props} ticker="WEGE3" />);
    expect(dialogo()).toHaveTextContent('Comparar WEGE3 com até 3 ações');
    await screen.findByText('EMBJ3');
    expect(screen.getByRole('button', { name: 'Abrir comparador' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    for (const t of ['EMBJ3', 'MOTV3', 'TUPY3']) {
      fireEvent.click(document.querySelector(`[data-sugestao="${t}"]`)!);
    }
    expect(document.querySelector('[data-sugestao="AAAA3"]')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('link', { name: 'Abrir comparador' })).toHaveAttribute(
      'href',
      '/analise-ativos/comparador?t=WEGE3,EMBJ3,MOTV3,TUPY3',
    );
    expect(screen.getByText('4 de 4 selecionados')).toBeInTheDocument();
    expect(mocks.csrfFetch).not.toHaveBeenCalled();
    esperarDomLimpo(dialogo());
  });
});

// ---------------------------------------------------------------------------
// Barra de ações: modais, Esc/foco, BottomSheet, consultor
// ---------------------------------------------------------------------------

describe('BarraAcoesAtivo', () => {
  const props = {
    ticker: 'WEGE3',
    classe: 'acao' as const,
    nome: 'WEG',
    assetId: 'a-wege',
    preco: PRECO,
    fiiTipo: null,
  };

  it('Comparar · Planejar · Ver · Registrar (único primário); Esc fecha e devolve o foco', async () => {
    comCliente(<BarraAcoesAtivo {...props} />);
    const comparar = await screen.findByRole('button', {
      name: 'Comparar WEGE3 com outros ativos',
    });
    expect(comparar).toBeInTheDocument();
    const registrar = screen.getByRole('button', { name: 'Registrar operação' });
    registrar.focus();
    fireEvent.click(registrar);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Registrar operação · WEGE3');
    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(registrar);
  });

  it('Ver na Carteira → "Registrar operação" troca de modal', async () => {
    comCliente(<BarraAcoesAtivo {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver na Carteira' }));
    await screen.findByText('120 ações');
    fireEvent.click(within(dialogo()).getByRole('button', { name: 'Registrar operação' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Registrar operação · WEGE3');
  });

  it('celular: os modais são BottomSheet', async () => {
    mocks.celular = true;
    comCliente(<BarraAcoesAtivo {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Planejar na carteira' }));
    const painel = await screen.findByRole('dialog');
    expect(painel).toHaveAttribute('data-mf-sheet');
  });

  it('consultor agindo: pode Registrar e Planejar, com o aviso da carteira do cliente', async () => {
    mocks.auth.actingClient = { id: 'c', name: 'Maria Cliente', email: 'm@x' };
    comCliente(<BarraAcoesAtivo {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar operação' }));
    expect(
      await screen.findByText('Você está alterando a carteira de Maria Cliente.'),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Planejar na carteira' }));
    expect(
      await screen.findByText('Você está alterando a carteira de Maria Cliente.'),
    ).toBeInTheDocument();
  });

  it('"abrir o formulário completo" abre o wizard da Carteira com o ativo', async () => {
    comCliente(<BarraAcoesAtivo {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar operação' }));
    fireEvent.click(await screen.findByRole('button', { name: 'abrir o formulário completo' }));
    const wizard = await screen.findByTestId('wizard');
    expect(JSON.parse(wizard.textContent!)).toMatchObject({
      operacao: 'compra',
      tipoAtivo: 'acoes-brasil',
      assetId: 'a-wege',
    });
  });
});
