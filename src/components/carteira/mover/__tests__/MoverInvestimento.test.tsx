// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MoverOpcoesResponse } from '@/lib/carteiraMover';
import { opcoesCdb, opcoesHglgMovido, opcoesIvvb, opcoesKdif } from './fixtures';

const { mostrarToastMover, belowLg } = vi.hoisted(() => ({
  mostrarToastMover: vi.fn(),
  belowLg: { value: false },
}));
vi.mock('@/components/carteira/mover/moverToast', () => ({ mostrarToastMover }));
vi.mock('@/hooks/useMediaQuery', () => ({
  useIsBelowLg: () => belowLg.value,
  useMediaQuery: () => belowLg.value,
}));

import MoverInvestimento from '../MoverInvestimento';
import { NaCarteiraCartao, NaCarteiraLinha } from '../AtivoNaCarteira';
import { MovidoBadge } from '../MovidoBadge';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const fetchMock = vi.fn();

function montar(
  opcoes: MoverOpcoesResponse,
  { postStatus = 200, onClose = vi.fn() }: { postStatus?: number; onClose?: () => void } = {},
) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (String(url).startsWith('/api/carteira/mover?'))
      return Promise.resolve(jsonResponse(opcoes));
    if (url === '/api/carteira/mover' && init?.method === 'POST') {
      return Promise.resolve(
        postStatus === 200
          ? jsonResponse({
              ok: true,
              origem: { categoria: 'fiis', subgrupo: 'fofi' },
              destino: { categoria: 'fiis', subgrupo: 'infra' },
              objetivoZerado: false,
              historicoId: 'h1',
            })
          : jsonResponse({ error: 'falhou' }, postStatus),
      );
    }
    return Promise.resolve(jsonResponse({ secoes: [] }));
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MoverInvestimento alvo={{ tipo: 'posicao', id: opcoes.item.id }} open onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

const postBody = () =>
  JSON.parse(fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')![1].body as string);

beforeEach(() => {
  belowLg.value = false;
  fetchMock.mockReset();
  mostrarToastMover.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MoverInvestimento — diálogo (computador)', () => {
  it('abre com a aba atual primeiro e a seção atual marcada "atual" e desabilitada', async () => {
    montar(opcoesKdif());
    const dialog = await screen.findByRole('dialog', { name: 'Mover KDIF11' });
    await within(dialog).findByText(/Hoje em/);
    const grupos = within(dialog).getAllByRole('group');
    expect(grupos[0]).toHaveAccessibleName(/FII's/);
    const atual = within(grupos[0]).getByRole('radio', {
      name: /FOF \(Fundos de Fundos\) · atual/,
    });
    expect(atual).toBeDisabled();
    expect(within(grupos[0]).getByRole('radio', { name: 'Infra' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Mover' })).toBeDisabled();
  });

  it('lista as abas indisponíveis com o motivo de cada uma', async () => {
    montar(opcoesKdif());
    const resumo = await screen.findByText(/abas não aceitam KDIF11/);
    const lista = resumo.closest('details')!;
    expect(lista).toHaveTextContent('Stocks: Em reais — esta aba é em dólar');
    expect(lista).toHaveTextContent("REIT's: Em reais — esta aba é em dólar");
    expect(lista).toHaveTextContent('Renda Fixa: Ainda não dá para mover ativos para esta aba');
    // Abas permitidas não aparecem como indisponíveis.
    expect(lista).not.toHaveTextContent('Ações:');
  });

  it("ETF's: Brasil e EUA ficam habilitados (a moeda só trava a troca de aba)", async () => {
    montar(opcoesKdif());
    const etf = (await screen.findAllByRole('group')).find((g) => /ETF's/.test(g.textContent!))!;
    expect(within(etf).getByRole('radio', { name: 'Brasil' })).toBeEnabled();
    expect(within(etf).getByRole('radio', { name: 'EUA' })).toBeEnabled();
  });

  it("ETF em reais na aba ETF's pode ir para EUA", async () => {
    montar(opcoesIvvb());
    const etf = (await screen.findAllByRole('group'))[0];
    expect(etf).toHaveAccessibleName(/ETF's/);
    expect(within(etf).getByRole('radio', { name: /Brasil · atual/ })).toBeDisabled();
    expect(within(etf).getByRole('radio', { name: 'EUA' })).toBeEnabled();
  });

  it('troca de aba mostra o aviso do objetivo e do IR antes de confirmar', async () => {
    montar(opcoesKdif());
    const fundos = (await screen.findAllByRole('group')).find((g) =>
      /Fundos/.test(g.querySelector('legend')!.textContent!),
    )!;
    fireEvent.click(within(fundos).getByRole('radio', { name: 'Fiagro' }));
    expect(
      screen.getByText('O objetivo (%) volta para 0 na aba nova. Ajuste depois na aba.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('A aba é só organização: o IR continua pelo tipo do ativo (FII).'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mover para Fundos › Fiagro' })).toBeEnabled();
  });

  it('confirma com o payload do POST e fecha', async () => {
    const { onClose } = montar(opcoesKdif());
    const fii = (await screen.findAllByRole('group'))[0];
    fireEvent.click(within(fii).getByRole('radio', { name: 'Infra' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mover para Infra' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(postBody()).toEqual({
      acao: 'mover',
      tipo: 'posicao',
      id: 'pf-kdif',
      categoria: 'fiis',
      subgrupo: 'infra',
    });
    expect(mostrarToastMover).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'ok', mensagem: 'KDIF11 movido para Infra.' }),
    );
  });

  it('erro: fica aberto, mostra onde o ativo continua e preserva a escolha', async () => {
    const { onClose } = montar(opcoesKdif(), { postStatus: 500 });
    const fii = (await screen.findAllByRole('group'))[0];
    fireEvent.click(within(fii).getByRole('radio', { name: 'Infra' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mover para Infra' }));
    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(
      "Não foi possível mover KDIF11. Confira sua conexão e tente de novo. Ele continua em FII's › FOF (Fundos de Fundos).",
    );
    expect(within(fii).getByRole('radio', { name: 'Infra' })).toBeChecked();
    expect(onClose).not.toHaveBeenCalled();
    // O diálogo não usa toast de erro (o erro está nele).
    expect(mostrarToastMover).not.toHaveBeenCalled();
  });

  it('item movido: a aba de origem vem marcada e voltar a ela avisa que deixa de ter escolha manual', async () => {
    montar(opcoesHglgMovido());
    const fundos = (await screen.findAllByRole('group')).find((g) =>
      /aba de origem/.test(g.querySelector('legend')!.textContent!),
    )!;
    expect(within(fundos).getByRole('radio', { name: 'FIM · antes' })).toBeEnabled();
    fireEvent.click(within(fundos).getByRole('radio', { name: 'FIM · antes' }));
    expect(
      screen.getByText(
        'Voltando para Fundos, HGLG11 deixa de ter escolha manual e segue o tipo do catálogo.',
      ),
    ).toBeInTheDocument();
  });

  it('item fixo: só a frase, sem botão de mover', async () => {
    montar(opcoesCdb());
    expect(
      await screen.findByText('Renda Fixa ainda não pode ser movida para outra aba.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Mover/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
  });
});

describe('MoverInvestimento — painel do celular', () => {
  beforeEach(() => {
    belowLg.value = true;
  });

  it('opções em role=radio, a atual com "Atual", e o primário diz o destino', async () => {
    montar(opcoesKdif());
    const atual = await screen.findByRole('radio', { name: /FOF \(Fundos de Fundos\)\s*Atual/ });
    expect(atual).toHaveAttribute('aria-disabled', 'true');
    const grupoFii = screen.getByRole('radiogroup', { name: "Nesta aba · FII's" });
    fireEvent.click(within(grupoFii).getByRole('radio', { name: 'Infra' }));
    expect(within(grupoFii).getByRole('radio', { name: 'Infra' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Mover para Infra' })).toBeEnabled();
  });

  it('abas indisponíveis ficam recolhidas com o motivo', async () => {
    montar(opcoesKdif());
    const botao = await screen.findByRole('button', { name: /abas não aceitam KDIF11/ });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(botao);
    expect(screen.getAllByText(/Em reais — esta aba é em dólar/, { selector: 'li' })).toHaveLength(
      2,
    );
  });

  it('erro preserva a escolha e o painel continua aberto', async () => {
    const { onClose } = montar(opcoesKdif(), { postStatus: 500 });
    const grupoFii = await screen.findByRole('radiogroup', { name: "Nesta aba · FII's" });
    fireEvent.click(within(grupoFii).getByRole('radio', { name: 'Tijolo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mover para Tijolo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível mover KDIF11');
    expect(within(grupoFii).getByRole('radio', { name: 'Tijolo' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('MoverInvestimento — "voltar" do sistema (useMobileHistoryLayer)', () => {
  /** Como a Carteira e a página do ativo: montado, só o `open` vira false ao fechar. */
  function Pai({ opcoes }: { opcoes: MoverOpcoesResponse }) {
    const [aberto, setAberto] = React.useState(true);
    return (
      <MoverInvestimento
        alvo={{ tipo: 'posicao', id: opcoes.item.id }}
        open={aberto}
        onClose={() => setAberto(false)}
      />
    );
  }

  const montarPai = (opcoes: MoverOpcoesResponse) => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(opcoes)));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <Pai opcoes={opcoes} />
      </QueryClientProvider>,
    );
  };

  const camada = () => (window.history.state as Record<string, unknown> | null)?.__mfCamada ?? null;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('celular: abrir empilha uma entrada e o voltar do sistema fecha o painel', async () => {
    belowLg.value = true;
    const tamanho = window.history.length;
    const antes = camada();
    montarPai(opcoesKdif());
    await screen.findByRole('dialog', { name: 'Mover KDIF11' });
    expect(window.history.length).toBe(tamanho + 1);
    const empilhada = camada();
    expect(empilhada).not.toBeNull();
    expect(empilhada).not.toBe(antes);

    window.history.back();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // voltou para a entrada de antes (a do painel saiu)
    expect(camada()).toBe(antes);
  });

  it('celular: fechar pelo app desfaz a entrada empilhada (history.back)', async () => {
    belowLg.value = true;
    montarPai(opcoesKdif());
    const dialog = await screen.findByRole('dialog', { name: 'Mover KDIF11' });
    const back = vi.spyOn(window.history, 'back');
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Voltar' })[0]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('computador: o diálogo não mexe no histórico', async () => {
    belowLg.value = false;
    const push = vi.spyOn(window.history, 'pushState');
    montarPai(opcoesKdif());
    await screen.findByRole('dialog', { name: 'Mover KDIF11' });
    expect(push).not.toHaveBeenCalled();
  });
});

describe('Página do ativo — Na Carteira', () => {
  it('linha do computador: aba › seção clicável para a aba', () => {
    render(<NaCarteiraLinha opcoes={opcoesKdif()} onRestaurar={vi.fn()} />);
    const link = screen.getByRole('link', { name: "FII's › FOF (Fundos de Fundos)" });
    expect(link).toHaveAttribute('href', '/carteira?aba=fiis');
  });

  it('ativo fixo: só a frase, sem botão (decisão 7)', () => {
    render(<NaCarteiraLinha opcoes={opcoesCdb()} onRestaurar={vi.fn()} />);
    expect(
      screen.getByText('· Renda Fixa ainda não pode ser movida para outra aba.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    render(<NaCarteiraCartao opcoes={opcoesCdb()} onRestaurar={vi.fn()} onMover={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Mover' })).not.toBeInTheDocument();
  });

  it('movido: mostra quem/quando e "Voltar para…" chama restaurar', () => {
    const onRestaurar = vi.fn();
    render(<NaCarteiraLinha opcoes={opcoesHglgMovido()} onRestaurar={onRestaurar} />);
    expect(screen.getByText('· movido por você em 12/09/2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar para Fundos › FIM' }));
    expect(onRestaurar).toHaveBeenCalledTimes(1);
  });

  it('celular: linha própria com o botão Mover', () => {
    const onMover = vi.fn();
    render(<NaCarteiraCartao opcoes={opcoesKdif()} onRestaurar={vi.fn()} onMover={onMover} />);
    expect(screen.getByRole('region', { name: 'Na Carteira' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mover' }));
    expect(onMover).toHaveBeenCalled();
  });
});

describe('MovidoBadge', () => {
  it('texto acessível com autor e data; consultor e sem data', () => {
    const { rerender } = render(<MovidoBadge movidoEm="2026-10-01T12:00:00.000Z" />);
    expect(screen.getByText(', movido por você em 01/10/2026')).toBeInTheDocument();
    rerender(<MovidoBadge movidoEm="2026-10-01T12:00:00.000Z" viaConsultor />);
    expect(screen.getByText(', movido pelo consultor em 01/10/2026')).toBeInTheDocument();
    rerender(<MovidoBadge />);
    expect(screen.getByText(', Movido para cá manualmente')).toBeInTheDocument();
  });
});
