// @vitest-environment jsdom
/**
 * Bloco 1 (fatia D): AlertasDaLista (3 interruptores de 44 px, PATCH só do que mudou, toast, literal
 * legal) e AbaAlertas (dias, abas por classe, marcar como lidos, vazios, erro, consultor, painel
 * "Como os avisos chegam"). Varredura de linguagem do DOM nos dois.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import { esperarDomLimpo } from '@/test/utils/varrerDom';
import { TEXTOS_ALERTAS } from '@/services/analiseAtivos/textosAlertas';
import type { AlertasResposta, AvisoApi, ResumoLista } from '@/types/analiseAtivosSalvos';

const mocks = vi.hoisted(() => ({
  csrfFetch: vi.fn(),
  toast: vi.fn(() => 1),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ actingClient: null }) }));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: mocks.csrfFetch }) }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => false,
  useMediaQuery: () => false,
}));
vi.mock('@/components/carteira/mover/moverToast', () => ({ mostrarToastMover: mocks.toast }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

import AlertasDaLista from '@/components/analiseAtivos/salvos/AlertasDaLista';
import AbaAlertas, { agruparPorDia, rotuloDia } from '@/components/analiseAtivos/salvos/AbaAlertas';

const A = TEXTOS_ALERTAS;

function comCliente(ui: React.ReactElement) {
  const qc = createTestQueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const LISTA = {
  id: '3f2c1a9e-7b6d-4c8a-9e1f-2a3b4c5d6e7f',
  nome: 'Elétricas',
  alertas: { resultado: true, provento: true, criterios: false },
  totalAtivos: 3,
};
const RESUMO: ResumoLista = {
  id: LISTA.id,
  nome: LISTA.nome,
  contagem: { acao: 3, fii: 0 },
  alertas: { resultado: true, provento: true, criterios: true },
  criadaEm: '2026-10-01T12:00:00.000Z',
};

beforeEach(() => {
  mocks.csrfFetch.mockReset();
  mocks.toast.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// AlertasDaLista
// ---------------------------------------------------------------------------

describe('AlertasDaLista', () => {
  it('3 interruptores com o estado da lista; critérios desligado; literal legal', async () => {
    const { baseElement } = comCliente(<AlertasDaLista aberto lista={LISTA} onFechar={vi.fn()} />);
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText('Alertas da lista "Elétricas"')).toBeInTheDocument();
    expect(
      within(dialogo).getByText(
        'Valem para os 3 ativos da lista. Chegam no sino do app e, se você ativou, como notificação no celular.',
      ),
    ).toBeInTheDocument();
    const res = screen.getByRole('switch', { name: A.tipos.resultado.rotulo });
    const pro = screen.getByRole('switch', { name: A.tipos.provento.rotulo });
    const cri = screen.getByRole('switch', { name: A.tipos.criterios.rotulo });
    expect(res).toHaveAttribute('aria-checked', 'true');
    expect(pro).toHaveAttribute('aria-checked', 'true');
    expect(cri).toHaveAttribute('aria-checked', 'false');
    // área de toque de 44 px no próprio elemento
    for (const s of [res, pro, cri]) expect(s.className).toMatch(/min-h-11/);
    expect(s(baseElement, '[data-texto-legal="aviso-salvos-alertas"]')).not.toBeNull();
    esperarDomLimpo(baseElement);
  });

  it('Salvar manda só o que mudou e mostra o toast; sem mudança só fecha', async () => {
    mocks.csrfFetch.mockResolvedValue(mockFetchResponse(RESUMO));
    const onFechar = vi.fn();
    const onSalvo = vi.fn();
    comCliente(<AlertasDaLista aberto lista={LISTA} onFechar={onFechar} onSalvo={onSalvo} />);
    fireEvent.click(await screen.findByRole('switch', { name: A.tipos.criterios.rotulo }));
    fireEvent.click(screen.getByRole('button', { name: A.daLista.salvar }));
    await waitFor(() => expect(onSalvo).toHaveBeenCalledWith(RESUMO));
    const [url, init] = mocks.csrfFetch.mock.calls[0];
    expect(url).toBe(`/api/analise-ativos/listas/${LISTA.id}`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ alertas: { criterios: true } });
    expect(mocks.toast).toHaveBeenCalledWith({
      tipo: 'info',
      mensagem: 'Alertas de Elétricas salvos.',
    });
    expect(onFechar).toHaveBeenCalled();
  });

  it('desligar os 3: toast "desligados"; erro do servidor fica inline', async () => {
    mocks.csrfFetch.mockResolvedValueOnce(
      mockFetchResponse({
        ...RESUMO,
        alertas: { resultado: false, provento: false, criterios: false },
      }),
    );
    comCliente(<AlertasDaLista aberto lista={LISTA} onFechar={vi.fn()} />);
    fireEvent.click(await screen.findByRole('switch', { name: A.tipos.resultado.rotulo }));
    fireEvent.click(screen.getByRole('switch', { name: A.tipos.provento.rotulo }));
    fireEvent.click(screen.getByRole('button', { name: A.daLista.salvar }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({
        tipo: 'info',
        mensagem: 'Alertas de Elétricas desligados.',
      }),
    );

    mocks.csrfFetch.mockResolvedValueOnce(mockFetchResponse({ error: 'x' }, 500));
    fireEvent.click(screen.getByRole('switch', { name: A.tipos.criterios.rotulo }));
    fireEvent.click(screen.getByRole('button', { name: A.daLista.salvar }));
    expect(await screen.findByRole('alert')).toHaveTextContent(A.daLista.erro);
  });

  it('sem mudança, Salvar só fecha (sem PATCH); 1 ativo usa o subtítulo no singular', async () => {
    const onFechar = vi.fn();
    comCliente(<AlertasDaLista aberto lista={{ ...LISTA, totalAtivos: 1 }} onFechar={onFechar} />);
    expect(await screen.findByText(A.daLista.subtituloUm)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: A.daLista.salvar }));
    expect(onFechar).toHaveBeenCalled();
    expect(mocks.csrfFetch).not.toHaveBeenCalled();
  });
});

function s(raiz: HTMLElement, seletor: string) {
  return raiz.querySelector(seletor);
}

// ---------------------------------------------------------------------------
// AbaAlertas
// ---------------------------------------------------------------------------

const AGORA = new Date('2026-10-16T15:00:00.000Z');
const aviso = (over: Partial<AvisoApi>): AvisoApi => ({
  id: '00000000-0000-4000-8000-000000000001',
  titulo: 'HGLG11: provento anunciado',
  mensagem: 'Rendimento de R$ 1,10 por cota · data-com 20/10 · pagamento 27/10.',
  href: '/analise-ativos/HGLG11',
  symbol: 'HGLG11',
  tipo: 'provento',
  classe: 'fii',
  criadoEm: '2026-10-16T11:10:00.000Z',
  lido: false,
  ...over,
});
const AVISOS: AvisoApi[] = [
  aviso({}),
  aviso({
    id: '00000000-0000-4000-8000-000000000002',
    titulo: 'WEGE3: resultado do 3T26',
    mensagem: 'Documento do período 3T26 entregue à CVM nesta data.',
    href: '/analise-ativos/WEGE3',
    symbol: 'WEGE3',
    tipo: 'resultado',
    classe: 'acao',
    criadoEm: '2026-10-16T11:10:00.000Z',
  }),
  aviso({
    id: '00000000-0000-4000-8000-000000000003',
    titulo: 'ITUB4: a contagem de critérios mudou',
    mensagem: 'De 4 de 6 para 5 de 6 na janela de 5 anos (2021–2025).',
    href: '/analise-ativos/ITUB4',
    symbol: 'ITUB4',
    tipo: 'criterios',
    classe: 'acao',
    criadoEm: '2026-10-15T11:10:00.000Z',
    lido: true,
  }),
];

function stubApi(alertas: AlertasResposta | { status: number }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.startsWith('/api/push/preferencias')) {
        return mockFetchResponse({ habilitado: true, categorias: { analise: true } });
      }
      if ('status' in alertas) return mockFetchResponse({ error: 'x' }, alertas.status);
      return mockFetchResponse(alertas);
    }),
  );
}

const RESPOSTA: AlertasResposta = {
  avisos: AVISOS,
  naoLidos: 2,
  podeSalvar: true,
  motivoSemSalvar: null,
};

describe('AbaAlertas', () => {
  it('dias no horário de Brasília: Hoje · DD/MM, Ontem · DD/MM, depois a data', () => {
    expect(rotuloDia('2026-10-16T11:10:00Z', AGORA)).toBe('Hoje · 16/10');
    expect(rotuloDia('2026-10-15T11:10:00Z', AGORA)).toBe('Ontem · 15/10');
    expect(rotuloDia('2026-10-10T11:10:00Z', AGORA)).toBe('10/10/2026');
    // 01:00 UTC de 16/10 = 22:00 de 15/10 em Brasília
    expect(rotuloDia('2026-10-16T01:00:00Z', AGORA)).toBe('Ontem · 15/10');
    expect(agruparPorDia(AVISOS, AGORA).map((g) => g.avisos.length)).toEqual([2, 1]);
  });

  it('lista da classe, contagens nas abas, não lidos e Marcar todos como lidos', async () => {
    stubApi(RESPOSTA);
    mocks.csrfFetch.mockResolvedValue(mockFetchResponse({ ok: true, marcados: 2 }));
    const onTrocarClasse = vi.fn();
    const { container } = comCliente(<AbaAlertas classe="acao" onTrocarClasse={onTrocarClasse} />);
    expect(await screen.findByText('WEGE3: resultado do 3T26')).toBeInTheDocument();
    expect(screen.getByText('ITUB4: a contagem de critérios mudou')).toBeInTheDocument();
    expect(screen.queryByText('HGLG11: provento anunciado')).toBeNull();
    expect(screen.getByRole('tab', { name: /Ações/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Ações/ })).toHaveTextContent('2');
    expect(screen.getByRole('tab', { name: /FIIs/ })).toHaveTextContent('1');
    expect(screen.getByText('2 novos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /WEGE3: resultado do 3T26/ })).toHaveAttribute(
      'href',
      '/analise-ativos/WEGE3',
    );

    fireEvent.click(screen.getByRole('tab', { name: /FIIs/ }));
    expect(onTrocarClasse).toHaveBeenCalledWith('fii');

    fireEvent.click(screen.getByRole('button', { name: A.aba.marcarTodos }));
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({ tipo: 'info', mensagem: A.aba.marcados }),
    );
    const [url, init] = mocks.csrfFetch.mock.calls[0];
    expect(url).toBe('/api/analise-ativos/alertas/lidos');
    expect(JSON.parse(init.body)).toEqual({});
    // o painel "Como os avisos chegam"
    expect(screen.getByRole('complementary', { name: A.comoChegam.titulo })).toBeInTheDocument();
    expect(screen.getByText(A.comoChegam.horario)).toBeInTheDocument();
    esperarDomLimpo(container);
  });

  it('tocar num aviso não lido marca só ele', async () => {
    stubApi(RESPOSTA);
    mocks.csrfFetch.mockResolvedValue(mockFetchResponse({ ok: true, marcados: 1 }));
    comCliente(<AbaAlertas classe="fii" />);
    fireEvent.click(await screen.findByRole('link', { name: /HGLG11: provento anunciado/ }));
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalled());
    expect(JSON.parse(mocks.csrfFetch.mock.calls[0][1].body)).toEqual({
      ids: ['00000000-0000-4000-8000-000000000001'],
    });
  });

  it('vazio: atalho "Ligar alertas de <lista>" ou "Criar lista"', async () => {
    stubApi({ ...RESPOSTA, avisos: [], naoLidos: 0 });
    const onConfigurarAlertas = vi.fn();
    const { unmount } = comCliente(
      <AbaAlertas
        classe="acao"
        primeiraLista={{ id: 'l1', nome: 'Elétricas' }}
        onConfigurarAlertas={onConfigurarAlertas}
      />,
    );
    expect(await screen.findByText(A.aba.vazioTitulo)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ligar alertas de "Elétricas"' }));
    expect(onConfigurarAlertas).toHaveBeenCalledWith('l1');
    unmount();

    const onCriarLista = vi.fn();
    comCliente(<AbaAlertas classe="acao" primeiraLista={null} onCriarLista={onCriarLista} />);
    fireEvent.click(await screen.findByRole('button', { name: A.aba.criarLista }));
    expect(onCriarLista).toHaveBeenCalled();
  });

  it('vazio da classe mostra a contagem da outra', async () => {
    stubApi({ ...RESPOSTA, avisos: [AVISOS[1]], naoLidos: 1 });
    comCliente(<AbaAlertas classe="fii" />);
    expect(await screen.findByText('Sem alertas de FIIs nos últimos 90 dias')).toBeInTheDocument();
    expect(screen.getByText('Há 1 alerta em Ações.')).toBeInTheDocument();
  });

  it('erro com Tentar de novo; consultor vê o aviso de que os alertas são pessoais', async () => {
    stubApi({ status: 404 });
    const { unmount } = comCliente(<AbaAlertas classe="acao" />);
    expect(await screen.findByText(A.aba.erroTitulo)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: A.aba.tentar })).toBeInTheDocument();
    unmount();

    stubApi({ avisos: [], naoLidos: 0, podeSalvar: false, motivoSemSalvar: 'consultor' });
    comCliente(<AbaAlertas classe="acao" />);
    expect(await screen.findByText(A.aba.consultor)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: A.aba.marcarTodos })).toBeNull();
  });
});
