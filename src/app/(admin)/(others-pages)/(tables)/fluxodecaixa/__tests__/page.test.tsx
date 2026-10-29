// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

type AtivarMock = { mutate: () => void; isIdle: boolean; isError: boolean };
type AcessoMock = {
  loading: boolean;
  usarV2: boolean;
  precisaAtivar: boolean;
  data: object | null;
  error: string | null;
  refetch: () => void;
  ativar: AtivarMock;
};
const acesso = vi.hoisted(() => ({
  valor: {} as AcessoMock,
}));
const ociosa = (): AtivarMock => ({ mutate: vi.fn(), isIdle: true, isError: false });
const respondeu = (usarV2: boolean): AcessoMock => ({
  loading: false,
  usarV2,
  precisaAtivar: false,
  data: { estado: usarV2 ? 'liberada' : 'desligada', ativado: usarV2 },
  error: null,
  refetch: vi.fn(),
  ativar: ociosa(),
});
const naoAtivado = (ativar: AtivarMock): AcessoMock => ({
  ...respondeu(false),
  precisaAtivar: true,
  data: { estado: 'liberada', ativado: false },
  ativar,
});

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
  it('não ativado (flag desligada, fora do beta): a tela de hoje, sem mudança', () => {
    acesso.valor = respondeu(false);
    abrirOrcamento();
    expect(screen.getByTestId('orcamento-atual')).toBeInTheDocument();
    expect(screen.queryByTestId('orcamento-v2')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Orçamento vs Real · 2026' })).toBeInTheDocument();
  });

  it('liberada e ativado: o Orçamento v2', () => {
    acesso.valor = respondeu(true);
    abrirOrcamento();
    expect(screen.getByTestId('orcamento-v2')).toBeInTheDocument();
    expect(screen.queryByTestId('orcamento-atual')).toBeNull();
  });

  it('esqueleto enquanto o acesso carrega', () => {
    acesso.valor = { ...respondeu(false), loading: true, data: null };
    abrirOrcamento();
    expect(screen.getByTestId('esqueleto-v2')).toBeInTheDocument();
    expect(screen.queryByTestId('orcamento-atual')).toBeNull();
    expect(screen.queryByTestId('orcamento-v2')).toBeNull();
  });

  it('erro na consulta: nunca a tela antiga; mostra o erro com "Tentar de novo"', () => {
    const refetch = vi.fn();
    acesso.valor = { ...respondeu(false), data: null, error: 'falhou (500)', refetch };
    abrirOrcamento();
    expect(screen.queryByTestId('orcamento-atual')).toBeNull();
    expect(screen.queryByTestId('orcamento-v2')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o orçamento.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('liberada e não ativado (ACESSO=todos): ativa uma vez, com esqueleto', () => {
    const ativar = ociosa();
    acesso.valor = naoAtivado(ativar);
    abrirOrcamento();
    expect(ativar.mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('esqueleto-v2')).toBeInTheDocument();
    expect(screen.queryByTestId('orcamento-atual')).toBeNull();
  });

  it('ativação em andamento: não chama de novo', () => {
    const ativar = { ...ociosa(), isIdle: false };
    acesso.valor = naoAtivado(ativar);
    abrirOrcamento();
    expect(ativar.mutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('esqueleto-v2')).toBeInTheDocument();
  });

  it('ativação falhou: a tela de hoje, sem nova tentativa', () => {
    const ativar = { ...ociosa(), isIdle: false, isError: true };
    acesso.valor = naoAtivado(ativar);
    abrirOrcamento();
    expect(ativar.mutate).not.toHaveBeenCalled();
    expect(screen.getByTestId('orcamento-atual')).toBeInTheDocument();
  });

  it('a Planilha não chama a ativação', () => {
    const ativar = ociosa();
    acesso.valor = naoAtivado(ativar);
    render(<FluxoDeCaixa />);
    expect(ativar.mutate).not.toHaveBeenCalled();
  });

  it('a Planilha não muda', () => {
    acesso.valor = respondeu(true);
    render(<FluxoDeCaixa />);
    expect(screen.getByTestId('planilha')).toBeInTheDocument();
    expect(screen.queryByTestId('orcamento-v2')).toBeNull();
  });
});
