// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MOTIVO_EM_REAIS } from '@/lib/carteiraMover';
import type {
  AplicarDestinosResponse,
  DestinoImportadoItem,
  DestinosImportadosResponse,
} from '@/lib/pluggyDestinos';
import { listaPadrao } from './fixtures';

const { belowLg } = vi.hoisted(() => ({ belowLg: { value: false } }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => belowLg.value,
  useMediaQuery: () => belowLg.value,
}));

import RevisarDestinos, { TEXTO_409 } from '../RevisarDestinos';
import { DestinosToastHost, fecharToastDestinos } from '../destinosToast';
import { TEXTO_SEM_DESTINO_COMUM } from '../AplicarLoteBarra';

// ── fetch mockado (GET destinos, POST destinos, undos) ──────────────────────────────────────

type Resposta = { status: number; body: unknown };
interface Chamada {
  url: string;
  method: string;
  body: unknown;
}

let chamadas: Chamada[] = [];
let respostaGet: () => Resposta;
let respostaPost: () => Resposta;
let respostaUndo: (id: string) => Resposta;

const json = (r: Resposta) =>
  new Response(JSON.stringify(r.body), {
    status: r.status,
    headers: { 'Content-Type': 'application/json' },
  });

function instalarFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      chamadas.push({ url, method, body });
      if (url.startsWith('/api/pluggy/carteira/destinos')) {
        return json(method === 'POST' ? respostaPost() : respostaGet());
      }
      const undo = url.match(/^\/api\/historico-alteracoes\/([^/]+)\/undo$/);
      if (undo) return json(respostaUndo(undo[1]));
      return json({ status: 404, body: { error: 'não mockado' } });
    }),
  );
}

const ok = (over: Partial<AplicarDestinosResponse> = {}): Resposta => ({
  status: 200,
  body: {
    aplicados: 0,
    semMudanca: 0,
    confirmados: 0,
    parcial: false,
    erros: [],
    historicoIds: [],
    ...over,
  } satisfies AplicarDestinosResponse,
});

const posts = () => chamadas.filter((c) => c.method === 'POST' && c.url.includes('destinos'));
const undos = () => chamadas.filter((c) => c.url.includes('/undo')).map((c) => c.url.split('/')[3]);

let lista: ReturnType<typeof listaPadrao>;

function montar(
  props: Partial<React.ComponentProps<typeof RevisarDestinos>> = {},
  itens: DestinoImportadoItem[] = lista.itens,
) {
  respostaGet = () => ({
    status: 200,
    body: {
      habilitado: true,
      itens,
      paraRevisar: itens.filter((i) => i.situacao === 'para-revisar').length,
    } satisfies DestinosImportadosResponse,
  });
  const onFechar = vi.fn();
  const onConcluido = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RevisarDestinos aberto onFechar={onFechar} onConcluido={onConcluido} {...props} />
      <DestinosToastHost />
    </QueryClientProvider>,
  );
  return { onFechar, onConcluido };
}

const primario = () =>
  document.querySelector<HTMLButtonElement>('[data-mf-destinos-salvar]') as HTMLButtonElement;

beforeEach(() => {
  chamadas = [];
  belowLg.value = false;
  lista = listaPadrao();
  respostaPost = () => ok();
  respostaUndo = () => ({ status: 200, body: { ok: true } });
  instalarFetch();
});

afterEach(() => {
  act(() => fecharToastDestinos());
  vi.unstubAllGlobals();
});

async function abrirPainel(ticker: string) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^Destino de ${ticker}`) }));
  return screen.getByRole('group', { name: `Onde ${ticker} vai entrar na Carteira` });
}

describe('RevisarDestinos — computador', () => {
  it('fechada não busca nada', () => {
    const client = new QueryClient();
    render(
      <QueryClientProvider client={client}>
        <RevisarDestinos aberto={false} onFechar={vi.fn()} onConcluido={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(chamadas).toHaveLength(0);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('mostra as faixas, a origem da sugestão, o selo "confira" e os itens sem escolha', async () => {
    montar({ connectionId: lista.knca11.connectionId });
    const dialog = await screen.findByRole('dialog', {
      name: 'Confira onde seus investimentos entraram',
    });
    await screen.findByText('Ações');
    expect(chamadas[0].url).toBe(
      `/api/pluggy/carteira/destinos?connectionId=${lista.knca11.connectionId}`,
    );
    const faixas = Array.from(dialog.querySelectorAll('[data-mf-destinos-faixa]')).map((f) =>
      f.getAttribute('data-mf-destinos-faixa'),
    );
    expect(faixas).toEqual(['acoes', 'fiis', 'rf', 'previdencia', 'ja-estava', 'sem-suporte']);
    expect(screen.getByText('Sugestão: pelo catálogo da CVM')).toBeInTheDocument();
    expect(screen.getByText('confira')).toBeInTheDocument();
    expect(screen.getByText('Pode servir de reserva de emergência')).toBeInTheDocument();
    expect(screen.getByText('Fica em Previdência e Seguros')).toBeInTheDocument();
    expect(screen.getByText('Cadastre à mão')).toBeInTheDocument();
    // Sem escolha: sem caixa nem botão de destino.
    expect(screen.queryByRole('checkbox', { name: 'Selecionar XP Prev PGBL' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Destino de XP Prev/ })).toBeNull();
    expect(primario()).toHaveTextContent('Está tudo certo');
  });

  it('painel na linha: bloqueados com o motivo do servidor; escolher marca "alterado"', async () => {
    montar();
    const painel = await abrirPainel('KNCA11');
    const summary = within(painel).getByText(/abas? não aceita/);
    fireEvent.click(summary);
    expect(painel.textContent).toContain(`Stocks: ${MOTIVO_EM_REAIS}`);
    // O summary dos bloqueados ganha 44px pelo wrapper (só layout).
    expect(
      Array.from(painel.querySelectorAll('div')).some((d) =>
        d.className.includes('[&_summary]:min-h-11'),
      ),
    ).toBe(true);

    fireEvent.click(within(painel).getByRole('radio', { name: 'Fiagro' }));
    expect(screen.getByText('alterado')).toBeInTheDocument();
    expect(screen.getByText(/Escolhido por você · sugestão era FII's/)).toBeInTheDocument();
    expect(primario()).toHaveTextContent('Salvar 1 mudança');

    fireEvent.click(within(painel).getByRole('button', { name: 'Voltar à sugestão' }));
    expect(screen.queryByText('alterado')).toBeNull();
    expect(primario()).toHaveTextContent('Está tudo certo');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: /Onde KNCA11/ })).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('lote: só destinos aceitos por todos; sem interseção explica', async () => {
    montar();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Selecionar KNCA11' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar PETR4' }));
    const barra = screen.getByRole('region', { name: 'Ações em lote' });
    expect(within(barra).getByText('2 selecionados')).toBeInTheDocument();
    const select = within(barra).getByLabelText('Mover para') as HTMLSelectElement;
    const rotulos = Array.from(select.options).map((o) => o.textContent);
    expect(rotulos).toContain('Ações › Growth');
    expect(rotulos.some((r) => r?.startsWith('Reserva'))).toBe(false);
    fireEvent.change(select, { target: { value: 'acoes|growth' } });
    fireEvent.click(within(barra).getByRole('button', { name: 'Aplicar' }));
    expect(primario()).toHaveTextContent('Salvar 2 mudanças');
    expect(screen.queryByRole('region', { name: 'Ações em lote' })).toBeNull();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar PETR4' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar CDB XP 102% CDI' }));
    expect(screen.getByText(TEXTO_SEM_DESTINO_COMUM)).toBeInTheDocument();
  });

  it('"marcar todos" da faixa marca os itens com escolha (estado misto antes)', async () => {
    montar();
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Selecionar HGLG11' }));
    const todos = screen.getByRole('checkbox', { name: "Selecionar todos de FII's" });
    expect((todos as HTMLInputElement).indeterminate).toBe(true);
    fireEvent.click(todos);
    expect(screen.getByRole('checkbox', { name: 'Selecionar KNCA11' })).toBeChecked();
    const barra = screen.getByRole('region', { name: 'Ações em lote' });
    expect(within(barra).getByText('2 selecionados')).toBeInTheDocument();
  });

  it('"Está tudo certo" manda só confirmarIds (os para-revisar exibidos)', async () => {
    respostaPost = () => ok({ confirmados: 5 });
    const { onConcluido } = montar();
    await screen.findByText('Ações');
    fireEvent.click(primario());
    await waitFor(() => expect(onConcluido).toHaveBeenCalled());
    expect(posts()).toHaveLength(1);
    expect(posts()[0].body).toEqual({
      itens: [],
      confirmarIds: [lista.petr4, lista.wege3, lista.hglg11, lista.knca11, lista.cdb].map(
        (i) => i.bankInvestmentId,
      ),
    });
    expect(document.querySelector('[data-mf-destinos-toast]')).toBeNull();
  });

  it('"Conferir depois" fecha sem gravar', async () => {
    const { onFechar, onConcluido } = montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Conferir depois' }));
    expect(onFechar).toHaveBeenCalled();
    expect(onConcluido).not.toHaveBeenCalled();
    expect(posts()).toHaveLength(0);
  });

  it('409: alerta "nenhum mudou" com o motivo por item e as escolhas preservadas', async () => {
    respostaPost = () => ({
      status: 409,
      body: {
        error: 'Não foi possível salvar',
        erros: [{ id: lista.knca11.bankInvestmentId, nome: 'KNCA11', motivo: 'Já foi conferido' }],
      },
    });
    const { onConcluido } = montar();
    const painel = await abrirPainel('KNCA11');
    fireEvent.click(within(painel).getByRole('radio', { name: 'Fiagro' }));
    fireEvent.click(primario());
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(TEXTO_409);
    expect(alerta).toHaveTextContent('KNCA11 — Já foi conferido');
    expect(screen.getByText('não salvou')).toBeInTheDocument();
    expect(primario()).toHaveTextContent('Salvar 1 mudança');
    expect(primario()).not.toBeDisabled();
    expect(onConcluido).not.toHaveBeenCalled();
  });

  it('parcial: explica por item e oferece "Tentar de novo" só com o que falhou', async () => {
    respostaPost = () =>
      ok({
        aplicados: 1,
        confirmados: 3,
        parcial: true,
        erros: [{ id: lista.wege3.bankInvestmentId, nome: 'WEGE3', motivo: 'Mudou em outra tela' }],
        historicoIds: ['h1'],
      });
    const { onConcluido } = montar();
    let painel = await abrirPainel('KNCA11');
    fireEvent.click(within(painel).getByRole('radio', { name: 'Fiagro' }));
    painel = await abrirPainel('WEGE3');
    fireEvent.click(within(painel).getByRole('radio', { name: 'Growth' }));
    fireEvent.click(primario());
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent('1 investimento no lugar escolhido. Não deu para mudar:');
    expect(alerta).toHaveTextContent('WEGE3 — Mudou em outra tela');
    expect(primario()).toHaveTextContent('Tentar de novo (1)');
    expect(screen.getByText('salvo')).toBeInTheDocument();
    expect(onConcluido).not.toHaveBeenCalled();

    respostaPost = () => ok({ aplicados: 1, historicoIds: ['h2'] });
    fireEvent.click(primario());
    await waitFor(() => expect(onConcluido).toHaveBeenCalled());
    expect(posts()[1].body).toEqual({
      itens: [{ id: lista.wege3.bankInvestmentId, categoria: 'acoes', subgrupo: 'growth' }],
      confirmarIds: [lista.wege3.bankInvestmentId],
    });
    expect(onConcluido.mock.calls[0][0]).toMatchObject({
      aplicados: 2,
      historicoIds: ['h1', 'h2'],
    });
  });

  it('salvando: botões bloqueados e spinner no primário', async () => {
    let liberar: (r: Response) => void = () => {};
    montar();
    await screen.findByText('Ações');
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise<Response>((r) => (liberar = r)),
    );
    fireEvent.click(primario());
    await waitFor(() => expect(primario()).toHaveTextContent('Salvando…'));
    expect(primario()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Conferir depois' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fechar e conferir depois' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Selecionar PETR4' })).toBeDisabled();
    await act(async () => liberar(json(ok())));
  });

  it('sucesso: toast com Desfazer chama os undos em ordem reversa', async () => {
    respostaPost = () => ok({ aplicados: 3, historicoIds: ['h1', 'h2', 'h3'] });
    const { onConcluido } = montar();
    await screen.findByText('Ações');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar PETR4' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar WEGE3' }));
    fireEvent.change(screen.getByLabelText('Mover para'), { target: { value: 'acoes|growth' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    const painel = await abrirPainel('KNCA11');
    fireEvent.click(within(painel).getByRole('radio', { name: 'Fiagro' }));
    expect(primario()).toHaveTextContent('Salvar 3 mudanças');
    fireEvent.click(primario());
    await waitFor(() => expect(onConcluido).toHaveBeenCalled());
    expect(posts()[0].body).toMatchObject({
      itens: [
        { id: lista.petr4.bankInvestmentId, categoria: 'acoes', subgrupo: 'growth' },
        { id: lista.wege3.bankInvestmentId, categoria: 'acoes', subgrupo: 'growth' },
        { id: lista.knca11.bankInvestmentId, categoria: 'fimFia', subgrupo: 'fiagro' },
      ],
    });
    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('3 investimentos mudaram de lugar');
    expect(within(toast).getByRole('button', { name: 'Fechar aviso' }).className).toContain('h-11');
    // Acima do Modal (z-99999): salvando pela "Conexão realizada", o resumo reabre por baixo.
    expect(toast.closest('[data-mf-destinos-toast-camada]')?.className).toContain('z-[100000]');
    fireEvent.click(within(toast).getByRole('button', { name: 'Desfazer' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Pronto: 3 investimentos voltaram ao lugar sugerido.',
      ),
    );
    expect(undos()).toEqual(['h3', 'h2', 'h1']);
  });

  it('Desfazer parcial (409): "Desfeito em N; M foram mudados de novo"', async () => {
    respostaPost = () => ok({ aplicados: 3, historicoIds: ['h1', 'h2', 'h3'] });
    respostaUndo = (id) =>
      id === 'h2' ? { status: 409, body: { error: 'conflito' } } : { status: 200, body: {} };
    montar();
    await screen.findByText('Ações');
    const painel = await abrirPainel('KNCA11');
    fireEvent.click(within(painel).getByRole('radio', { name: 'Fiagro' }));
    fireEvent.click(primario());
    fireEvent.click(await screen.findByRole('button', { name: 'Desfazer' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Desfeito em 2; 1 foi mudado de novo.'),
    );
  });

  it('alvos de 44px: botão do destino e caixas de seleção', async () => {
    montar();
    const botao = await screen.findByRole('button', { name: /^Destino de PETR4/ });
    expect(botao.className).toContain('min-h-11');
    const caixa = screen.getByRole('checkbox', { name: 'Selecionar PETR4' });
    expect(caixa.closest('label')?.className).toContain('h-11');
    expect(screen.getByRole('button', { name: 'Conferir depois' }).className).toContain('min-h-11');
    expect(primario().className).toContain('min-h-11');
  });
});

describe('RevisarDestinos — celular (abaixo de lg)', () => {
  beforeEach(() => {
    belowLg.value = true;
  });

  it('tela cheia com cartões; "Trocar" abre o sheet e "Usar …" aplica', async () => {
    montar({ somenteNovos: true });
    await screen.findByText('Ações');
    expect(chamadas[0].url).toBe('/api/pluggy/carteira/destinos?paraRevisar=1');
    expect(document.querySelector('[data-mf-revisar-destinos="mobile"]')).not.toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    const trocar = screen.getByRole('button', { name: 'Trocar destino de KNCA11' });
    expect(trocar.className).toContain('min-h-11');
    fireEvent.click(trocar);
    const sheet = await screen.findByRole('dialog', { name: 'Onde KNCA11 vai entrar' });
    fireEvent.click(within(sheet).getByRole('radio', { name: /Fiagro/ }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Usar Fundos › Fiagro' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Onde KNCA11 vai entrar' })).toBeNull(),
    );
    const cartao = document.querySelector(
      `[data-mf-destino-cartao="${lista.knca11.bankInvestmentId}"]`,
    ) as HTMLElement;
    expect(within(cartao).getByText('Você escolheu')).toBeInTheDocument();
    expect(within(cartao).getByText('Fundos › Fiagro')).toBeInTheDocument();
    expect(primario()).toHaveTextContent('Salvar 1 mudança');
  });

  it('"Trocar todos" da faixa usa a interseção e aplica a todos', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: "Trocar todos de FII's" }));
    const sheet = await screen.findByRole('dialog', { name: "Onde os 2 de FII's vão ficar" });
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Fundos › Fiagro' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Usar para os 2' }));
    await waitFor(() => expect(primario()).toHaveTextContent('Salvar 2 mudanças'));
  });
});
