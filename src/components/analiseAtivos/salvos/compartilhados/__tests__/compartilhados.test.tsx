// @vitest-environment jsdom
/**
 * Bloco 1 (fatia 0): componentes compartilhados — ModalNomeLista (contador, vazio, 409 inline,
 * limite, opção de avisos), ListaComparacoesSalvas (popover e página: abrir, renomear, apagar com
 * confirmação) e mostrarToastSalvo (literais do Pedro + Desfazer). Varredura de DOM nos três.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import { esperarDomLimpo } from '@/test/utils/varrerDom';
import { TEXTOS_SALVOS } from '@/services/analiseAtivos/textosSalvos';
import { LIMITES_SALVOS } from '@/services/analiseAtivos/salvos/contrato';
import type { ComparacoesResposta, ResumoLista } from '@/types/analiseAtivosSalvos';

const mocks = vi.hoisted(() => ({
  csrfFetch: vi.fn(),
  celular: false,
  toast: vi.fn(() => 1),
  push: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ actingClient: null }) }));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: mocks.csrfFetch }) }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => mocks.celular,
  useMediaQuery: () => mocks.celular,
}));
vi.mock('@/components/carteira/mover/moverToast', () => ({ mostrarToastMover: mocks.toast }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn() }),
}));

import ModalNomeLista, {
  erroDo409,
} from '@/components/analiseAtivos/salvos/compartilhados/ModalNomeLista';
import ListaComparacoesSalvas from '@/components/analiseAtivos/salvos/compartilhados/ListaComparacoesSalvas';
import {
  mostrarToastSalvo,
  textoToastSalvo,
} from '@/components/analiseAtivos/salvos/compartilhados/mostrarToastSalvo';
import {
  juntarNomesListas,
  resumoAlertasLista,
  uniaoAlertas,
} from '@/components/analiseAtivos/salvos/compartilhados/formatosSalvos';

const T = TEXTOS_SALVOS;

const LISTA: ResumoLista = {
  id: '3f2c1a9e-7b6d-4c8a-9e1f-2a3b4c5d6e7f',
  nome: 'Elétricas',
  contagem: { acao: 0, fii: 0 },
  alertas: { resultado: true, provento: true, criterios: false },
  criadaEm: '2026-10-16T12:00:00.000Z',
};

function comCliente(ui: React.ReactElement) {
  const qc = createTestQueryClient();
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mocks.csrfFetch.mockReset();
  mocks.toast.mockReset();
  mocks.push.mockReset();
  mocks.celular = false;
});
afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// ModalNomeLista
// ---------------------------------------------------------------------------

describe('ModalNomeLista', () => {
  const props = { aberto: true, onFechar: vi.fn(), onConcluir: vi.fn() };

  it('criar: contador n/40, vazio dá erro e não envia', async () => {
    comCliente(<ModalNomeLista {...props} modo="criar" />);
    const campo = screen.getByLabelText(T.modalNome.rotulo) as HTMLInputElement;
    expect(campo.maxLength).toBe(40);
    expect(screen.getByText('0/40')).toBeTruthy();
    fireEvent.change(campo, { target: { value: 'Divid' } });
    expect(screen.getByText('5/40')).toBeTruthy();
    fireEvent.change(campo, { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: T.modalNome.criar }));
    expect(await screen.findByText(T.modalNome.erroVazio)).toBeTruthy();
    expect(mocks.csrfFetch).not.toHaveBeenCalled();
  });

  it('criar: POST com nome normalizado e tickerInicial; toast "Lista X criada com T."', async () => {
    mocks.csrfFetch.mockResolvedValue(mockFetchResponse(LISTA, 201));
    const onConcluir = vi.fn();
    comCliente(
      <ModalNomeLista {...props} onConcluir={onConcluir} modo="criar" tickerInicial="TAEE11" />,
    );
    expect(screen.getByText('TAEE11 entra na lista nova.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(T.modalNome.rotulo), {
      target: { value: '  Elétricas  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: T.modalNome.criar }));
    await waitFor(() => expect(onConcluir).toHaveBeenCalledWith(LISTA));
    const [url, init] = mocks.csrfFetch.mock.calls[0];
    expect(url).toBe('/api/analise-ativos/listas');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ nome: 'Elétricas', tickerInicial: 'TAEE11' });
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ mensagem: 'Lista Elétricas criada com TAEE11.' }),
    );
  });

  it('409 de nome repetido aparece inline', async () => {
    mocks.csrfFetch.mockResolvedValue(mockFetchResponse({ error: T.servidor.listaRepetida }, 409));
    comCliente(<ModalNomeLista {...props} modo="criar" />);
    fireEvent.change(screen.getByLabelText(T.modalNome.rotulo), {
      target: { value: 'Dividendos' },
    });
    fireEvent.click(screen.getByRole('button', { name: T.modalNome.criar }));
    expect(await screen.findByText(T.modalNome.erroRepetido)).toBeTruthy();
    expect(
      (screen.getByLabelText(T.modalNome.rotulo) as HTMLInputElement).getAttribute('aria-invalid'),
    ).toBe('true');
  });

  it('erroDo409 distingue o limite de listas do nome repetido', () => {
    expect(erroDo409('Você chegou a 20 listas, o limite por conta.', 20)).toMatch(/20 listas/);
    expect(erroDo409(T.servidor.listaRepetida, 20)).toBe(T.modalNome.erroRepetido);
  });

  it('no limite de 20 listas: aviso, campo e botão desabilitados', () => {
    comCliente(
      <ModalNomeLista {...props} modo="criar" totalListas={20} limites={LIMITES_SALVOS} />,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/20 listas, o limite por conta/);
    expect((screen.getByLabelText(T.modalNome.rotulo) as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: T.modalNome.criar }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('opção de avisos só com alertasLigados; desmarcada manda resultado/provento false', async () => {
    const { unmount } = comCliente(<ModalNomeLista {...props} modo="criar" />);
    expect(screen.queryByLabelText(new RegExp(T.modalNome.avisar))).toBeNull();
    unmount();

    mocks.csrfFetch.mockResolvedValue(mockFetchResponse(LISTA, 201));
    comCliente(<ModalNomeLista {...props} modo="criar" alertasLigados />);
    const caixa = screen.getByLabelText(new RegExp(T.modalNome.avisar)) as HTMLInputElement;
    expect(caixa.checked).toBe(true);
    fireEvent.click(caixa);
    fireEvent.change(screen.getByLabelText(T.modalNome.rotulo), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: T.modalNome.criar }));
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalled());
    expect(JSON.parse(mocks.csrfFetch.mock.calls[0][1].body)).toEqual({
      nome: 'X',
      alertas: { resultado: false, provento: false },
    });
  });

  it('renomear: preenchido, PATCH e "Nome da lista atualizado."', async () => {
    mocks.csrfFetch.mockResolvedValue(mockFetchResponse({ ...LISTA, nome: 'Energia' }));
    comCliente(<ModalNomeLista {...props} modo="renomear" lista={LISTA} />);
    const campo = screen.getByLabelText(T.modalNome.rotulo) as HTMLInputElement;
    expect(campo.value).toBe('Elétricas');
    fireEvent.change(campo, { target: { value: 'Energia' } });
    fireEvent.click(screen.getByRole('button', { name: T.modalNome.salvarNome }));
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalled());
    const [url, init] = mocks.csrfFetch.mock.calls[0];
    expect(url).toBe(`/api/analise-ativos/listas/${LISTA.id}`);
    expect(init.method).toBe('PATCH');
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ mensagem: T.toast.nomeAtualizado }),
    );
  });

  it('varredura de DOM limpa', () => {
    comCliente(<ModalNomeLista {...props} modo="criar" alertasLigados tickerInicial="WEGE3" />);
    esperarDomLimpo(screen.getByRole('dialog'));
  });
});

// ---------------------------------------------------------------------------
// ListaComparacoesSalvas
// ---------------------------------------------------------------------------

const COMPARACOES: ComparacoesResposta = {
  comparacoes: [
    {
      id: 'c1',
      nome: 'Elétricas',
      classe: 'acao',
      tickers: ['TAEE11', 'CMIG4', 'EGIE3'],
      janela: 5,
      tipoFii: null,
      href: '/analise-ativos/comparador?t=TAEE11,CMIG4,EGIE3',
      atualizadoEm: '2026-10-14T12:00:00.000Z',
    },
  ],
  limites: LIMITES_SALVOS,
  podeSalvar: true,
  motivoSemSalvar: null,
};

describe('ListaComparacoesSalvas', () => {
  function comFetch(resposta: ComparacoesResposta, status = 200) {
    const fn = vi.fn().mockResolvedValue(mockFetchResponse(resposta, status));
    vi.stubGlobal('fetch', fn);
    return fn;
  }

  it('popover: lista, "n de 30", abrir navega e fecha', async () => {
    const fetchMock = comFetch(COMPARACOES);
    const onFechar = vi.fn();
    comCliente(<ListaComparacoesSalvas variante="popover" classe="acao" onFechar={onFechar} />);
    const abrir = await screen.findByRole('button', { name: 'Abrir a comparação Elétricas' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/analise-ativos/comparacoes?classe=acao');
    expect(screen.getByText('1 de 30')).toBeTruthy();
    expect(
      screen.getByText(/Ações · TAEE11 · CMIG4 · EGIE3 · 5 anos · salva em 14\/10\/2026/),
    ).toBeTruthy();
    expect(screen.getByText(T.comparacoes.lista.instrucao)).toBeTruthy();
    fireEvent.click(abrir);
    expect(mocks.push).toHaveBeenCalledWith(COMPARACOES.comparacoes[0].href);
    expect(onFechar).toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ mensagem: 'Comparação Elétricas aberta com os dados de hoje.' }),
    );
  });

  it('página: apagar pede confirmação na própria linha e chama DELETE', async () => {
    comFetch(COMPARACOES);
    mocks.csrfFetch.mockResolvedValue(mockFetchResponse({ ok: true }));
    comCliente(<ListaComparacoesSalvas variante="pagina" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar a comparação Elétricas' }));
    const confirmacao = screen.getByRole('alert');
    expect(confirmacao.textContent).toMatch('Apagar Elétricas?');
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalled());
    expect(mocks.csrfFetch.mock.calls[0][0]).toBe('/api/analise-ativos/comparacoes/c1');
    expect(mocks.csrfFetch.mock.calls[0][1].method).toBe('DELETE');
    expect(screen.queryByText(T.comparacoes.lista.instrucao)).toBeNull();
  });

  it('renomear inline: PATCH com o nome novo', async () => {
    comFetch(COMPARACOES);
    mocks.csrfFetch.mockResolvedValue(
      mockFetchResponse({ ...COMPARACOES.comparacoes[0], nome: 'Energia' }),
    );
    comCliente(<ListaComparacoesSalvas variante="pagina" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Renomear a comparação Elétricas' }));
    const campo = screen.getByLabelText(T.comparacoes.lista.rotuloNome);
    fireEvent.change(campo, { target: { value: 'Energia' } });
    fireEvent.click(screen.getByRole('button', { name: T.comparacoes.lista.salvarNome }));
    await waitFor(() => expect(mocks.csrfFetch).toHaveBeenCalled());
    expect(JSON.parse(mocks.csrfFetch.mock.calls[0][1].body)).toEqual({ nome: 'Energia' });
  });

  it('vazio, consultor sem botões de gravar e erro com "Tentar de novo"', async () => {
    comFetch({ ...COMPARACOES, comparacoes: [] });
    const { unmount } = comCliente(<ListaComparacoesSalvas variante="popover" />);
    expect(await screen.findByText(T.comparacoes.lista.vazio)).toBeTruthy();
    unmount();

    comFetch({ ...COMPARACOES, podeSalvar: false, motivoSemSalvar: 'consultor' });
    const r2 = comCliente(<ListaComparacoesSalvas variante="pagina" />);
    await screen.findByRole('button', { name: 'Abrir a comparação Elétricas' });
    expect(screen.queryByRole('button', { name: /Apagar a comparação/ })).toBeNull();
    r2.unmount();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse({ error: 'x' }, 404)));
    comCliente(<ListaComparacoesSalvas variante="pagina" />);
    expect(await screen.findByRole('button', { name: T.comparacoes.lista.tentar })).toBeTruthy();
  });

  it('varredura de DOM limpa', async () => {
    comFetch(COMPARACOES);
    const { container } = comCliente(
      <ListaComparacoesSalvas variante="popover" onFechar={vi.fn()} />,
    );
    await screen.findByRole('button', { name: 'Abrir a comparação Elétricas' });
    esperarDomLimpo(container);
  });
});

// ---------------------------------------------------------------------------
// mostrarToastSalvo e formatos
// ---------------------------------------------------------------------------

describe('mostrarToastSalvo', () => {
  it('literal do Pedro, com a frase do aviso só com comAviso, e Desfazer', () => {
    const desfazer = vi.fn();
    mostrarToastSalvo({
      tipo: 'salvo',
      ticker: 'WEGE3',
      lista: 'Salvos',
      comAviso: true,
      desfazer,
    });
    expect(mocks.toast).toHaveBeenLastCalledWith({
      tipo: 'ok',
      mensagem: 'WEGE3 salvo em Salvos · você recebe aviso de resultado e data-com',
      desfazer,
    });
    expect(textoToastSalvo({ tipo: 'salvo', ticker: 'WEGE3', lista: 'Salvos' })).toBe(
      'WEGE3 salvo em Salvos',
    );
    mostrarToastSalvo({ tipo: 'removido', ticker: 'WEGE3', lista: 'Salvos', desfazer });
    expect(mocks.toast).toHaveBeenLastCalledWith({
      tipo: 'ok',
      mensagem: 'WEGE3 removido de Salvos',
      desfazer,
    });
  });

  it('erro com Tentar de novo; info sem Desfazer', () => {
    const tentar = vi.fn();
    mostrarToastSalvo({ tipo: 'erro', mensagem: 'falhou', tentarDeNovo: tentar });
    expect(mocks.toast).toHaveBeenLastCalledWith({
      tipo: 'erro',
      mensagem: 'falhou',
      tentarDeNovo: tentar,
    });
    mostrarToastSalvo({ tipo: 'info', mensagem: 'ok' });
    expect(mocks.toast).toHaveBeenLastCalledWith({ tipo: 'info', mensagem: 'ok' });
  });

  it('formatos: nomes das listas e resumo dos avisos', () => {
    expect(juntarNomesListas(['Dividendos'])).toBe('Dividendos');
    expect(juntarNomesListas(['Dividendos', 'Utilidade pública'])).toBe(
      'Dividendos e Utilidade pública',
    );
    expect(juntarNomesListas(['A', 'B', 'C'])).toBe('A, B e C');
    expect(resumoAlertasLista(LISTA.alertas)).toBe('resultado entregue, provento anunciado');
    expect(resumoAlertasLista({ resultado: false, provento: false, criterios: false })).toBe('');
    expect(
      uniaoAlertas([
        { alertas: { resultado: true, provento: false, criterios: false } },
        { alertas: { resultado: false, provento: false, criterios: true } },
      ]),
    ).toEqual({ resultado: true, provento: false, criterios: true });
  });
});

// AlertasDaLista e AbaAlertas (fatia D): salvos/__tests__/alertas.test.tsx
