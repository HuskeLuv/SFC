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

const contextMock = vi.hoisted(() => ({ necessidadeAporteMap: {} as Record<string, number> }));

vi.mock('@/context/CarteiraResumoContext', () => ({
  useCarteiraResumoContext: () => ({
    necessidadeAporteMap: contextMock.necessidadeAporteMap,
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

  describe('riscoPorAtivo (cotacaoParaBRL)', () => {
    const riscoColumns: ColumnDef<TestAtivo, TestSecao>[] = [
      ...testColumns,
      {
        key: 'risco',
        header: 'Risco',
        align: 'right',
        render: (ativo, fmt) =>
          fmt.formatPercentage((ativo as unknown as { riscoPorAtivo: number }).riscoPorAtivo ?? 0),
        renderSectionTotal: () => '-',
        renderGrandTotal: () => '-',
      },
    ];

    it('computes risk without conversion when cotacaoParaBRL is absent', () => {
      // valorAtualizado 1000 / totalCarteira 20000 = 5.00%
      render(
        <GenericAssetTable
          {...buildDefaultProps({ columns: riscoColumns, totalCarteira: 20000 })}
        />,
        { wrapper: TestWrapper },
      );

      expect(screen.getByText('5.00%')).toBeInTheDocument();
    });

    it('converts valorAtualizado to BRL in risk when cotacaoParaBRL is set', () => {
      // (1000 USD * 5.5) / totalCarteira 20000 BRL = 27.50%
      render(
        <GenericAssetTable
          {...buildDefaultProps({
            columns: riscoColumns,
            totalCarteira: 20000,
            cotacaoParaBRL: 5.5,
          })}
        />,
        { wrapper: TestWrapper },
      );

      expect(screen.getByText('27.50%')).toBeInTheDocument();
    });

    it('keeps previous behavior when cotacaoParaBRL is null (fallback)', () => {
      render(
        <GenericAssetTable
          {...buildDefaultProps({
            columns: riscoColumns,
            totalCarteira: 20000,
            cotacaoParaBRL: null,
          })}
        />,
        { wrapper: TestWrapper },
      );

      expect(screen.getByText('5.00%')).toBeInTheDocument();
    });
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

// ---------------------------------------------------------------------------
// Ativo PLANEJADO (sem posição, 16/09/2026)
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useCsrf', () => ({
  useCsrf: () => ({
    csrfFetch: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }),
  }),
}));

describe('GenericAssetTable — ativo planejado', () => {
  const planejado: TestAtivo & { planejado: boolean } = {
    id: 'plan-1',
    ticker: 'VALE3',
    nome: 'Vale S.A.',
    valorAtualizado: 0,
    objetivo: 15,
    percentualCarteira: 0,
    quantoFalta: 15,
    necessidadeAporte: 150,
    planejado: true,
  };
  const dataComPlanejado = {
    ...mockData,
    secoes: [{ ...mockSecao, ativos: [mockAtivo, planejado] }],
  };

  it('mostra selo "Planejado", traço nas colunas de valor e o objetivo editável', () => {
    render(
      <GenericAssetTable
        {...buildDefaultProps({ data: dataComPlanejado as unknown as Record<string, unknown> })}
      />,
      { wrapper: TestWrapper },
    );

    const row = screen.getByText('VALE3').closest('tr')!;
    expect(row).toHaveAttribute('data-planejado', 'true');
    expect(row).toHaveTextContent('Planejado');
    // coluna "valor" (não é de planejamento) vira traço; "objetivo" mantém o valor
    expect(row).toHaveTextContent('—');
    expect(row).not.toHaveTextContent('R$ 0.00');
    expect(row).toHaveTextContent('15.00%');
    // sem link para /ativos/<id> (planejado não é posição)
    expect(row.querySelector('a')).toBeNull();
    expect(
      screen.getByRole('button', { name: /Remover VALE3 do planejamento/ }),
    ).toBeInTheDocument();
  });

  it('planejado entra em Quanto Falta / Necessidade de Aporte do total', () => {
    const colunasComNecessidade: ColumnDef<TestAtivo, TestSecao>[] = [
      ...testColumns,
      {
        key: 'necessidadeAporte',
        header: 'Nec. Aporte',
        align: 'right',
        render: (ativo, fmt) => fmt.formatCurrency(ativo.necessidadeAporte),
        renderSectionTotal: (secao, fmt) => fmt.formatCurrency(secao.totalNecessidadeAporte),
        renderGrandTotal: (total, fmt) => fmt.formatCurrency(total.necessidadeAporte as number),
      },
    ];
    render(
      <GenericAssetTable
        {...buildDefaultProps({
          data: dataComPlanejado as unknown as Record<string, unknown>,
          columns: colunasComNecessidade,
        })}
      />,
      { wrapper: TestWrapper },
    );
    // Recalculado no front: planejado = 15% × total da aba (R$ 1000) = R$ 150;
    // o ativo com posição já está acima do objetivo (0). Linha, seção e TOTAL GERAL.
    expect(screen.getAllByText('R$ 150.00').length).toBeGreaterThanOrEqual(2);
  });
});

describe('GenericAssetTable — aba vazia com planejado', () => {
  it('usa o valor-alvo da classe (Alocação) como base da Necessidade de Aporte', () => {
    contextMock.necessidadeAporteMap = { acoes: 5000 };
    const planejado: TestAtivo & { planejado: boolean } = {
      id: 'plan-1',
      ticker: 'VALE3',
      nome: 'Vale S.A.',
      valorAtualizado: 0,
      objetivo: 20,
      percentualCarteira: 0,
      quantoFalta: 20,
      necessidadeAporte: 0,
      planejado: true,
    };
    const abaVazia = {
      secoes: [{ ...mockSecao, ativos: [planejado], totalValorAtualizado: 0 }],
      totalGeral: { valorAtualizado: 0, objetivo: 20, quantoFalta: 20, necessidadeAporte: 0 },
      resumo: { caixaParaInvestir: 0, necessidadeAporteTotal: 0 },
    };
    const colunas: ColumnDef<TestAtivo, TestSecao>[] = [
      ...testColumns,
      {
        key: 'necessidadeAporte',
        header: 'Nec. Aporte',
        align: 'right',
        render: (ativo, fmt) => fmt.formatCurrency(ativo.necessidadeAporte),
        renderGrandTotal: (total, fmt) => fmt.formatCurrency(total.necessidadeAporte as number),
      },
    ];
    render(
      <GenericAssetTable
        {...buildDefaultProps({
          data: abaVazia as unknown as Record<string, unknown>,
          columns: colunas,
          necessidadeAporteKey: 'acoes',
        })}
      />,
      { wrapper: TestWrapper },
    );
    // 20% do valor-alvo da classe (R$ 5.000) = R$ 1.000, na linha e no total
    expect(screen.getAllByText('R$ 1000.00').length).toBeGreaterThanOrEqual(2);
    contextMock.necessidadeAporteMap = {};
  });
});
