// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import GenericAssetTable, {
  type ColumnDef,
  type MetricCardConfig,
  type GenericAssetTableProps,
} from '@/components/carteira/shared/GenericAssetTable';
import CaixaParaInvestirCard from '@/components/carteira/shared/CaixaParaInvestirCard';
import { createTestQueryClient } from '@/test/wrappers';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/common/LoadingSpinner', () => ({
  default: ({ text }: { text?: string }) => <div data-testid="loading-spinner">{text}</div>,
}));

vi.mock('@/components/common/ComponentCard', () => ({
  default: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div data-testid="component-card">
      <h2>{title}</h2>
      {children}
    </div>
  ),
}));

vi.mock('@/icons', () => ({
  ChevronDownIcon: ({ className }: { className?: string }) => (
    <svg data-testid="chevron-down" className={className} />
  ),
  ChevronUpIcon: ({ className }: { className?: string }) => (
    <svg data-testid="chevron-up" className={className} />
  ),
}));

vi.mock('@/context/CarteiraResumoContext', () => ({
  useCarteiraResumoContext: () => ({
    necessidadeAporteMap: {} as Record<string, number>,
  }),
  CarteiraResumoProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ---------------------------------------------------------------------------
// Wrapper with QueryClient
// ---------------------------------------------------------------------------

function TestWrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// ---------------------------------------------------------------------------
// Test data & props factory
// ---------------------------------------------------------------------------

interface TestAtivo {
  id: string;
  ticker: string;
  nome: string;
  valorAtualizado: number;
  objetivo: number;
  percentualCarteira: number;
  quantoFalta: number;
  necessidadeAporte: number;
}

interface TestSecao {
  nome: string;
  ativos: TestAtivo[];
  totalValorAtualizado: number;
  totalObjetivo: number;
  totalQuantoFalta: number;
  totalNecessidadeAporte: number;
}

const mockAtivo: TestAtivo = {
  id: 'a1',
  ticker: 'PETR4',
  nome: 'Petrobras',
  valorAtualizado: 1000,
  objetivo: 10,
  percentualCarteira: 50,
  quantoFalta: -40,
  necessidadeAporte: 0,
};

const mockSecao: TestSecao = {
  nome: 'Setor 1',
  ativos: [mockAtivo],
  totalValorAtualizado: 1000,
  totalObjetivo: 10,
  totalQuantoFalta: -40,
  totalNecessidadeAporte: 0,
};

const mockData = {
  secoes: [mockSecao],
  totalGeral: {
    valorAtualizado: 1000,
    objetivo: 10,
    quantoFalta: -40,
    necessidadeAporte: 0,
  },
  resumo: {
    caixaParaInvestir: 5000,
    necessidadeAporteTotal: 0,
  },
};

const testColumns: ColumnDef<TestAtivo, TestSecao>[] = [
  {
    key: 'ticker',
    header: 'Ticker',
    render: (ativo) => ativo.ticker,
    renderSectionTotal: (secao) => secao.nome,
    renderGrandTotal: () => 'TOTAL GERAL',
  },
  {
    key: 'valor',
    header: 'Valor',
    align: 'right',
    render: (ativo, fmt) => fmt.formatCurrency(ativo.valorAtualizado),
    renderSectionTotal: (secao, fmt) => fmt.formatCurrency(secao.totalValorAtualizado),
    renderGrandTotal: (total, fmt) => fmt.formatCurrency(total.valorAtualizado as number),
  },
  {
    key: 'objetivo',
    header: 'Objetivo %',
    align: 'right',
    render: (ativo, fmt) => fmt.formatPercentage(ativo.objetivo),
    renderSectionTotal: (secao, fmt) => fmt.formatPercentage(secao.totalObjetivo),
    renderGrandTotal: (total, fmt) => fmt.formatPercentage(total.objetivo as number),
  },
];

const testMetricCards: MetricCardConfig[] = [
  {
    title: 'Valor Total',
    getValue: (resumo) => `R$ ${((resumo.valorAtualizado as number) ?? 0).toFixed(2)}`,
    color: 'primary',
  },
  {
    title: '__CAIXA_PARA_INVESTIR__',
    getValue: () => '',
    color: 'success',
  },
];

function buildDefaultProps(
  overrides: Partial<GenericAssetTableProps<TestAtivo, TestSecao>> = {},
): GenericAssetTableProps<TestAtivo, TestSecao> {
  return {
    data: mockData as unknown as Record<string, unknown>,
    loading: false,
    error: null,
    columns: testColumns,
    getSecoes: (d) => (d.secoes as TestSecao[]) ?? [],
    getSectionAtivos: (s) => s.ativos,
    getSectionKey: (s) => s.nome,
    getSectionName: (s) => s.nome,
    getTotalGeral: (d) => (d.totalGeral as Record<string, unknown>) ?? {},
    getResumo: (d) => (d.resumo as Record<string, unknown>) ?? {},
    metricCards: testMetricCards,
    onUpdateCaixaParaInvestir: vi.fn().mockResolvedValue(true),
    sectionOrder: ['Setor 1'],
    sectionNames: { 'Setor 1': 'Setor 1' },
    tableTitle: 'Ações',
    formatCurrency: (v: number) => `R$ ${v.toFixed(2)}`,
    formatPercentage: (v: number) => `${v.toFixed(2)}%`,
    formatNumber: (v: number) => v.toFixed(2),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GenericAssetTable tests
// ---------------------------------------------------------------------------

describe('GenericAssetTable', () => {
  it('shows LoadingSpinner when loading=true', () => {
    render(<GenericAssetTable {...buildDefaultProps({ loading: true })} />, {
      wrapper: TestWrapper,
    });

    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.getByText('Carregando dados...')).toBeInTheDocument();
  });

  it('shows error message when error is set', () => {
    render(<GenericAssetTable {...buildDefaultProps({ error: 'Falha na requisição' })} />, {
      wrapper: TestWrapper,
    });

    expect(screen.getByText('Erro ao carregar dados')).toBeInTheDocument();
    expect(screen.getByText('Falha na requisição')).toBeInTheDocument();
  });

  it('renders table title', () => {
    render(<GenericAssetTable {...buildDefaultProps()} />, { wrapper: TestWrapper });

    expect(screen.getByText('Ações')).toBeInTheDocument();
  });

  it('renders metric cards', () => {
    render(<GenericAssetTable {...buildDefaultProps()} />, { wrapper: TestWrapper });

    expect(screen.getByText('Valor Total')).toBeInTheDocument();
    expect(screen.getByText('Caixa para Investir')).toBeInTheDocument();
  });

  it('renders column headers', () => {
    render(<GenericAssetTable {...buildDefaultProps()} />, { wrapper: TestWrapper });

    expect(screen.getByText('Ticker')).toBeInTheDocument();
    expect(screen.getByText('Valor')).toBeInTheDocument();
    expect(screen.getByText('Objetivo %')).toBeInTheDocument();
  });

  it('renders section headers with section names', () => {
    render(<GenericAssetTable {...buildDefaultProps()} />, { wrapper: TestWrapper });

    expect(screen.getByText('Setor 1')).toBeInTheDocument();
  });

  it('renders asset data in table rows', () => {
    render(<GenericAssetTable {...buildDefaultProps()} />, { wrapper: TestWrapper });

    expect(screen.getByText('PETR4')).toBeInTheDocument();
  });

  it('renders grand total row', () => {
    render(<GenericAssetTable {...buildDefaultProps()} />, { wrapper: TestWrapper });

    expect(screen.getByText('TOTAL GERAL')).toBeInTheDocument();
  });

  it('collapses section when header is clicked, hiding asset rows', () => {
    render(<GenericAssetTable {...buildDefaultProps()} />, { wrapper: TestWrapper });

    // Asset is visible initially (sections start expanded)
    expect(screen.getByText('PETR4')).toBeInTheDocument();

    // Click the section header to collapse
    fireEvent.click(screen.getByText('Setor 1'));

    // Asset should no longer be visible
    expect(screen.queryByText('PETR4')).not.toBeInTheDocument();
  });

  it('expands section again when header is clicked twice', () => {
    render(<GenericAssetTable {...buildDefaultProps()} />, { wrapper: TestWrapper });

    // Collapse
    fireEvent.click(screen.getByText('Setor 1'));
    expect(screen.queryByText('PETR4')).not.toBeInTheDocument();

    // Expand
    fireEvent.click(screen.getByText('Setor 1'));
    expect(screen.getByText('PETR4')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// CaixaParaInvestirCard tests
// ---------------------------------------------------------------------------

describe('CaixaParaInvestirCard', () => {
  const defaultProps = {
    value: 5000,
    formatCurrency: (v: number | null | undefined) =>
      v != null ? `R$ ${v.toFixed(2)}` : 'R$ 0,00',
    onSave: vi.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    defaultProps.onSave = vi.fn().mockResolvedValue(true);
  });

  it('renders formatted value in display mode', () => {
    render(<CaixaParaInvestirCard {...defaultProps} />);

    expect(screen.getByText('R$ 5000.00')).toBeInTheDocument();
    expect(screen.getByText('Caixa para Investir')).toBeInTheDocument();
  });

  it('enters edit mode when edit button is clicked', () => {
    render(<CaixaParaInvestirCard {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /editar/i }));

    expect(screen.getByDisplayValue('R$ 5000.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /salvar/i })).toBeInTheDocument();
  });

  it('saves new value when Enter is pressed', async () => {
    render(<CaixaParaInvestirCard {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /editar/i }));

    const input = screen.getByDisplayValue('R$ 5000.00');
    fireEvent.change(input, { target: { value: '10000' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(defaultProps.onSave).toHaveBeenCalledWith(10000);
    });
  });

  it('cancels edit when Escape is pressed', () => {
    render(<CaixaParaInvestirCard {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /editar/i }));

    const input = screen.getByDisplayValue('R$ 5000.00');
    fireEvent.keyDown(input, { key: 'Escape' });

    // Should be back in display mode — value shown as text, not as input
    expect(screen.getByText('R$ 5000.00')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('R$ 5000.00')).not.toBeInTheDocument();
  });

  it('shows error when onSave returns false', async () => {
    defaultProps.onSave.mockResolvedValue(false);
    render(<CaixaParaInvestirCard {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /editar/i }));

    const input = screen.getByDisplayValue('R$ 5000.00');
    fireEvent.change(input, { target: { value: '3000' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(screen.getByText('Não foi possível salvar o valor.')).toBeInTheDocument();
    });
  });

  it('hides edit button when readOnly=true', () => {
    render(<CaixaParaInvestirCard {...defaultProps} readOnly />);

    expect(screen.getByText('R$ 5000.00')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument();
  });
});
