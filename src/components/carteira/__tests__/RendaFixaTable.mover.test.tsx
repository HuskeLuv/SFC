// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import type { RendaFixaAtivo, RendaFixaData } from '@/types/rendaFixa';

/**
 * Mover nas tabelas da Renda Fixa (fase 2, Fatia E): alça ⠿, menu ⋯ e selos SÓ quando a rota
 * libera a linha (chave MOVER_CAIXA_RF_HABILITADO ligada). Chave desligada = as linhas vêm com
 * `naoMovivelMotivo` e o DOM é o mesmo de antes (snapshot gravado a partir do código da main).
 */

const h = vi.hoisted(() => ({
  belowLg: false,
  data: null as RendaFixaData | null,
  restaurar: vi.fn(),
  pendingId: undefined as string | undefined,
}));

vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => h.belowLg }));
vi.mock('@/hooks/useRendaFixa', () => ({
  useRendaFixa: () => ({
    data: h.data,
    loading: false,
    error: null,
    formatCurrency: (v: number) => `R$ ${(v ?? 0).toFixed(2)}`,
    formatPercentage: (v: number) => `${(v ?? 0).toFixed(2)}%`,
    updateCaixaParaInvestir: vi.fn(),
    updateRendaFixaCampo: vi.fn(),
  }),
}));
vi.mock('@/hooks/useMoverInvestimento', () => ({
  useMoverInvestimento: () => ({
    mover: vi.fn(),
    restaurar: h.restaurar,
    isPending: false,
    pendingId: h.pendingId,
  }),
}));
vi.mock('@/hooks/useMoverOpcoes', () => ({
  useMoverOpcoes: () => ({
    data: { original: { categoria: 'rendaFixaFundos', label: 'Pós-fixada' } },
    isLoading: false,
  }),
}));
vi.mock('@/components/carteira/mover/MoverInvestimento', () => ({
  MoverInvestimento: ({ alvo }: { alvo: { id: string } }) => (
    <div role="dialog" data-testid="dialogo-mover" data-alvo={alvo.id} />
  ),
}));
vi.mock('@/context/CarteiraResumoContext', () => ({
  useCarteiraResumoContext: () => ({ necessidadeAporteMap: {} }),
}));
vi.mock('@/icons', () => ({
  ChevronDownIcon: () => <span />,
  ChevronUpIcon: () => <span />,
}));
vi.mock('@/components/carteira/shared/CaixaParaInvestirCard', () => ({
  default: () => <div data-testid="caixa" />,
}));

import RendaFixaTable from '@/components/carteira/RendaFixaTable';

const MOTIVO_OFF = 'Mover indisponível';

const ativo = (over: Partial<RendaFixaAtivo>): RendaFixaAtivo => ({
  id: 'p1',
  nome: 'CDB Banco X',
  valorAtualizado: 11000,
  riscoPorAtivo: 0,
  percentualCarteira: 0,
  rentabilidade: 10,
  valorInicialAplicado: 10000,
  aporte: 0,
  resgate: 0,
  percentualRentabilidade: 10,
  cotizacaoResgate: 'D+0',
  liquidacaoResgate: 'No vencimento',
  vencimento: new Date('2030-01-10T00:00:00Z'),
  benchmark: '110% CDI',
  tipo: 'pos-fixada',
  ...over,
});

function setData(ativos: RendaFixaAtivo[]) {
  const porTipo = (tipo: string) => ativos.filter((a) => a.tipo === tipo);
  h.data = {
    resumo: {
      necessidadeAporte: 0,
      caixaParaInvestir: 0,
      saldoInicioMes: 0,
      saldoAtual: 0,
      rendimento: 0,
      rentabilidade: 0,
    },
    secoes: (['pos-fixada', 'prefixada', 'hibrida'] as const)
      .filter((t) => porTipo(t).length > 0)
      .map((tipo) => ({
        tipo,
        nome: tipo,
        ativos: porTipo(tipo),
        totalValorAplicado: 0,
        totalAporte: 0,
        totalResgate: 0,
        totalValorAtualizado: porTipo(tipo).reduce((s, a) => s + a.valorAtualizado, 0),
        percentualTotal: 0,
        rentabilidadeMedia: 0,
      })),
    totalGeral: {
      valorAplicado: 0,
      aporte: 0,
      resgate: 0,
      valorAtualizado: 0,
      rentabilidade: 0,
    },
  } as unknown as RendaFixaData;
}

/** Linhas da chave DESLIGADA: a rota marca todas com naoMovivelMotivo. */
const linhasChaveOff = () => [
  ativo({ id: 'p1', nome: 'CDB Banco X', naoMovivelMotivo: MOTIVO_OFF }),
  ativo({
    id: 'p2',
    nome: 'Tesouro Prefixado 2029',
    tipo: 'prefixada',
    benchmark: 'Prefixado',
    isAutoUpdated: true,
    naoMovivelMotivo: MOTIVO_OFF,
  }),
];

/** Chave LIGADA: linhas sem motivo (movíveis); p2 já foi movido para cá. */
const linhasChaveOn = () => [
  ativo({ id: 'p1', nome: 'CDB Banco X' }),
  ativo({
    id: 'p2',
    nome: 'Tesouro Prefixado 2029',
    tipo: 'prefixada',
    benchmark: 'Prefixado',
    isAutoUpdated: true,
    movido: true,
    movidoEm: '2026-10-02T13:00:00.000Z',
  }),
  ativo({ id: 'p3', nome: 'LCI travada', tipo: 'hibrida', naoMovivelMotivo: 'Outro motivo' }),
];

function renderTabela() {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <RendaFixaTable totalCarteira={100000} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.belowLg = false;
  h.pendingId = undefined;
  h.restaurar.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('RendaFixaTable — chave do mover DESLIGADA', () => {
  it('desktop: DOM idêntico ao da main (snapshot)', () => {
    setData(linhasChaveOff());
    const { container } = renderTabela();
    expect(container.querySelector('[data-mover-alca]')).toBeNull();
    expect(container.querySelector('[data-mover-menu]')).toBeNull();
    expect(container.querySelector('[data-mover-linha]')).toBeNull();
    expect(container.querySelector('[data-carteira-dnd]')).toBeNull();
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('celular: DOM idêntico ao da main (snapshot), cartão aberto sem "Mover"', () => {
    h.belowLg = true;
    setData(linhasChaveOff());
    const { container } = renderTabela();
    fireEvent.click(screen.getAllByRole('button', { expanded: false })[1]);
    expect(container.querySelector('[data-mover-card]')).toBeNull();
    expect(container.innerHTML).toMatchSnapshot();
  });
});

describe('RendaFixaTable — chave do mover LIGADA', () => {
  it('alça e menu só nas linhas com alvo; coluna "Ações" e placeholders com a célula extra', () => {
    setData(linhasChaveOn());
    const { container } = renderTabela();
    expect(container.querySelector('[data-carteira-dnd]')).not.toBeNull();
    expect(container.querySelector('[data-mover-alca="p1"]')).not.toBeNull();
    expect(container.querySelector('[data-mover-alca="p2"]')).not.toBeNull();
    expect(container.querySelector('[data-mover-alca="p3"]')).toBeNull();
    expect(container.querySelector('[data-mover-menu="p3"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Arrastar CDB Banco X' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ações de CDB Banco X' })).toBeInTheDocument();

    const header = container.querySelector('thead tr')!;
    expect(header.querySelectorAll('th')).toHaveLength(14);
    expect(within(header as HTMLElement).getByText('Ações')).toHaveClass('sr-only');
    // Todas as linhas do corpo com a mesma largura (placeholders com colSpan 14).
    container.querySelectorAll('tbody tr').forEach((tr) => {
      const cols = Array.from(tr.querySelectorAll('td')).reduce(
        (s, td) => s + (Number(td.getAttribute('colspan')) || 1),
        0,
      );
      expect(cols).toBe(14);
    });
  });

  it('faixas Pós/Pré/Híbrida não são alvo de soltar (seção derivada)', () => {
    setData(linhasChaveOn());
    const { container } = renderTabela();
    expect(container.querySelector('[data-mover-secao]')).toBeNull();
    expect(container.querySelectorAll('tbody')).toHaveLength(1);
  });

  it('selo "movido" só no item movido', () => {
    setData(linhasChaveOn());
    const { container } = renderTabela();
    const movidos = container.querySelectorAll('[data-mf-movido]');
    expect(movidos).toHaveLength(1);
    expect(movidos[0].closest('tr')).toHaveAttribute('data-mover-linha', 'p2');
  });

  it('menu do item movido: "Voltar para <aba>" primeiro, depois Mover para… e Abrir ativo', () => {
    setData(linhasChaveOn());
    renderTabela();
    fireEvent.click(screen.getByRole('button', { name: 'Ações de Tesouro Prefixado 2029' }));
    const itens = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(itens.map((i) => i.textContent?.split(/\s{2,}|·/)[0])).toEqual([
      expect.stringMatching(/^Voltar para Renda Fixa/),
      expect.stringMatching(/^Mover para…/),
      'Abrir ativo',
    ]);
    fireEvent.click(itens[0]);
    expect(h.restaurar).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p2', categoria: 'rendaFixaFundos', secaoAtual: 'prefixada' }),
    );
  });

  it('menu de item não movido: Abrir ativo e Mover para…, que abre o diálogo', () => {
    setData(linhasChaveOn());
    renderTabela();
    fireEvent.click(screen.getByRole('button', { name: 'Ações de CDB Banco X' }));
    const itens = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(itens).toHaveLength(2);
    expect(itens[0]).toHaveTextContent('Abrir ativo');
    act(() => {
      fireEvent.click(itens[1]);
    });
    expect(screen.getByTestId('dialogo-mover')).toHaveAttribute('data-alvo', 'p1');
  });

  it('linha pendente a 60% com "Movendo…" e alça desligada', () => {
    h.pendingId = 'p1';
    setData(linhasChaveOn());
    const { container } = renderTabela();
    const tr = container.querySelector('[data-mover-linha="p1"]')!;
    expect(tr).toHaveClass('opacity-60');
    expect(tr).toHaveAttribute('aria-busy', 'true');
    expect(within(tr as HTMLElement).getByText('Movendo…')).toBeInTheDocument();
    expect(container.querySelector('[data-mover-alca="p1"]')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(container.querySelector('[data-mover-menu="p1"]')).toBeDisabled();
  });

  it('celular: cartão aberto com "Mover" de 44px e selo "movido"', () => {
    h.belowLg = true;
    setData(linhasChaveOn());
    const { container } = renderTabela();
    expect(container.querySelector('[data-carteira-dnd]')).toBeNull();
    expect(container.querySelector('[data-mover-alca]')).toBeNull();
    expect(container.querySelectorAll('[data-mf-movido]')).toHaveLength(1);
    const cdb = screen.getByText('CDB Banco X').closest('[aria-expanded]') as HTMLElement;
    fireEvent.click(cdb);
    const btn = screen.getByRole('button', { name: 'Mover CDB Banco X' });
    expect(btn).toHaveClass('min-h-11');
    act(() => {
      fireEvent.click(btn);
    });
    expect(screen.getByTestId('dialogo-mover')).toHaveAttribute('data-alvo', 'p1');
  });
});
