// @vitest-environment jsdom
/**
 * Bloco 1 (fatia B): Salvar no cabeçalho do ativo e marcador do Quadro — regra 0/1/2+ listas,
 * otimista com reversão, avisos com os literais do Pedro (frase do aviso só com recursos.alertas),
 * Desfazer, "Salvar em…" (caixas que gravam na hora), linha "Salvo em…", consultor desabilitado e
 * o marcador da linha que não abre o ativo. Varredura de DOM com as flags ligadas.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import { esperarDomLimpo } from '@/test/utils/varrerDom';
import type { IndiceSalvosResposta, ListasResposta } from '@/types/analiseAtivosSalvos';

const m = vi.hoisted(() => ({
  config: { data: undefined as unknown },
  acting: null as null | { id: string; name: string },
  csrfFetch: vi.fn(),
  toast: vi.fn((_d: unknown) => 1),
  push: vi.fn(),
  celular: false,
  indice: null as unknown,
  listas: null as unknown,
}));

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: m.push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/analise-ativos/WEGE3',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/hooks/useAnaliseAtivos', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAnaliseAtivosConfig: () => m.config,
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ actingClient: m.acting }) }));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: m.csrfFetch }) }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => m.celular,
  useMediaQuery: () => m.celular,
}));
vi.mock('@/components/carteira/mover/moverToast', () => ({ mostrarToastMover: m.toast }));

import BotaoSalvarAtivo, {
  useSalvarAtivo,
} from '@/components/analiseAtivos/ativo/acoes/BotaoSalvarAtivo';
import LinhaSalvoEm from '@/components/analiseAtivos/ativo/acoes/LinhaSalvoEm';
import BotaoSalvarLinha from '@/components/analiseAtivos/quadro/BotaoSalvarLinha';
import TabelaQuadro from '@/components/analiseAtivos/quadro/TabelaQuadro';
import { paraLinhaQuadroApi } from '@/services/analiseAtivos/leitura/linhasQuadro';
import { comTipoFiiExibido } from '@/services/analiseAtivos/quadro/tipoFiiExibido';
import { LIMITES_SALVOS } from '@/services/analiseAtivos/salvos/contrato';
import { LINHA_ITUB4, LINHA_WEGE3 } from '@/test/fixtures/analiseAtivos/linhasDb';
import type { InfoNaCarteira } from '@/components/analiseAtivos/quadro/CelulaNaCarteira';

const L1 = '3f2c1a9e-7b6d-4c8a-9e1f-2a3b4c5d6e7f';
const L2 = '4a2c1a9e-7b6d-4c8a-9e1f-2a3b4c5d6e7f';

const permissao = { limites: LIMITES_SALVOS, podeSalvar: true, motivoSemSalvar: null };

function indice(porTicker: Record<string, string[]>, listas: Array<{ id: string; nome: string }>) {
  return { ...permissao, porTicker, listas } satisfies IndiceSalvosResposta;
}
function listasResp(itens: Array<{ id: string; nome: string; n: number; alertas?: boolean }>) {
  return {
    ...permissao,
    listas: itens.map((l) => ({
      id: l.id,
      nome: l.nome,
      contagem: { acao: l.n, fii: 0 },
      alertas: { resultado: !!l.alertas, provento: !!l.alertas, criterios: false },
      criadaEm: '2026-10-16T12:00:00.000Z',
    })),
  } satisfies ListasResposta;
}

function ligar({ alertas = false }: { alertas?: boolean } = {}) {
  m.config = {
    data: {
      habilitada: true,
      recursos: {
        raioX: false,
        cenarios: false,
        comparador: true,
        salvos: true,
        alertas,
        pdfComparador: false,
      },
    },
  };
}

function Cabecalho({ ticker = 'WEGE3' }: { ticker?: string }) {
  const c = useSalvarAtivo({ ticker, classe: 'acao', detalhes: true });
  return (
    <div>
      <BotaoSalvarAtivo controle={c} />
      <LinhaSalvoEm controle={c} />
      {c.camadas}
    </div>
  );
}

function comCliente(ui: React.ReactElement) {
  const qc = createTestQueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const corpoDe = (i: number) => JSON.parse(m.csrfFetch.mock.calls[i][1].body as string);
const ultimoToast = () => m.toast.mock.calls.at(-1)?.[0] as Record<string, unknown>;

beforeEach(() => {
  m.csrfFetch.mockReset();
  m.toast.mockReset();
  m.push.mockReset();
  m.acting = null;
  m.celular = false;
  m.config = { data: undefined };
  m.indice = indice({}, []);
  m.listas = listasResp([]);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/analise-ativos/salvos')) return mockFetchResponse(m.indice);
      if (url.startsWith('/api/analise-ativos/listas')) return mockFetchResponse(m.listas);
      return mockFetchResponse({}, 404);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('BotaoSalvarAtivo — regra 0/1/2+', () => {
  it('sem recursos.salvos: nada aparece e nada é buscado', () => {
    const { container } = comCliente(<Cabecalho />);
    expect(container.textContent).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('0 listas: PUT ["padrao"], vira "Salvo ✓" na hora e o aviso SEM a frase dos alertas', async () => {
    ligar({ alertas: false });
    m.csrfFetch.mockResolvedValue(
      mockFetchResponse({
        ticker: 'WEGE3',
        listaIds: [L1],
        salvo: true,
        listaCriada: { id: L1, nome: 'Salvos' },
      }),
    );
    comCliente(<Cabecalho />);
    const botao = await screen.findByRole('button', { name: 'Salvar WEGE3' });
    await waitFor(() => expect(botao.hasAttribute('disabled')).toBe(false));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // o que o servidor devolve depois (a invalidação relê o índice)
    m.indice = indice({ WEGE3: [L1] }, [{ id: L1, nome: 'Salvos' }]);
    fireEvent.click(botao);
    expect(await screen.findByText('Salvo ✓')).toBeTruthy();
    await waitFor(() => expect(m.csrfFetch).toHaveBeenCalled());
    expect(m.csrfFetch.mock.calls[0][0]).toBe('/api/analise-ativos/salvos/WEGE3');
    expect(m.csrfFetch.mock.calls[0][1].method).toBe('PUT');
    expect(corpoDe(0)).toEqual({ listaIds: ['padrao'] });
    await waitFor(() => expect(m.toast).toHaveBeenCalled());
    expect(ultimoToast()).toMatchObject({ tipo: 'ok', mensagem: 'WEGE3 salvo em Salvos' });
    expect(typeof ultimoToast().desfazer).toBe('function');
  });

  it('com recursos.alertas, o aviso traz " · você recebe aviso de resultado e data-com"', async () => {
    ligar({ alertas: true });
    m.csrfFetch.mockResolvedValue(
      mockFetchResponse({
        ticker: 'WEGE3',
        listaIds: [L1],
        salvo: true,
        listaCriada: { id: L1, nome: 'Salvos' },
      }),
    );
    comCliente(<Cabecalho />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const botao = await screen.findByRole('button', { name: 'Salvar WEGE3' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    fireEvent.click(botao);
    await waitFor(() => expect(m.toast).toHaveBeenCalled());
    expect(ultimoToast().mensagem).toBe(
      'WEGE3 salvo em Salvos · você recebe aviso de resultado e data-com',
    );
  });

  it('1 lista e salvo: PUT [] ("removido de <lista>") e o Desfazer volta às listas de antes', async () => {
    ligar();
    m.indice = indice({ WEGE3: [L1] }, [{ id: L1, nome: 'Dividendos' }]);
    m.listas = listasResp([{ id: L1, nome: 'Dividendos', n: 3 }]);
    m.csrfFetch.mockResolvedValue(
      mockFetchResponse({ ticker: 'WEGE3', listaIds: [], salvo: false }),
    );
    const { container } = comCliente(<Cabecalho />);
    const botao = await screen.findByRole('button', { name: 'Salvo em Dividendos. Mudar listas' });
    expect(screen.getByText('Salvo em Dividendos')).toBeTruthy();
    // 1 lista: "Ver em Salvos" leva à página na lista
    expect(screen.getByRole('link', { name: /Ver em Salvos/ }).getAttribute('href')).toBe(
      `/analise-ativos/salvos?lista=${L1}`,
    );
    esperarDomLimpo(container);
    m.indice = indice({}, [{ id: L1, nome: 'Dividendos' }]);
    fireEvent.click(botao);
    expect(await screen.findByRole('button', { name: 'Salvar WEGE3' })).toBeTruthy();
    await waitFor(() => expect(m.toast).toHaveBeenCalled());
    expect(corpoDe(0)).toEqual({ listaIds: [] });
    expect(ultimoToast().mensagem).toBe('WEGE3 removido de Dividendos');
    m.csrfFetch.mockResolvedValue(
      mockFetchResponse({ ticker: 'WEGE3', listaIds: [L1], salvo: true }),
    );
    act(() => (ultimoToast().desfazer as () => void)());
    await waitFor(() => expect(m.csrfFetch).toHaveBeenCalledTimes(2));
    expect(corpoDe(1)).toEqual({ listaIds: [L1] });
  });

  it('erro no PUT: o otimista volta a "Salvar" e o aviso de erro tem "Tentar de novo"', async () => {
    ligar();
    m.indice = indice({}, [{ id: L1, nome: 'Dividendos' }]);
    m.csrfFetch.mockResolvedValue(mockFetchResponse({ error: 'falhou' }, 500));
    comCliente(<Cabecalho />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const botao = await screen.findByRole('button', { name: 'Salvar WEGE3' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    fireEvent.click(botao);
    await waitFor(() => expect(m.toast).toHaveBeenCalled());
    expect(ultimoToast()).toMatchObject({
      tipo: 'erro',
      mensagem: 'Não foi possível salvar WEGE3. Tente de novo.',
    });
    expect(typeof ultimoToast().tentarDeNovo).toBe('function');
    expect(screen.getByRole('button', { name: 'Salvar WEGE3' }).textContent).toContain('Salvar');
  });

  it('2+ listas: abre "Salvar WEGE3 em" e cada caixa grava o conjunto na hora', async () => {
    ligar({ alertas: true });
    m.indice = indice({ WEGE3: [L1] }, [
      { id: L1, nome: 'Dividendos' },
      { id: L2, nome: 'Utilidade pública' },
    ]);
    m.listas = listasResp([
      { id: L1, nome: 'Dividendos', n: 1, alertas: true },
      { id: L2, nome: 'Utilidade pública', n: 4 },
    ]);
    m.csrfFetch.mockResolvedValue(
      mockFetchResponse({ ticker: 'WEGE3', listaIds: [L1, L2], salvo: true }),
    );
    comCliente(<Cabecalho />);
    const botao = await screen.findByRole('button', { name: 'Salvo em Dividendos. Mudar listas' });
    expect(botao.getAttribute('aria-haspopup')).toBe('dialog');
    // a linha mostra os nomes como texto + "Mudar listas" e os avisos ligados
    expect(await screen.findByText(/Salvo em Dividendos · alertas: /)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mudar listas' })).toBeTruthy();
    fireEvent.click(botao);
    const dialogo = await screen.findByRole('dialog', { name: 'Salvar WEGE3 em' });
    expect(dialogo.textContent).toContain('Os alertas seguem os de cada lista.');
    expect(dialogo.textContent).toContain('1 ativo · com alertas');
    expect(dialogo.textContent).toContain('Nova lista com WEGE3');
    esperarDomLimpo(dialogo);
    const caixa = screen.getByRole('checkbox', { name: /Utilidade pública/ });
    expect(caixa.closest('label')?.className).toMatch(/min-h-\[52px\]/);
    fireEvent.click(caixa);
    await waitFor(() => expect(m.csrfFetch).toHaveBeenCalled());
    expect(corpoDe(0).listaIds.sort()).toEqual([L1, L2].sort());
    await waitFor(() => expect(ultimoToast().mensagem).toBe('WEGE3 salvo em Utilidade pública'));
    fireEvent.click(screen.getByRole('button', { name: 'Pronto' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('consultor: desabilitado com o title das listas pessoais (sem linha "Salvo em")', async () => {
    ligar();
    m.acting = { id: 'c1', name: 'Ana' };
    m.indice = { ...indice({}, []), podeSalvar: false, motivoSemSalvar: 'consultor' };
    comCliente(<Cabecalho />);
    const botao = await screen.findByRole('button', {
      name: 'Salvar WEGE3 (indisponível no modo consultor)',
    });
    expect(botao.hasAttribute('disabled')).toBe(true);
    expect(botao.getAttribute('title')).toBe(
      'As listas são pessoais e não aparecem no modo consultor.',
    );
    fireEvent.click(botao);
    expect(m.csrfFetch).not.toHaveBeenCalled();
  });
});

describe('BotaoSalvarLinha — marcador do Quadro', () => {
  const LINHAS = [LINHA_WEGE3, LINHA_ITUB4].map((l) => comTipoFiiExibido(paraLinhaQuadroApi(l)));
  const naCarteira = (): InfoNaCarteira => ({ estado: 'fora' }) as unknown as InfoNaCarteira;

  it('44 px, aria do estado, mesmo índice do cabeçalho e o clique não abre o ativo', async () => {
    ligar();
    m.indice = indice({ ITUB4: [L1] }, [{ id: L1, nome: 'Salvos' }]);
    m.csrfFetch.mockResolvedValue(
      mockFetchResponse({ ticker: 'WEGE3', listaIds: [L1], salvo: true }),
    );
    const { container } = comCliente(
      <>
        <Cabecalho />
        <TabelaQuadro
          classe="acao"
          modo="resumo"
          ordem="ticker"
          dir="asc"
          linhas={LINHAS}
          onOrdenar={vi.fn()}
          naCarteira={naCarteira}
          legenda="Quadro de ações"
          rotuloColunaAcao="Salvar"
          acaoLinha={(l) => <BotaoSalvarLinha ticker={l.ticker} classe="acao" />}
        />
      </>,
    );
    const salvo = await screen.findByRole('button', { name: 'ITUB4 está salvo' });
    expect(salvo.getAttribute('aria-pressed')).toBe('true');
    expect(salvo.className).toMatch(/h-11 w-11/);
    const marcador = within(document.querySelector('table') as HTMLElement).getByRole('button', {
      name: 'Salvar WEGE3',
    });
    m.indice = indice({ ITUB4: [L1], WEGE3: [L1] }, [{ id: L1, nome: 'Salvos' }]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    fireEvent.click(marcador);
    expect(m.push).not.toHaveBeenCalled();
    // otimista: o cabeçalho do mesmo ativo muda junto (índice compartilhado)
    expect(await screen.findByRole('button', { name: 'WEGE3 está salvo' })).toBeTruthy();
    expect(screen.getByText('Salvo ✓')).toBeTruthy();
    await waitFor(() => expect(corpoDe(0)).toEqual({ listaIds: ['padrao'] }));
    esperarDomLimpo(container);
  });

  it('consultor: marcador desabilitado com o title', async () => {
    ligar();
    m.acting = { id: 'c1', name: 'Ana' };
    comCliente(<BotaoSalvarLinha ticker="WEGE3" classe="acao" />);
    const b = await screen.findByRole('button', {
      name: 'Salvar WEGE3 (indisponível no modo consultor)',
    });
    expect(b.hasAttribute('disabled')).toBe(true);
    expect(b.getAttribute('title')).toMatch(/As listas são pessoais/);
  });
});
