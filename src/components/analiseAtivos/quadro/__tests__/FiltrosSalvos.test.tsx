// @vitest-environment jsdom
/**
 * Bloco 1 (fatia B): filtros salvos do Quadro — aplicar reescreve a URL (janela, critérios,
 * setor, Na minha carteira + ?filtro=<id>) e marca o uso; "alterado" ao mexer nos chips; apagar
 * com confirmação na linha; Salvar filtros com Substituir no 409; consultor desabilitado.
 * Varredura de DOM com as flags ligadas.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import { mockFetchResponse } from '@/test/mocks/fetch';
import { esperarDomLimpo } from '@/test/utils/varrerDom';
import type { FiltroSalvoApi, FiltrosResposta } from '@/types/analiseAtivosSalvos';

const m = vi.hoisted(() => ({
  acting: null as null | { id: string; name: string },
  csrfFetch: vi.fn(),
  toast: vi.fn((_d: unknown) => 1),
  replace: vi.fn(),
  resposta: null as unknown,
}));

vi.mock('@/lib/prisma', () => ({ prisma: {}, default: {} }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: m.replace, prefetch: vi.fn() }),
  usePathname: () => '/analise-ativos',
  useSearchParams: () => new URLSearchParams(''),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ actingClient: m.acting }) }));
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: m.csrfFetch }) }));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => false, useMediaQuery: () => false }));
vi.mock('@/components/carteira/mover/moverToast', () => ({ mostrarToastMover: m.toast }));

import FiltrosSalvos, {
  estadoComFiltro,
  estadoFiltroDoQuadro,
  filtroAlterado,
  resumoFiltro,
} from '@/components/analiseAtivos/quadro/FiltrosSalvos';
import FaixaFiltroAplicado from '@/components/analiseAtivos/quadro/FaixaFiltroAplicado';
import ModalSalvarFiltro from '@/components/analiseAtivos/quadro/ModalSalvarFiltro';
import {
  lerEstadoQuadro,
  type EstadoQuadro,
} from '@/components/analiseAtivos/quadro/useEstadoQuadroUrl';
import { LIMITES_SALVOS } from '@/services/analiseAtivos/salvos/contrato';
import { definicoesChips } from '@/test/fixtures/analiseAtivos/criterios';

const ID1 = '11111111-2222-4333-8444-555555555555';
const ID2 = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const DEFS = definicoesChips('acao');

const F1: FiltroSalvoApi = {
  id: ID1,
  nome: 'Elétricas pagadoras',
  classe: 'acao',
  estado: { janela: 10, criterios: ['luc', 'rec'], naCarteira: false, setor: 'Energia Elétrica' },
  ajustado: false,
  atualizadoEm: '2026-10-15T12:00:00.000Z',
  ultimoUsoEm: null,
};
const F2: FiltroSalvoApi = {
  ...F1,
  id: ID2,
  nome: 'Na carteira',
  estado: { janela: 5, criterios: [], naCarteira: true, setor: null },
};

const ESTADO: EstadoQuadro = {
  ...lerEstadoQuadro(new URLSearchParams('modo=detalhado')),
};

function comCliente(ui: React.ReactElement) {
  return render(<QueryClientProvider client={createTestQueryClient()}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  m.acting = null;
  m.csrfFetch.mockReset();
  m.toast.mockReset();
  m.replace.mockReset();
  m.resposta = {
    filtros: [F1, F2],
    limites: LIMITES_SALVOS,
    podeSalvar: true,
    motivoSemSalvar: null,
  } satisfies FiltrosResposta;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => mockFetchResponse(m.resposta)),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('puros', () => {
  it('estadoComFiltro aplica janela/critérios/setor/carteira e mantém modo e ordem', () => {
    const e = estadoComFiltro(ESTADO, F1);
    expect(e).toMatchObject({
      janela: 10,
      criterios: ['rec', 'luc'],
      setor: 'Energia Elétrica',
      naCarteira: false,
      filtro: ID1,
      modo: 'detalhado',
    });
    expect(filtroAlterado(e, F1.estado)).toBe(false);
    expect(filtroAlterado({ ...e, criterios: ['rec'] }, F1.estado)).toBe(true);
    expect(filtroAlterado({ ...e, janela: 5 }, F1.estado)).toBe(true);
    expect(estadoFiltroDoQuadro(e)).toEqual({
      janela: 10,
      criterios: ['rec', 'luc'],
      naCarteira: false,
      setor: 'Energia Elétrica',
    });
    expect(resumoFiltro(F2.estado, 'acao', DEFS)).toBe('5 anos · Na minha carteira');
  });
});

describe('FiltrosSalvos', () => {
  it('lista da classe com "n de 20"; aplicar = URL com ?filtro=<id> + PATCH {usado:true}', async () => {
    m.csrfFetch.mockResolvedValue(mockFetchResponse(F1));
    comCliente(
      <FiltrosSalvos
        classe="acao"
        estado={ESTADO}
        definicoes={DEFS}
        temFiltro={false}
        celular={false}
        onSalvarFiltros={vi.fn()}
      />,
    );
    const botao = await screen.findByRole('button', { name: /Filtros salvos \(2\)/ });
    expect(screen.queryByRole('button', { name: /Salvar filtros/ })).toBeNull();
    fireEvent.click(botao);
    const dialogo = await screen.findByRole('dialog', { name: 'Filtros salvos · Ações' });
    expect(dialogo.textContent).toContain('2 de 20');
    esperarDomLimpo(dialogo);
    fireEvent.click(screen.getByRole('button', { name: /^Elétricas pagadoras/ }));
    expect(m.replace).toHaveBeenCalledTimes(1);
    const url = new URL(`http://x${m.replace.mock.calls[0][0]}`);
    expect(url.pathname).toBe('/analise-ativos');
    expect(url.searchParams.get('j')).toBe('10');
    expect(url.searchParams.get('c')).toBe('rec,luc');
    expect(url.searchParams.get('s')).toBe('Energia Elétrica');
    expect(url.searchParams.get('filtro')).toBe(ID1);
    expect(url.searchParams.get('modo')).toBe('detalhado');
    await waitFor(() => expect(m.csrfFetch).toHaveBeenCalled());
    expect(m.csrfFetch.mock.calls[0][0]).toBe(`/api/analise-ativos/filtros/${ID1}`);
    expect(JSON.parse(m.csrfFetch.mock.calls[0][1].body)).toEqual({ usado: true });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('apagar pede confirmação na própria linha e faz DELETE', async () => {
    m.csrfFetch.mockResolvedValue(mockFetchResponse({ ok: true }));
    comCliente(
      <FiltrosSalvos
        classe="acao"
        estado={ESTADO}
        definicoes={DEFS}
        temFiltro
        celular={false}
        onSalvarFiltros={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Filtros salvos \(2\)/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Apagar o filtro Na carteira' }));
    expect(screen.getByRole('alert').textContent).toContain('Apagar Na carteira?');
    fireEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(m.csrfFetch).toHaveBeenCalled());
    expect(m.csrfFetch.mock.calls[0][0]).toBe(`/api/analise-ativos/filtros/${ID2}`);
    expect(m.csrfFetch.mock.calls[0][1].method).toBe('DELETE');
    await waitFor(() =>
      expect(m.toast).toHaveBeenCalledWith(
        expect.objectContaining({ mensagem: 'Filtro Na carteira apagado.' }),
      ),
    );
  });

  it('"Salvar filtros" só com filtro ligado e sem filtro salvo aplicado', async () => {
    const onSalvar = vi.fn();
    const { rerender } = comCliente(
      <FiltrosSalvos
        classe="acao"
        estado={ESTADO}
        definicoes={DEFS}
        temFiltro
        celular={false}
        onSalvarFiltros={onSalvar}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Salvar filtros/ }));
    expect(onSalvar).toHaveBeenCalled();
    rerender(
      <QueryClientProvider client={createTestQueryClient()}>
        <FiltrosSalvos
          classe="acao"
          estado={{ ...ESTADO, filtro: ID1 }}
          definicoes={DEFS}
          temFiltro
          celular={false}
          onSalvarFiltros={onSalvar}
        />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('button', { name: /Salvar filtros/ })).toBeNull();
  });

  it('consultor: os dois botões desabilitados com o title', async () => {
    m.acting = { id: 'c', name: 'Ana' };
    m.resposta = {
      filtros: [],
      limites: LIMITES_SALVOS,
      podeSalvar: false,
      motivoSemSalvar: 'consultor',
    };
    comCliente(
      <FiltrosSalvos
        classe="acao"
        estado={ESTADO}
        definicoes={DEFS}
        temFiltro
        celular={false}
        onSalvarFiltros={vi.fn()}
      />,
    );
    const b = screen.getByRole('button', { name: /Filtros salvos/ });
    expect(b.hasAttribute('disabled')).toBe(true);
    expect(b.getAttribute('title')).toBe(
      'Filtros salvos são pessoais e não aparecem no modo consultor.',
    );
    expect(screen.getByRole('button', { name: /Salvar filtros/ }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});

describe('FaixaFiltroAplicado', () => {
  it('"alterado" + Salvar alterações / Salvar como novo / ×', () => {
    const cb = { a: vi.fn(), n: vi.fn(), t: vi.fn() };
    const { container, rerender } = render(
      <FaixaFiltroAplicado
        filtro={F1}
        alterado={false}
        onSalvarAlteracoes={cb.a}
        onSalvarComoNovo={cb.n}
        onTirar={cb.t}
      />,
    );
    expect(screen.getByRole('status').textContent).toContain('Filtro salvo: Elétricas pagadoras');
    expect(screen.queryByText('alterado')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Salvar alterações' })).toBeNull();
    rerender(
      <FaixaFiltroAplicado
        filtro={F1}
        alterado
        onSalvarAlteracoes={cb.a}
        onSalvarComoNovo={cb.n}
        onTirar={cb.t}
      />,
    );
    expect(screen.getByText('alterado')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar como novo' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Tirar o filtro salvo Elétricas pagadoras' }),
    );
    expect(cb.a).toHaveBeenCalled();
    expect(cb.n).toHaveBeenCalled();
    expect(cb.t).toHaveBeenCalled();
    esperarDomLimpo(container);
  });

  it('ajustado e não encontrado', () => {
    const { rerender } = render(
      <FaixaFiltroAplicado
        filtro={{ ...F1, ajustado: true }}
        alterado={false}
        onSalvarAlteracoes={vi.fn()}
        onSalvarComoNovo={vi.fn()}
        onTirar={vi.fn()}
      />,
    );
    expect(screen.getByText(/foi retirado/)).toBeTruthy();
    rerender(
      <FaixaFiltroAplicado
        filtro={null}
        alterado={false}
        onSalvarAlteracoes={vi.fn()}
        onSalvarComoNovo={vi.fn()}
        onTirar={vi.fn()}
      />,
    );
    expect(
      screen.getByText('Este filtro salvo não existe mais. Os filtros da tela continuam.'),
    ).toBeTruthy();
  });
});

describe('ModalSalvarFiltro', () => {
  it('POST com o estado; 409 → "Substituir?" e PATCH no existente', async () => {
    const onSalvo = vi.fn();
    const estado = {
      janela: 10 as const,
      criterios: ['rec' as const],
      naCarteira: true,
      setor: null,
    };
    m.csrfFetch
      .mockResolvedValueOnce(
        mockFetchResponse({ error: 'Já existe um filtro com esse nome.' }, 409),
      )
      .mockResolvedValueOnce(mockFetchResponse({ ...F1, estado }));
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ModalSalvarFiltro
          aberto
          onFechar={vi.fn()}
          classe="acao"
          estado={estado}
          definicoes={DEFS}
          filtros={[F1, F2]}
          onSalvo={onSalvo}
        />
      </QueryClientProvider>,
    );
    const dialogo = screen.getByRole('dialog');
    expect(dialogo.textContent).toContain('Janela: 10 anos');
    expect(dialogo.textContent).toContain('Só o que está na minha carteira');
    esperarDomLimpo(dialogo);
    const campo = screen.getByLabelText('Nome do filtro') as HTMLInputElement;
    expect(campo.value.length).toBeGreaterThan(0);
    expect(campo.value.length).toBeLessThanOrEqual(40);
    fireEvent.change(campo, { target: { value: 'elétricas  PAGADORAS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar filtros' }));
    expect(await screen.findByText('Já existe um filtro com esse nome. Substituir?')).toBeTruthy();
    const [, init] = m.csrfFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ nome: 'elétricas PAGADORAS', classe: 'acao', estado });
    fireEvent.click(screen.getByRole('button', { name: 'Substituir' }));
    await waitFor(() => expect(onSalvo).toHaveBeenCalled());
    expect(m.csrfFetch.mock.calls[1][0]).toBe(`/api/analise-ativos/filtros/${ID1}`);
    expect(m.csrfFetch.mock.calls[1][1].method).toBe('PATCH');
    expect(JSON.parse(m.csrfFetch.mock.calls[1][1].body)).toEqual({ estado });
  });

  it('no limite de 20 por classe: aviso e botão desabilitado', () => {
    const muitos = Array.from({ length: 20 }, (_, i) => ({ ...F1, id: `${i}`, nome: `F${i}` }));
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <ModalSalvarFiltro
          aberto
          onFechar={vi.fn()}
          classe="fii"
          estado={F2.estado}
          definicoes={[]}
          filtros={muitos}
          onSalvo={vi.fn()}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('alert').textContent).toContain(
      'Você chegou a 20 filtros salvos em FIIs',
    );
    expect(screen.getByRole('button', { name: 'Salvar filtros' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});
