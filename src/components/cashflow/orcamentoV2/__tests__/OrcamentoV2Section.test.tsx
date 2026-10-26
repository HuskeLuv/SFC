// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import type { OrcamentoV2Response } from '@/types/orcamentoV2';
import { AGORA, categoriaDe, montarPayload, subDe } from './payloadAnexoB';

const estado = vi.hoisted(() => ({ celular: false }));

vi.mock('@/context/CashflowYearContext', () => ({
  useCashflowYear: () => ({ year: 2026, setYear: vi.fn() }),
}));
vi.mock('@/hooks/useStableIsBelowLg', () => ({
  useStableIsBelowLg: () => estado.celular,
}));
vi.mock('@/hooks/useCsrf', () => ({
  useCsrf: () => ({
    csrfFetch: (url: string, init?: RequestInit) => fetch(url, { ...init, credentials: 'include' }),
  }),
  getCsrfToken: () => 'csrf',
}));

import OrcamentoV2Section from '../OrcamentoV2Section';

type Rota = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined;

let payloadMes: OrcamentoV2Response;
let fetchMock: ReturnType<typeof vi.fn>;
let extra: Rota | null;

function instalarFetch() {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const r = extra?.(url, init);
    if (r) return r;
    const metodo = init?.method ?? 'GET';
    if (metodo === 'GET' && url.startsWith('/api/cashflow/orcamento/v2?')) {
      const qs = new URLSearchParams(url.split('?')[1]);
      if (qs.get('visao') === 'ano') return mockFetchResponse(montarPayload({ visao: 'ano' }));
      if (qs.get('fonte') === 'consolidado') {
        return mockFetchResponse(montarPayload({ fonte: 'consolidado' }));
      }
      return mockFetchResponse(payloadMes);
    }
    if (url === '/api/cashflow/orcamento/v2/prefs') return mockFetchResponse({});
    return mockFetchResponse({ error: `rota não mockada: ${metodo} ${url}` }, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
}

function renderSecao() {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <OrcamentoV2Section />
    </QueryClientProvider>,
  );
}

const chamadas = (metodo: string, prefixo: string) =>
  fetchMock.mock.calls.filter(
    ([url, init]) => (init?.method ?? 'GET') === metodo && String(url).startsWith(prefixo),
  );
const corpo = (init: RequestInit) => JSON.parse(String(init.body));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AGORA);
  estado.celular = false;
  payloadMes = montarPayload();
  extra = null;
  instalarFetch();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('OrcamentoV2Section (desktop)', () => {
  it('esqueleto enquanto carrega; depois a moldura da aba atual, KPIs e a tabela', async () => {
    const { container } = renderSecao();
    expect(container.querySelector('[data-mf-orcamento-v2]')).not.toBeNull();
    expect(screen.getByLabelText('Carregando orçamento')).toHaveAttribute('aria-busy', 'true');

    expect(await screen.findByRole('button', { name: 'Recolher todas' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Mês' })).toHaveValue('10');
    expect(screen.getByRole('button', { name: 'Mês' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Lançado' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-mf-orcamento-referencia]')).toHaveTextContent(
      'Lançado até 23/10 · 8 dias para fechar o mês',
    );
    expect(container.querySelectorAll('[data-mf-kpi]')).toHaveLength(5);
    expect(chamadas('GET', '/api/cashflow/orcamento/v2?')[0][0]).toBe(
      '/api/cashflow/orcamento/v2?ano=2026&mes=10&visao=mes',
    );
  });

  it('T06: editar Mercado 1.400 → 1.500 recalcula categoria, total e KPIs na hora (otimista)', async () => {
    // O PUT fica pendente: o que aparece é o palpite com as regras puras.
    extra = (url, init) =>
      init?.method === 'PUT' && url.includes('/orcado')
        ? new Promise<Response>(() => {})
        : undefined;
    const { container } = renderSecao();
    const input = await screen.findByRole('textbox', { name: 'Orçado de Mercado em Habitação' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1.500,00' } });
    fireEvent.blur(input);

    const hab = categoriaDe(payloadMes, 'Habitação');
    const mercado = subDe(payloadMes, 'Habitação', 'Mercado');
    await waitFor(() =>
      expect(
        container.querySelector(`tr[data-categoria-id="${hab.id}"]`)!.querySelectorAll('td')[2],
      ).toHaveTextContent('5.350,00'),
    );
    expect(container.querySelector('tr[data-mf-linha="total"]')).toHaveTextContent('18.114,90');
    expect(container.querySelector('[data-mf-kpi="disponivel"]')).toHaveTextContent('R$ 1.938,90');
    expect(
      container.querySelector(`tr[data-item-id="${mercado.id}"] [data-mf-consumo]`),
    ).toHaveTextContent('75%');

    const [url, init] = chamadas('PUT', '/api/cashflow/orcamento/v2/subcategorias/')[0];
    expect(url).toBe(`/api/cashflow/orcamento/v2/subcategorias/${mercado.id}/orcado`);
    expect(corpo(init)).toEqual({ ano: 2026, mes: 10, valor: 1500 });
  });

  it('Mês | Acumulado: o acumulado recarrega com visao=ano, fica somente leitura e sem "Copiar"', async () => {
    renderSecao();
    await screen.findByRole('button', { name: /Copiar de/ });
    fireEvent.click(screen.getByRole('button', { name: 'Acumulado do ano' }));
    await screen.findByRole('row', { name: /Total acumulado/ });
    expect(
      chamadas('GET', '/api/cashflow/orcamento/v2?').some(([u]) => String(u).includes('visao=ano')),
    ).toBe(true);
    expect(screen.queryByRole('textbox', { name: /Orçado de/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Copiar de/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Acumulado do ano' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('Lançado | Consolidado: recarrega com a fonte e salva a preferência (R-14)', async () => {
    const { container } = renderSecao();
    await screen.findByRole('button', { name: 'Recolher todas' });
    fireEvent.click(screen.getByRole('button', { name: 'Consolidado' }));
    await waitFor(() =>
      expect(container.querySelector('[data-mf-kpi="realizado"]')).toHaveTextContent(
        'Realizado até dia 23',
      ),
    );
    expect(
      chamadas('GET', '/api/cashflow/orcamento/v2?').some(([u]) =>
        String(u).includes('fonte=consolidado'),
      ),
    ).toBe(true);
    const prefs = chamadas('PUT', '/api/cashflow/orcamento/v2/prefs');
    expect(prefs).toHaveLength(1);
    expect(corpo(prefs[0][1])).toEqual({ fonte: 'consolidado' });
    expect(screen.getByRole('button', { name: 'Consolidado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('T30: o "?" mostra o texto da P1 revisto', async () => {
    renderSecao();
    await screen.findByRole('button', { name: 'Recolher todas' });
    const ajuda = screen.getByRole('button', { name: /^Ajuda:/ });
    fireEvent.focus(ajuda);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Lançado: tudo o que está no Fluxo do mês. Consolidado: só valores marcados como Pago/Recebido',
    );
  });

  it('Copiar (Q8): mês com orçado abre o diálogo de 3 saídas', async () => {
    payloadMes = { ...payloadMes, copiarDe: { ano: 2026, mes: 9, temOrcado: true } };
    extra = (url) =>
      url === '/api/cashflow/orcamento/v2/copiar'
        ? mockFetchResponse({ copiados: 70, ignorados: 2 })
        : undefined;
    renderSecao();
    const botao = await screen.findByRole('button', { name: 'Copiar de set/26' });

    // Cancelar: nada é copiado.
    fireEvent.click(botao);
    let dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText('Outubro 2026 já tem orçados')).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(chamadas('POST', '/api/cashflow/orcamento/v2/copiar')).toHaveLength(0);

    // Só preencher vazios → sobrescrever: false.
    fireEvent.click(botao);
    dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Só preencher vazios' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Orçado de set/26 copiado — ajuste o que mudou (2 subcategorias já preenchidas ficaram como estavam).',
    );
    expect(corpo(chamadas('POST', '/api/cashflow/orcamento/v2/copiar')[0][1])).toEqual({
      de: { ano: 2026, mes: 9 },
      para: { ano: 2026, mes: 10 },
      sobrescrever: false,
    });

    // Substituir tudo → sobrescrever: true.
    fireEvent.click(await screen.findByRole('button', { name: 'Copiar de set/26' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Substituir tudo' }),
    );
    await waitFor(() =>
      expect(chamadas('POST', '/api/cashflow/orcamento/v2/copiar')).toHaveLength(2),
    );
    expect(corpo(chamadas('POST', '/api/cashflow/orcamento/v2/copiar')[1][1]).sobrescrever).toBe(
      true,
    );
  });

  it('Copiar: mês vazio copia direto, sem diálogo; origem sem orçado desabilita o botão', async () => {
    payloadMes = {
      ...montarPayload({ orcados: [] }),
      copiarDe: { ano: 2026, mes: 9, temOrcado: true },
    };
    extra = (url) =>
      url === '/api/cashflow/orcamento/v2/copiar'
        ? mockFetchResponse({ copiados: 70, ignorados: 0 })
        : undefined;
    const { unmount } = renderSecao();
    fireEvent.click(await screen.findByRole('button', { name: 'Copiar de set/26' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(chamadas('POST', '/api/cashflow/orcamento/v2/copiar')).toHaveLength(1),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Orçado de set/26 copiado — ajuste o que mudou.',
    );
    unmount();

    payloadMes = { ...montarPayload(), copiarDe: { ano: 2026, mes: 9, temOrcado: false } };
    renderSecao();
    expect(await screen.findByRole('button', { name: 'Copiar de set/26' })).toBeDisabled();
  });

  it('aviso "orçados anteriores em Geral": Entendi marca avisoGeralVisto e o aviso some', async () => {
    payloadMes = { ...payloadMes, prefs: { ...payloadMes.prefs, avisoGeralPendente: true } };
    const { container } = renderSecao();
    await screen.findByText('Seus orçados anteriores estão em Geral.');
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    await waitFor(() => expect(container.querySelector('[data-mf-aviso-geral]')).toBeNull());
    expect(corpo(chamadas('PUT', '/api/cashflow/orcamento/v2/prefs')[0][1])).toEqual({
      avisoGeralVisto: true,
    });
  });

  it('adicionar subcategoria usa o POST da Planilha (/api/cashflow/items) e recarrega o v2', async () => {
    extra = (url, init) =>
      url === '/api/cashflow/items' && init?.method === 'POST'
        ? mockFetchResponse({ id: 'it-novo' })
        : undefined;
    renderSecao();
    fireEvent.click(
      await screen.findByRole('button', { name: '+ Adicionar subcategoria em Lazer' }),
    );
    const input = screen.getByRole('textbox', { name: 'Nome da nova subcategoria em Lazer' });
    fireEvent.change(input, { target: { value: 'Shows e teatro' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(chamadas('POST', '/api/cashflow/items')).toHaveLength(1));
    const lazer = categoriaDe(payloadMes, 'Lazer');
    expect(corpo(chamadas('POST', '/api/cashflow/items')[0][1])).toMatchObject({
      groupId: lazer.id,
      name: 'Shows e teatro',
    });
    await waitFor(() =>
      expect(chamadas('GET', '/api/cashflow/orcamento/v2?').length).toBeGreaterThan(1),
    );
  });

  it('excluir chama o DELETE do v2 e avisa que os lançamentos foram para Geral', async () => {
    const bar = subDe(payloadMes, 'Lazer', 'Bar / Cafés');
    extra = (url, init) => {
      if (url.endsWith('/impacto')) {
        return mockFetchResponse({
          itemId: bar.id,
          nome: bar.nome,
          celulas: 7,
          transacoes: 0,
          mesesComOrcado: 1,
          coresDivergentes: [],
        });
      }
      if (init?.method === 'DELETE') {
        return mockFetchResponse({ celulasMovidas: 7, celulasSomadas: 0, transacoesMovidas: 0 });
      }
      return undefined;
    };
    const { container } = renderSecao();
    await screen.findByRole('button', { name: 'Recolher todas' });
    fireEvent.click(
      within(container.querySelector<HTMLElement>(`tr[data-item-id="${bar.id}"]`)!).getByRole(
        'button',
        { name: /Mais ações/ },
      ),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Excluir subcategoria' }));
    const dialogo = await screen.findByRole('dialog');
    await within(dialogo).findByText('Os 7 lançamentos desta subcategoria passam para Geral.');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Subcategoria excluída');
    expect(chamadas('DELETE', '/api/cashflow/orcamento/v2/subcategorias/')[0][0]).toBe(
      `/api/cashflow/orcamento/v2/subcategorias/${bar.id}`,
    );
  });
});

describe('OrcamentoV2Section (abaixo de lg)', () => {
  it('troca a tabela pelos cartões (PR 11): herói, cartões por categoria e nenhuma <table>', async () => {
    estado.celular = true;
    const { container } = renderSecao();
    expect(container.querySelector('[data-mf-orcamento-v2]')).not.toBeNull();
    expect(
      await screen.findByRole('list', { name: 'Orçamento por categoria' }),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-mf-orcamento-v2-celular]')).not.toBeNull();
    expect(container.querySelector('[data-mf-orcamento-heroi]')).not.toBeNull();
    expect(container.querySelector('table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Recolher todas' })).not.toBeNull();
    expect(container.querySelectorAll('li[data-mf-card]')).toHaveLength(
      payloadMes.categorias.length,
    );
  });

  it('editar o orçado no cartão faz o PUT do v2 pelo hook (otimista)', async () => {
    estado.celular = true;
    extra = (url, init) =>
      init?.method === 'PUT' && url.includes('/orcado')
        ? new Promise<Response>(() => {})
        : undefined;
    const { container } = renderSecao();
    const input = await screen.findByRole('textbox', { name: 'Orçado de Mercado em Habitação' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1.500,00' } });
    fireEvent.blur(input);

    const mercado = subDe(payloadMes, 'Habitação', 'Mercado');
    await waitFor(() =>
      expect(chamadas('PUT', '/api/cashflow/orcamento/v2/subcategorias/')).toHaveLength(1),
    );
    const [url, init] = chamadas('PUT', '/api/cashflow/orcamento/v2/subcategorias/')[0];
    expect(url).toBe(`/api/cashflow/orcamento/v2/subcategorias/${mercado.id}/orcado`);
    expect(corpo(init)).toEqual({ ano: 2026, mes: 10, valor: 1500 });
    await waitFor(() =>
      expect(container.querySelector('[data-mf-heroi-disponivel]')).toHaveTextContent(
        'R$ 1.938,90',
      ),
    );
  });

  it('Mês | Acumulado no celular recarrega com visao=ano e deixa o orçado só leitura', async () => {
    estado.celular = true;
    renderSecao();
    await screen.findByRole('list', { name: 'Orçamento por categoria' });
    fireEvent.click(screen.getByRole('button', { name: 'Acumulado' }));
    await waitFor(() => expect(screen.getByText('Total acumulado')).toBeInTheDocument());
    expect(
      chamadas('GET', '/api/cashflow/orcamento/v2?').some(([u]) => String(u).includes('visao=ano')),
    ).toBe(true);
    expect(screen.queryByRole('textbox', { name: /Orçado de/ })).toBeNull();
  });
});
