// @vitest-environment jsdom
/**
 * Bloco 1 (fatia B): entradas do Comparador — sem os recursos, nada novo aparece; com salvos, os
 * DOIS "Salvar comparação" (barra e Leitura dos dados) mandam os tickers na ordem dos slots +
 * janela + tipo do FII; 201 "Comparação X salva." (+ Ver salvas), 200 "Comparação atualizada";
 * já salva → "Comparação salva ✓" (aria-pressed) abre as Comparações salvas; consultor
 * desabilitado. Varredura de DOM com as flags ligadas.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import { esperarDomLimpo } from '@/test/utils/varrerDom';
import { LEITURA_DOS_DADOS } from '@/services/analiseAtivos/textosLiterais';
import { LIMITES_SALVOS } from '@/services/analiseAtivos/salvos/contrato';
import {
  CRITERIOS_LINHA_ITUB4,
  CRITERIOS_LINHA_WEGE3,
} from '@/test/fixtures/analiseAtivos/criterios';
import { CRITERIA_PARAMS_V2 } from '@/services/analiseAtivos/params/criteriaParamsV2';
import type { ComparadorResposta } from '@/types/analiseAtivosBlocoD';
import type { ComparacaoSalvaApi, ComparacoesResposta } from '@/types/analiseAtivosSalvos';

const m = vi.hoisted(() => ({
  query: 't=ITUB4,WEGE3&janela=10',
  celular: false,
  dados: undefined as unknown,
  config: { data: undefined as unknown },
  acting: null as null | { id: string; name: string },
  csrfFetch: vi.fn(),
  toast: vi.fn((_d: unknown) => 1),
  push: vi.fn(),
  salvas: [] as unknown[],
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: m.push }),
  usePathname: () => '/analise-ativos/comparador',
  useSearchParams: () => new URLSearchParams(m.query),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('@/hooks/useMediaQuery', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useIsBelowLg: () => m.celular,
}));
vi.mock('@/hooks/useAnaliseAtivosBlocoD', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useComparador: () => ({
    data: m.dados,
    isError: false,
    isFetching: false,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/useAnaliseAtivos', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useIndiceBusca: () => ({ data: undefined }),
  useOverlayCarteira: () => ({ data: undefined }),
  useAnaliseAtivosConfig: () => m.config,
}));
vi.mock('@/components/analiseAtivos/quadro/CelulaNaCarteira', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useNaCarteira: () => ({ fonte: null, info: () => ({ tipo: 'nenhum' }), conjunto: new Set() }),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ actingClient: m.acting }) }));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: m.csrfFetch }) }));
vi.mock('@/components/carteira/mover/moverToast', () => ({ mostrarToastMover: m.toast }));

import Comparador from '@/components/analiseAtivos/comparador/Comparador';
import BotaoSalvarComparacao from '@/components/analiseAtivos/comparador/BotaoSalvarComparacao';

const ok = (valor: number) => ({ estado: 'ok' as const, valor });
function ativo(
  ticker: string,
  nome: string,
  criterios: ComparadorResposta['ativos'][number]['criterios'],
) {
  return {
    ticker,
    nome,
    preco: ok(40),
    precoData: '2026-10-10',
    fiiTipo: null,
    tipoComparacao: 'acao' as const,
    criterios,
    noQuadro: true,
    foraDoQuadroMotivo: null,
    conferencias: [],
    pares: [],
  };
}
const DADOS: ComparadorResposta = {
  classe: 'acao',
  janela: 10,
  tickers: ['ITUB4', 'WEGE3'],
  ignorados: [],
  misto: false,
  ativos: [
    ativo('ITUB4', 'Itaú Unibanco', CRITERIOS_LINHA_ITUB4),
    ativo('WEGE3', 'WEG', CRITERIOS_LINHA_WEGE3),
  ],
  criterios: {
    rotulos: Object.fromEntries(CRITERIA_PARAMS_V2.perfis.acao.map((c) => [c.id, c.rotulo])),
    equivalencias: {},
  },
  grupos: [],
  graficos: null,
  leitura: {
    janela: 10,
    contagens: [
      { ticker: 'ITUB4', n: 2, de: 6 },
      { ticker: 'WEGE3', n: 5, de: 6 },
    ],
    texto: LEITURA_DOS_DADOS.texto,
  },
  versao: 'c2:x',
} as unknown as ComparadorResposta;

const SALVA: ComparacaoSalvaApi = {
  id: '11111111-2222-4333-8444-555555555555',
  nome: 'Bancos e indústria',
  classe: 'acao',
  tickers: ['WEGE3', 'ITUB4'],
  janela: 10,
  tipoFii: null,
  href: '/analise-ativos/comparador?t=WEGE3,ITUB4&janela=10',
  atualizadoEm: '2026-10-15T12:00:00.000Z',
};

function ligar({ salvos = true, pdf = false } = {}) {
  m.config = {
    data: {
      habilitada: true,
      recursos: {
        raioX: false,
        cenarios: false,
        comparador: true,
        salvos,
        alertas: false,
        pdfComparador: pdf,
      },
    },
  };
}

function comCliente(ui: React.ReactElement) {
  return render(<QueryClientProvider client={createTestQueryClient()}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  m.query = 't=ITUB4,WEGE3&janela=10';
  m.celular = false;
  m.dados = DADOS;
  m.acting = null;
  m.config = { data: undefined };
  m.salvas = [];
  m.csrfFetch.mockReset();
  m.toast.mockReset();
  m.push.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      mockFetchResponse({
        comparacoes: m.salvas,
        limites: LIMITES_SALVOS,
        podeSalvar: !m.acting,
        motivoSemSalvar: m.acting ? 'consultor' : null,
      } satisfies ComparacoesResposta),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('Comparador — entradas do bloco 1', () => {
  it('sem os recursos: nem Salvar comparação, nem Comparações salvas, nem Exportar PDF', () => {
    ligar({ salvos: false, pdf: false });
    comCliente(<Comparador />);
    expect(screen.queryByRole('button', { name: /Salvar comparação/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Comparações salvas/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Exportar PDF/ })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('os 2 "Salvar comparação" mandam tickers na ordem dos slots + janela; 201 → aviso com Ver salvas', async () => {
    ligar({ salvos: true, pdf: true });
    m.csrfFetch.mockResolvedValue(
      mockFetchResponse(
        { comparacao: { ...SALVA, nome: 'ITUB4 · WEGE3' }, atualizada: false },
        201,
      ),
    );
    const { container } = comCliente(<Comparador />);
    const barra = container.querySelector('[data-salvar-comparacao="barra"]') as HTMLElement;
    const leitura = container.querySelector('[data-salvar-comparacao="leitura"]') as HTMLElement;
    expect(barra.textContent).toBe('Salvar comparação');
    expect(leitura.closest('[data-leitura-dos-dados]')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Exportar PDF/ })).toBeTruthy();
    // sem comparações salvas, o menu não aparece
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Comparações salvas/ })).toBeNull();
    esperarDomLimpo(container);

    fireEvent.click(barra);
    const dialogo = await screen.findByRole('dialog', { name: 'Salvar comparação' });
    expect(dialogo.textContent).toContain('Ações · ITUB4 · WEGE3 · janela de 10 anos');
    expect((screen.getByLabelText('Nome da comparação') as HTMLInputElement).value).toBe(
      'ITUB4 · WEGE3',
    );
    esperarDomLimpo(dialogo);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar comparação' }));
    await waitFor(() => expect(m.csrfFetch).toHaveBeenCalledTimes(1));
    expect(m.csrfFetch.mock.calls[0][0]).toBe('/api/analise-ativos/comparacoes');
    expect(JSON.parse(m.csrfFetch.mock.calls[0][1].body)).toEqual({
      classe: 'acao',
      tickers: ['ITUB4', 'WEGE3'],
      janela: 10,
      tipoFii: null,
      nome: 'ITUB4 · WEGE3',
    });
    await waitFor(() => expect(m.toast).toHaveBeenCalled());
    const aviso = m.toast.mock.calls[0][0] as { mensagem: string; ver?: { label: string } };
    expect(aviso.mensagem).toBe('Comparação ITUB4 · WEGE3 salva.');
    expect(aviso.ver?.label).toBe('Ver salvas');

    // o da Leitura dos dados manda o mesmo conjunto; 200 atualizada → "Comparação atualizada"
    m.csrfFetch.mockResolvedValue(mockFetchResponse({ comparacao: SALVA, atualizada: true }));
    fireEvent.click(leitura);
    const dialogo2 = await screen.findByRole('dialog', { name: 'Salvar comparação' });
    fireEvent.click(within(dialogo2).getByRole('button', { name: 'Salvar comparação' }));
    await waitFor(() => expect(m.csrfFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(m.csrfFetch.mock.calls[1][1].body).tickers).toEqual(['ITUB4', 'WEGE3']);
    await waitFor(() =>
      expect(m.toast).toHaveBeenLastCalledWith(
        expect.objectContaining({ mensagem: 'Comparação atualizada' }),
      ),
    );
  });

  it('já salva (outra ordem): "Comparação salva ✓" com aria-pressed abre as Comparações salvas', async () => {
    ligar();
    m.salvas = [SALVA];
    comCliente(<Comparador />);
    const menu = await screen.findByRole('button', { name: /Comparações salvas \(1\)/ });
    expect(menu).toBeTruthy();
    expect(await screen.findByText('Comparação salva: Bancos e indústria')).toBeTruthy();
    const salvas = screen.getAllByRole('button', { name: /Comparação salva ✓/ });
    expect(salvas).toHaveLength(2);
    expect(salvas[0].getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(salvas[0]);
    const dialogo = await screen.findByRole('dialog', { name: 'Comparações salvas' });
    expect(dialogo.textContent).toContain('Bancos e indústria');
    expect(m.csrfFetch).not.toHaveBeenCalled();
  });

  it('celular: botões de largura toda e o mesmo POST', async () => {
    ligar({ salvos: true, pdf: true });
    m.celular = true;
    const { container } = comCliente(<Comparador />);
    expect(container.querySelector('[data-acoes-salvos-comparador]')).toBeTruthy();
    expect(container.querySelectorAll('[data-salvar-comparacao]')).toHaveLength(2);
    esperarDomLimpo(container);
  });

  it('consultor: desabilitado com o title das comparações pessoais', async () => {
    ligar();
    m.acting = { id: 'c', name: 'Ana' };
    comCliente(<Comparador />);
    const botoes = screen.getAllByRole('button', { name: 'Salvar comparação' });
    for (const b of botoes) {
      expect(b.hasAttribute('disabled')).toBe(true);
      expect(b.getAttribute('title')).toBe(
        'Comparações salvas são pessoais e não aparecem no modo consultor.',
      );
    }
    const menu = await screen.findByRole('button', { name: /Comparações salvas/ });
    expect(menu.hasAttribute('disabled')).toBe(true);
  });
});

describe('BotaoSalvarComparacao — FII', () => {
  it('manda o tipo do FII (papel)', async () => {
    m.csrfFetch.mockResolvedValue(mockFetchResponse({ comparacao: SALVA, atualizada: false }, 201));
    comCliente(
      <BotaoSalvarComparacao
        classe="fii"
        tickers={['KNCR11', 'MXRF11']}
        janela={5}
        tipoFii="papel"
      />,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Salvar comparação' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getAllByRole('button', { name: 'Salvar comparação' }).at(-1)!);
    await waitFor(() => expect(m.csrfFetch).toHaveBeenCalled());
    expect(JSON.parse(m.csrfFetch.mock.calls[0][1].body)).toMatchObject({
      classe: 'fii',
      tickers: ['KNCR11', 'MXRF11'],
      janela: 5,
      tipoFii: 'papel',
    });
  });
});
