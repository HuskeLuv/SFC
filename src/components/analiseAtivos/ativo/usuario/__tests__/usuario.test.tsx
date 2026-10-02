// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import type { OverlayCarteiraResposta } from '@/types/analiseAtivosApi';

const mocks = vi.hoisted(() => ({
  auth: { actingClient: null as null | { id: string; name: string; email: string } },
  csrfFetch: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: mocks.csrfFetch }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
// O wizard real é pesado; aqui basta saber que abriu e com qual preset.
vi.mock('@/components/carteira/AddAssetWizard', () => ({
  default: ({ isOpen, preset }: { isOpen: boolean; preset: unknown }) =>
    isOpen ? <div data-testid="wizard">{JSON.stringify(preset)}</div> : null,
}));

import BarraPesoAlvo from '../BarraPesoAlvo';
import StatusSalvamento from '../StatusSalvamento';
import BlocoNaCarteira from '../BlocoNaCarteira';
import BlocoTese, { DEBOUNCE_TESE_MS } from '../BlocoTese';
import AcoesCarteiraAtivo from '../AcoesCarteiraAtivo';
import { useNaCarteiraAtivo } from '../useNaCarteiraAtivo';

// ---------------------------------------------------------------------------
// Fixtures: respostas dos endpoints da PRÓPRIA Carteira
// ---------------------------------------------------------------------------

const LINHA_WEGE = {
  id: 'pf-wege3',
  ticker: 'WEGE3',
  nome: 'WEG',
  quantidade: 120,
  precoAquisicao: 38.5,
  valorTotal: 4620,
  cotacaoAtual: 52.1,
  valorAtualizado: 6252,
  riscoPorAtivo: 17.2,
  percentualCarteira: 17.2,
  objetivo: 20,
  quantoFalta: 2.8,
  necessidadeAporte: 1017.79,
  rentabilidade: 38.12,
};
const LINHA_ITUB_PLANEJADA = {
  ...LINHA_WEGE,
  id: 'wl-itub4',
  ticker: 'ITUB4',
  planejado: true,
  quantidade: 0,
  valorAtualizado: 0,
  percentualCarteira: 0,
  objetivo: 5,
  quantoFalta: 5,
  necessidadeAporte: 1740,
};
const ABA_ACOES = {
  secoes: [{ nome: 'Value', ativos: [LINHA_WEGE, LINHA_ITUB_PLANEJADA] }],
  totalGeral: { valorAtualizado: 36349 },
};
const RESUMO = {
  totais: { dinheiro: 100_000, dinheiroMaisBens: 150_000 },
  distribuicao: {
    acoes: { valor: 21_900, percentual: 21.9 },
    fiis: { valor: 5000, percentual: 5 },
  },
};
const CONFIG = {
  configuracoes: [
    { categoria: 'acoes', minimo: 10, maximo: 30, target: 20 },
    { categoria: 'fiis', minimo: 0, maximo: 0, target: 0 },
  ],
};

let overlay: OverlayCarteiraResposta;
let tese: { corpo: string; atualizadoEm: string | null; visibilidade: 'privada' };
let fetchMock: ReturnType<typeof vi.fn>;

function roteador(url: string) {
  if (url.startsWith('/api/analise-ativos/carteira')) return mockFetchResponse(overlay);
  if (url.startsWith('/api/analise-ativos/teses/')) return mockFetchResponse(tese);
  if (url.startsWith('/api/carteira/acoes')) return mockFetchResponse(ABA_ACOES);
  if (url.startsWith('/api/carteira/resumo')) return mockFetchResponse(RESUMO);
  if (url.startsWith('/api/carteira/configuracao')) return mockFetchResponse(CONFIG);
  return mockFetchResponse({ error: 'não mockado' }, 500);
}

function comCliente(ui: React.ReactElement) {
  const client = createTestQueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mocks.auth.actingClient = null;
  mocks.csrfFetch.mockReset();
  overlay = {
    posicoes: { WEGE3: { portfolioId: 'pf-wege3', quantidade: 120, categoria: 'acoes' } },
    planejados: { ITUB4: { watchlistId: 'wl-itub4', categoria: 'acoes', objetivoPct: 5 } },
  };
  tese = { corpo: '', atualizadoEm: null, visibilidade: 'privada' };
  fetchMock = vi.fn(async (url: string) => roteador(url));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const urlsChamadas = () => fetchMock.mock.calls.map((c) => String(c[0]));

// ---------------------------------------------------------------------------

describe('BarraPesoAlvo', () => {
  it('role=img com rótulo completo e marcador de referência', () => {
    const { container } = render(
      <BarraPesoAlvo
        rotulo="Peso dentro de Ações"
        valor={17.2}
        referencia={20}
        rotuloReferencia="objetivo do ativo: 20%"
        status="faltam 2,8 p.p. para o objetivo"
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute(
      'aria-label',
      'Peso dentro de Ações: 17,20%, objetivo do ativo: 20%',
    );
    expect(container.querySelector('[data-marcador-referencia]')).not.toBeNull();
    expect(screen.getByText('faltam 2,8 p.p. para o objetivo')).toBeInTheDocument();
  });

  it('sem referência: sem marcador', () => {
    const { container } = render(
      <BarraPesoAlvo rotulo="X" valor={5} referencia={null} rotuloReferencia="sem alvo" />,
    );
    expect(container.querySelector('[data-marcador-referencia]')).toBeNull();
  });
});

describe('StatusSalvamento', () => {
  it('anuncia em aria-live e mostra a hora do salvamento', () => {
    const { rerender } = render(<StatusSalvamento id="s" estado="salvando" />);
    const live = document.getElementById('s')!;
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('Salvando…');
    rerender(<StatusSalvamento id="s" estado="salvo" salvoEm="2026-10-02T17:32:00.000Z" />);
    expect(live.textContent).toMatch(/^Salvo automaticamente às \d{2}:\d{2}$/);
  });

  it('erro: role=alert com "Tentar de novo"', () => {
    const tentar = vi.fn();
    render(<StatusSalvamento estado="erro" onTentarNovamente={tentar} />);
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent('Seu texto continua aqui');
    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }));
    expect(tentar).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

function SondaNaCarteira({ ticker }: { ticker: string }) {
  const d = useNaCarteiraAtivo(ticker, 'acao');
  return (
    <pre data-testid="sonda">
      {JSON.stringify({
        status: d.status,
        categoria: d.categoria,
        abaNome: d.abaNome,
        linha: d.linha,
        pctCarteira: d.pctCarteira,
        classePct: d.classePct,
        classeAlvo: d.classeAlvo,
        carregandoNumeros: d.carregandoNumeros,
      })}
    </pre>
  );
}
const sonda = () => JSON.parse(screen.getByTestId('sonda').textContent ?? '{}');

describe('useNaCarteiraAtivo', () => {
  it('valores IGUAIS à linha de /api/carteira/acoes; % da carteira = valor ÷ totais.dinheiro', async () => {
    comCliente(<SondaNaCarteira ticker="WEGE3" />);
    await waitFor(() => expect(sonda()).toMatchObject({ status: 'posicao', classeAlvo: 20 }));
    const s = sonda();
    expect(s.status).toBe('posicao');
    expect(s.categoria).toBe('acoes');
    expect(s.abaNome).toBe('Ações');
    expect(s.linha).toEqual(LINHA_WEGE);
    expect(s.pctCarteira).toBeCloseTo((6252 / 100_000) * 100, 10);
    expect(s.classePct).toBe(21.9);
    expect(s.classeAlvo).toBe(20);
    // mesmas rotas da Carteira; nenhum preço fora delas
    expect(urlsChamadas()).toEqual(
      expect.arrayContaining([
        '/api/analise-ativos/carteira',
        '/api/carteira/acoes',
        '/api/carteira/resumo',
        '/api/carteira/configuracao',
      ]),
    );
  });

  it('item MOVIDO para Stocks: aba Stocks, sem buscar a aba Ações', async () => {
    overlay.posicoes.WEGE3.categoria = 'stocks';
    comCliente(<SondaNaCarteira ticker="WEGE3" />);
    await waitFor(() => expect(sonda().status).toBe('posicao'));
    expect(sonda()).toMatchObject({ categoria: 'stocks', abaNome: 'Stocks', linha: null });
    expect(urlsChamadas()).not.toContain('/api/carteira/acoes');
    expect(urlsChamadas()).not.toContain('/api/carteira/resumo');
  });

  it('nada na carteira: não busca nada da Carteira', async () => {
    comCliente(<SondaNaCarteira ticker="PETR4" />);
    await waitFor(() => expect(sonda().status).toBe('nada'));
    expect(urlsChamadas()).toEqual(['/api/analise-ativos/carteira']);
  });
});

describe('BlocoNaCarteira', () => {
  const props = {
    classe: 'acao' as const,
    nome: 'WEG S.A.',
    assetId: 'a-wege',
    precoCabecalho: 52.1,
    precoData: '2026-09-29',
  };

  it('com posição: números formatados como a Carteira, barras com aria e links', async () => {
    comCliente(<BlocoNaCarteira ticker="WEGE3" {...props} />);
    await screen.findByText('R$ 6.252,00');
    expect(screen.getByText('6,25%')).toBeInTheDocument(); // % da carteira
    expect(screen.getByText('R$ 38,50')).toBeInTheDocument();
    expect(screen.getByText('38,12%')).toBeInTheDocument();
    expect(screen.getByText('20% da aba Ações')).toBeInTheDocument();
    const barras = screen.getAllByRole('img');
    expect(barras[0]).toHaveAttribute(
      'aria-label',
      'Peso dentro de Ações: 17,20%, objetivo do ativo: 20%',
    );
    expect(barras[1]).toHaveAttribute(
      'aria-label',
      'Ações no Planejamento: 21,90%, alvo da classe: 20%',
    );
    expect(screen.getByText('faltam 2,8 p.p. para o objetivo')).toBeInTheDocument();
    expect(screen.getByText('1,9 p.p. acima do alvo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver na Carteira' })).toHaveAttribute(
      'href',
      '/ativos/pf-wege3',
    );
    // cotação igual à do cabeçalho: sem nota
    expect(document.querySelector('[data-nota-cotacao]')).toBeNull();
  });

  it('cotação da Carteira diferente do cabeçalho: nota com a data', async () => {
    comCliente(<BlocoNaCarteira ticker="WEGE3" {...props} precoCabecalho={51} />);
    await screen.findByText('R$ 6.252,00');
    expect(document.querySelector('[data-nota-cotacao]')?.textContent).toContain('29/09/2026');
  });

  it('planejado: objetivo, quanto falta e edição do objetivo', async () => {
    comCliente(<BlocoNaCarteira ticker="ITUB4" {...props} />);
    await screen.findByText(/Planejado em Ações, com objetivo de 5% da aba/);
    await screen.findByText(/faltam R\$ 1\.740,00 para esse objetivo/);
    expect(screen.getByRole('button', { name: 'Editar objetivo' })).toBeInTheDocument();
  });

  it('sem nada: "Você não tem" + Planejar abre o wizard com preset de planejar', async () => {
    comCliente(<BlocoNaCarteira ticker="PETR4" {...props} />);
    await screen.findByText(/Você não tem PETR4/);
    fireEvent.click(screen.getByRole('button', { name: 'Planejar na Carteira' }));
    const wizard = await screen.findByTestId('wizard');
    expect(JSON.parse(wizard.textContent!)).toMatchObject({
      operacao: 'planejar',
      tipoAtivo: 'acoes-brasil',
      assetId: 'a-wege',
    });
  });
});

describe('AcoesCarteiraAtivo', () => {
  const base = { classe: 'acao' as const, nome: 'Ativo', assetId: 'a1' };

  it('sem posição: Planejar (primário) + Registrar; nunca "Comprar"', async () => {
    comCliente(<AcoesCarteiraAtivo ticker="PETR4" {...base} />);
    await screen.findByRole('button', { name: 'Planejar na Carteira' });
    expect(screen.getByRole('button', { name: 'Registrar operação' })).toBeInTheDocument();
    expect(screen.queryByText(/comprar/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar operação' }));
    expect(JSON.parse((await screen.findByTestId('wizard')).textContent!)).toMatchObject({
      operacao: 'compra',
      ativo: 'PETR4 - Ativo',
      acoesBrasilTipo: 'acao',
    });
  });

  it('com posição: Registrar + Ver na Carteira', async () => {
    comCliente(<AcoesCarteiraAtivo ticker="WEGE3" {...base} />);
    await screen.findByRole('link', { name: 'Ver na Carteira' });
    expect(screen.getByRole('button', { name: 'Registrar operação' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Planejar na Carteira' })).toBeNull();
  });

  it('consultor agindo: aviso no lugar dos botões', () => {
    mocks.auth.actingClient = { id: 'c', name: 'Cliente', email: 'c@x' };
    comCliente(<AcoesCarteiraAtivo ticker="WEGE3" {...base} />);
    expect(screen.getByText(/agindo pela carteira de um cliente/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('BlocoTese', () => {
  it('consultor agindo: card "pessoal" e NENHUMA leitura da tese', () => {
    mocks.auth.actingClient = { id: 'c', name: 'Cliente', email: 'c@x' };
    comCliente(<BlocoTese ticker="WEGE3" />);
    expect(screen.getByText(/saia do modo consultor/)).toBeInTheDocument();
    expect(urlsChamadas().some((u) => u.includes('/teses/'))).toBe(false);
  });

  it('vazia → escrever → autosave depois de 1,5 s → salva', async () => {
    mocks.csrfFetch.mockResolvedValue(
      mockFetchResponse({ atualizadoEm: '2026-10-02T17:32:00.000Z' }),
    );
    comCliente(<BlocoTese ticker="WEGE3" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Escrever minha tese' }));
    const campo = screen.getByLabelText('Sua tese sobre WEGE3');
    expect(campo).toHaveFocus();
    vi.useFakeTimers();
    fireEvent.change(campo, { target: { value: 'Tese da WEG' } });
    expect(screen.getByText('Alterações ainda não salvas')).toBeInTheDocument();
    expect(screen.getByText('11 de 10.000 caracteres')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(DEBOUNCE_TESE_MS - 100);
    });
    expect(mocks.csrfFetch).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    vi.useRealTimers();
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalledTimes(1));
    const [url, init] = mocks.csrfFetch.mock.calls[0];
    expect(url).toBe('/api/analise-ativos/teses/WEGE3');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ corpo: 'Tese da WEG' });
    await screen.findByText(/^Salvo automaticamente às/);
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));
    await screen.findByText('Tese da WEG');
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument();
  });

  it('salvar ao sair do campo (blur) sem esperar o debounce', async () => {
    mocks.csrfFetch.mockResolvedValue(
      mockFetchResponse({ atualizadoEm: '2026-10-02T17:32:00.000Z' }),
    );
    comCliente(<BlocoTese ticker="WEGE3" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Escrever minha tese' }));
    const campo = screen.getByLabelText('Sua tese sobre WEGE3');
    fireEvent.change(campo, { target: { value: 'abc' } });
    fireEvent.blur(campo);
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalledTimes(1));
  });

  it('erro ao salvar: texto preservado, alerta e "Tentar de novo"', async () => {
    mocks.csrfFetch
      .mockResolvedValueOnce(mockFetchResponse({ error: 'falhou' }, 500))
      .mockResolvedValueOnce(mockFetchResponse({ atualizadoEm: '2026-10-02T17:33:00.000Z' }));
    comCliente(<BlocoTese ticker="WEGE3" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Escrever minha tese' }));
    const campo = screen.getByLabelText('Sua tese sobre WEGE3') as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: 'texto importante' } });
    fireEvent.blur(campo);
    const alerta = await screen.findByRole('alert');
    expect(campo.value).toBe('texto importante');
    fireEvent.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }));
    await screen.findByText(/^Salvo automaticamente às/);
    expect(mocks.csrfFetch).toHaveBeenCalledTimes(2);
  });

  it('tese salva: mostra texto e data; apagar pede confirmação e usa DELETE', async () => {
    tese = {
      corpo: 'Tese antiga',
      atualizadoEm: '2026-09-28T17:32:00.000Z',
      visibilidade: 'privada',
    };
    mocks.csrfFetch.mockResolvedValue(mockFetchResponse({ ok: true }));
    comCliente(<BlocoTese ticker="WEGE3" />);
    await screen.findByText('Tese antiga');
    expect(screen.getByText(/^Salvo em 28\/09\/2026 às/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar tese' }));
    expect(screen.getByText(/Não dá para desfazer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apagar tese' }));
    await screen.findByRole('button', { name: 'Escrever minha tese' });
    expect(mocks.csrfFetch.mock.calls[0][1].method).toBe('DELETE');
  });
});
