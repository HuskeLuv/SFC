// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { createTestQueryClient } from '@/test/wrappers';
import type { ReservaEmergenciaAtivo } from '@/hooks/useReservaEmergencia';

/**
 * Mover nas tabelas das Reservas (fase 2, Fatia E): alça ⠿, menu ⋯ e selos ("movido",
 * "saldo em conta") SÓ quando a rota libera a linha (chave MOVER_CAIXA_RF_HABILITADO ligada).
 * Chave desligada = linhas com `naoMovivelMotivo` e DOM igual ao da main (snapshot gravado a
 * partir do código da main).
 */

const h = vi.hoisted(() => ({
  belowLg: false,
  oportunidade: null as null | {
    ativos: unknown[];
    saldoInicioMes: number;
    rendimento: number;
    rentabilidade: number;
  },
  restaurar: vi.fn(),
  pendingId: undefined as string | undefined,
}));

vi.mock('@/hooks/useMediaQuery', () => ({ useIsBelowLg: () => h.belowLg }));
vi.mock('@/hooks/useReservaOportunidade', () => ({
  useReservaOportunidade: () => ({ data: h.oportunidade, loading: false, error: null }),
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
vi.mock('@/components/common/LoadingSpinner', () => ({ default: () => <div /> }));

import ReservaEmergenciaTable from '@/components/carteira/ReservaEmergenciaTable';
import ReservaOportunidadeTable from '@/components/carteira/ReservaOportunidadeTable';

const MOTIVO_OFF = 'Mover indisponível';

const linha = (over: Partial<ReservaEmergenciaAtivo>): ReservaEmergenciaAtivo => ({
  id: 'r1',
  nome: 'Conta Corrente Nubank',
  cotizacaoResgate: 'D+0',
  liquidacaoResgate: 'Imediata',
  vencimento: new Date('2026-10-02T00:00:00Z'),
  benchmark: 'CDI',
  valorInicial: 1000,
  aporte: 0,
  resgate: 0,
  valorAtualizado: 1010,
  percentualCarteira: 0,
  riscoAtivo: 0,
  rentabilidade: 1,
  ...over,
});

const chaveOff = () => [
  linha({ id: 'r1', naoMovivelMotivo: MOTIVO_OFF }),
  linha({
    id: 'r2',
    nome: 'CDB Liquidez Diária',
    vencimento: new Date('2028-05-01T00:00:00Z'),
    naoMovivelMotivo: MOTIVO_OFF,
  }),
];

const chaveOn = () => [
  linha({ id: 'r1', saldoEmConta: true } as Partial<ReservaEmergenciaAtivo>),
  linha({
    id: 'r2',
    nome: 'CDB Banco Inter',
    vencimento: new Date('2028-05-01T00:00:00Z'),
    liquidacaoResgate: 'No vencimento',
    benchmark: '110% CDI',
    movido: true,
    movidoEm: '2026-10-02T13:00:00.000Z',
  }),
];

type Aba = 'emergencia' | 'oportunidade';

function renderAba(aba: Aba, ativos: ReservaEmergenciaAtivo[]) {
  const qc = createTestQueryClient();
  h.oportunidade = { ativos, saldoInicioMes: 0, rendimento: 0, rentabilidade: 0 };
  return render(
    <QueryClientProvider client={qc}>
      {aba === 'emergencia' ? (
        <ReservaEmergenciaTable
          ativos={ativos}
          saldoInicioMes={0}
          rendimento={0}
          rentabilidade={0}
          totalCarteira={100000}
        />
      ) : (
        <ReservaOportunidadeTable totalCarteira={100000} />
      )}
    </QueryClientProvider>,
  );
}

const COLUNAS: Record<Aba, number> = { emergencia: 12, oportunidade: 13 };

beforeEach(() => {
  h.belowLg = false;
  h.pendingId = undefined;
  h.restaurar.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe.each<Aba>(['emergencia', 'oportunidade'])('%s — chave do mover DESLIGADA', (aba) => {
  it('desktop: DOM idêntico ao da main (snapshot)', () => {
    const { container } = renderAba(aba, chaveOff());
    expect(container.querySelector('[data-mover-alca]')).toBeNull();
    expect(container.querySelector('[data-mover-menu]')).toBeNull();
    expect(container.querySelector('[data-carteira-dnd]')).toBeNull();
    expect(container.querySelector('[data-mf-saldo-conta]')).toBeNull();
    expect(container.innerHTML).toMatchSnapshot();
  });

  it('celular: DOM idêntico ao da main (snapshot), cartão aberto sem "Mover"', () => {
    h.belowLg = true;
    const { container } = renderAba(aba, chaveOff());
    fireEvent.click(screen.getByText('Conta Corrente Nubank').closest('[aria-expanded]')!);
    expect(container.querySelector('[data-mover-card]')).toBeNull();
    expect(container.innerHTML).toMatchSnapshot();
  });
});

describe.each<Aba>(['emergencia', 'oportunidade'])('%s — chave do mover LIGADA', (aba) => {
  it('alça e menu nas linhas com alvo; coluna "Ações"; placeholders com a célula extra', () => {
    const { container } = renderAba(aba, chaveOn());
    expect(container.querySelector('[data-carteira-dnd]')).not.toBeNull();
    expect(container.querySelector('[data-mover-alca="r1"]')).not.toBeNull();
    expect(container.querySelector('[data-mover-menu="r2"]')).not.toBeNull();
    const header = container.querySelector('thead tr')!;
    expect(header.querySelectorAll('th')).toHaveLength(COLUNAS[aba] + 1);
    expect(within(header as HTMLElement).getByText('Ações')).toHaveClass('sr-only');
    container.querySelectorAll('tbody tr').forEach((tr) => {
      const cols = Array.from(tr.querySelectorAll('td')).reduce(
        (s, td) => s + (Number(td.getAttribute('colspan')) || 1),
        0,
      );
      expect(cols).toBe(COLUNAS[aba] + 1);
    });
    // Reservas não têm seção: nenhum alvo de soltar na tabela (só a bandeja, no arrasto).
    expect(container.querySelector('[data-mover-secao]')).toBeNull();
  });

  it('linha com naoMovivelMotivo fica sem alça e sem menu', () => {
    const { container } = renderAba(aba, [
      ...chaveOn(),
      linha({ id: 'r3', nome: 'Travado', naoMovivelMotivo: 'x' }),
    ]);
    expect(container.querySelector('[data-mover-alca="r3"]')).toBeNull();
    expect(container.querySelector('[data-mover-menu="r3"]')).toBeNull();
  });

  it('selos: tracejado "saldo em conta" no item sem título e "movido" no item movido', () => {
    const { container } = renderAba(aba, chaveOn());
    const saldo = container.querySelector('[data-mf-saldo-conta]')!;
    expect(saldo).toHaveTextContent('saldo em conta');
    expect(saldo).toHaveClass('border-dashed');
    expect(saldo.closest('tr')).toHaveAttribute('data-mover-linha', 'r1');
    const movido = container.querySelectorAll('[data-mf-movido]');
    expect(movido).toHaveLength(1);
    expect(movido[0].closest('tr')).toHaveAttribute('data-mover-linha', 'r2');
  });

  it('menu do movido: "Voltar para Renda Fixa" primeiro e restaura', () => {
    renderAba(aba, chaveOn());
    fireEvent.click(screen.getByRole('button', { name: 'Ações de CDB Banco Inter' }));
    const itens = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(itens[0]).toHaveTextContent(/^Voltar para Renda Fixa/);
    expect(itens[1]).toHaveTextContent(/^Mover para…/);
    expect(itens[2]).toHaveTextContent('Abrir ativo');
    fireEvent.click(itens[0]);
    const categoria = aba === 'emergencia' ? 'reservaEmergencia' : 'reservaOportunidade';
    expect(h.restaurar).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r2', categoria, secaoAtual: '' }),
    );
  });

  it('linha pendente a 60% com "Movendo…"', () => {
    h.pendingId = 'r2';
    const { container } = renderAba(aba, chaveOn());
    const tr = container.querySelector('[data-mover-linha="r2"]')!;
    expect(tr).toHaveClass('opacity-60');
    expect(within(tr as HTMLElement).getByText('Movendo…')).toBeInTheDocument();
  });

  it('celular: selos no cartão e "Mover" de 44px no cartão aberto', () => {
    h.belowLg = true;
    const { container } = renderAba(aba, chaveOn());
    expect(container.querySelector('[data-mover-alca]')).toBeNull();
    expect(container.querySelector('[data-mf-saldo-conta]')).not.toBeNull();
    expect(container.querySelectorAll('[data-mf-movido]')).toHaveLength(1);
    fireEvent.click(screen.getByText('CDB Banco Inter').closest('[aria-expanded]')!);
    const btn = screen.getByRole('button', { name: 'Mover CDB Banco Inter' });
    expect(btn).toHaveClass('min-h-11');
    act(() => {
      fireEvent.click(btn);
    });
    expect(screen.getByTestId('dialogo-mover')).toHaveAttribute('data-alvo', 'r2');
  });
});
