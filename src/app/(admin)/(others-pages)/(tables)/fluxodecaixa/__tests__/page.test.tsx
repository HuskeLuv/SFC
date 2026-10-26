// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const acesso = vi.hoisted(() => ({
  valor: { loading: false, usarV2: false } as { loading: boolean; usarV2: boolean },
}));

vi.mock('@/hooks/useOrcamentoV2Acesso', () => ({
  useOrcamentoV2Acesso: () => acesso.valor,
}));
vi.mock('@/components/cashflow/orcamento/OrcamentoVsRealSection', () => ({
  default: () => <div data-testid="orcamento-atual" />,
}));
vi.mock('@/components/cashflow/orcamentoV2/OrcamentoV2Section', () => ({
  default: () => <div data-testid="orcamento-v2" />,
  EsqueletoOrcamentoV2: () => <div data-testid="esqueleto-v2" />,
}));
vi.mock('@/components/common/ComponentCard', () => ({
  default: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  ),
}));
vi.mock('@/components/tables/DataTables/TableTwo/DataTableTwo', () => ({
  default: () => <div data-testid="planilha" />,
}));
vi.mock('@/components/conexoes/ConectarBancoCard', () => ({ default: () => null }));
vi.mock('@/components/cashflow/mobile/CashflowMonthView', () => ({ default: () => null }));
vi.mock('@/hooks/useStableIsBelowLg', () => ({ useStableIsBelowLg: () => false }));
vi.mock('@/context/SidebarContext', () => ({
  useSidebar: () => ({ isExpanded: true, isHovered: false, isMobileOpen: false }),
}));
vi.mock('@/context/CashflowYearContext', () => ({
  useCashflowYear: () => ({ year: 2026, setYear: vi.fn() }),
}));

import FluxoDeCaixa from '../page';

function abrirOrcamento() {
  render(<FluxoDeCaixa />);
  fireEvent.click(screen.getByRole('button', { name: 'Orçamento' }));
}

beforeEach(() => {
  window.history.replaceState(null, '', '/fluxodecaixa');
});

describe('Fluxo de Caixa › aba Orçamento: troca para o v2', () => {
  it('não ativado (flag desligada, fora do beta, erro): a tela de hoje, sem mudança', () => {
    acesso.valor = { loading: false, usarV2: false };
    abrirOrcamento();
    expect(screen.getByTestId('orcamento-atual')).toBeInTheDocument();
    expect(screen.queryByTestId('orcamento-v2')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Orçamento vs Real · 2026' })).toBeInTheDocument();
  });

  it('liberada e ativado: o Orçamento v2', () => {
    acesso.valor = { loading: false, usarV2: true };
    abrirOrcamento();
    expect(screen.getByTestId('orcamento-v2')).toBeInTheDocument();
    expect(screen.queryByTestId('orcamento-atual')).toBeNull();
  });

  it('esqueleto enquanto o acesso carrega', () => {
    acesso.valor = { loading: true, usarV2: false };
    abrirOrcamento();
    expect(screen.getByTestId('esqueleto-v2')).toBeInTheDocument();
    expect(screen.queryByTestId('orcamento-atual')).toBeNull();
    expect(screen.queryByTestId('orcamento-v2')).toBeNull();
  });

  it('a Planilha não muda', () => {
    acesso.valor = { loading: false, usarV2: true };
    render(<FluxoDeCaixa />);
    expect(screen.getByTestId('planilha')).toBeInTheDocument();
    expect(screen.queryByTestId('orcamento-v2')).toBeNull();
  });
});
