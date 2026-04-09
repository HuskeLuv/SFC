// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MetaViverDeRenda from '../MetaViverDeRenda';

// Mock react-apexcharts (dynamically imported chart library)
vi.mock('react-apexcharts', () => ({
  default: () => <div data-testid="chart" />,
}));

// Mock next/dynamic to render the component directly
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: React.ComponentType }>) => {
    const LazyComponent = React.lazy(loader);
    return function DynamicComponent(props: Record<string, unknown>) {
      return (
        <React.Suspense fallback={<div>Loading...</div>}>
          <LazyComponent {...props} />
        </React.Suspense>
      );
    };
  },
}));

// Mock portfolio hooks
const mockUseCarteira = vi.fn();
const mockUseRiscoRetorno = vi.fn();
const mockUseProventos = vi.fn();

vi.mock('@/hooks/useCarteira', () => ({
  useCarteira: () => mockUseCarteira(),
}));

vi.mock('@/hooks/useRiscoRetorno', () => ({
  useRiscoRetorno: () => mockUseRiscoRetorno(),
}));

vi.mock('@/hooks/useProventos', () => ({
  useProventos: () => mockUseProventos(),
}));

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function setupMocksEmpty() {
  mockUseCarteira.mockReturnValue({ resumo: null, loading: false });
  mockUseRiscoRetorno.mockReturnValue({ data: null, loading: false });
  mockUseProventos.mockReturnValue({ media: 0, loading: false });
}

function setupMocksWithData() {
  mockUseCarteira.mockReturnValue({
    resumo: { saldoBruto: 250000 },
    loading: false,
  });
  mockUseRiscoRetorno.mockReturnValue({
    data: { carteira: { retornoAnual: 15.5 } },
    loading: false,
  });
  mockUseProventos.mockReturnValue({
    media: 1200,
    loading: false,
  });
}

/**
 * Helper to fill all required fields using label associations.
 */
function fillAllFields(
  overrides: {
    rentabilidade?: string;
    inflacao?: string;
    quantiaPoupada?: string;
    rendaMensal?: string;
  } = {},
) {
  const {
    rentabilidade = '12',
    inflacao = '5',
    quantiaPoupada = '100000',
    rendaMensal = '5000',
  } = overrides;

  fireEvent.change(screen.getByLabelText(/Rentabilidade últimos/i), {
    target: { value: rentabilidade },
  });
  fireEvent.change(screen.getByLabelText(/inflação/i), {
    target: { value: inflacao },
  });
  fireEvent.change(screen.getByLabelText(/poupada/i), {
    target: { value: quantiaPoupada },
  });
  fireEvent.change(screen.getByLabelText(/deseja receber/i), {
    target: { value: rendaMensal },
  });
}

describe('MetaViverDeRenda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocksEmpty();
  });

  it('renders without crashing', () => {
    renderWithProviders(<MetaViverDeRenda />);
    expect(screen.getByText(/como usar/i)).toBeInTheDocument();
    expect(screen.getByText(/cálculos/i)).toBeInTheDocument();
  });

  it('shows warning when inputs are empty', () => {
    renderWithProviders(<MetaViverDeRenda />);
    expect(screen.getByText(/preencha todos os campos/i)).toBeInTheDocument();
  });

  it('shows specific warning when real return is negative', () => {
    renderWithProviders(<MetaViverDeRenda />);
    fillAllFields({
      rentabilidade: '5',
      inflacao: '10',
      rendaMensal: '5000',
      quantiaPoupada: '100000',
    });

    expect(screen.getByText(/menor ou igual à inflação/i)).toBeInTheDocument();
  });

  it('calculates rentabilidade real correctly', () => {
    renderWithProviders(<MetaViverDeRenda />);
    fillAllFields({ rentabilidade: '12', inflacao: '5' });

    // rentabilidadeReal = ((1 + 0.12) / (1 + 0.05)) - 1 = 0.06666... = 6.67%
    const realInput = screen.getByDisplayValue(/6[.,]67/);
    expect(realInput).toBeInTheDocument();
  });

  it('calculates capital needed correctly', () => {
    renderWithProviders(<MetaViverDeRenda />);
    fillAllFields({ rentabilidade: '12', inflacao: '5', rendaMensal: '5000' });

    // capitalNeeded = (5000 * 12) / (2/30) = 60000 * 15 = 900,000
    expect(document.body.textContent).toMatch(/900\.000,00/);
  });

  it('shows three scenarios in results table', () => {
    renderWithProviders(<MetaViverDeRenda />);
    fillAllFields();

    expect(screen.getByText(/seu plano/i)).toBeInTheDocument();
    expect(screen.getByText(/renda menor/i)).toBeInTheDocument();
    expect(screen.getByText(/renda maior/i)).toBeInTheDocument();
  });

  it('renda menor is 75% of desired income', () => {
    renderWithProviders(<MetaViverDeRenda />);
    fillAllFields({ rendaMensal: '5000' });

    // 75% of 5000 = 3750, formatted as 3.750,00
    expect(document.body.textContent).toMatch(/3\.750,00/);
  });

  it('renda maior is 125% of desired income', () => {
    renderWithProviders(<MetaViverDeRenda />);
    fillAllFields({ rendaMensal: '5000' });

    // 125% of 5000 = 6250, formatted as 6.250,00
    expect(document.body.textContent).toMatch(/6\.250,00/);
  });

  it('shows warning when rentabilidade real is zero or negative', () => {
    renderWithProviders(<MetaViverDeRenda />);
    fillAllFields({ rentabilidade: '5', inflacao: '10', rendaMensal: '5000' });

    expect(screen.getByText(/menor ou igual à inflação/i)).toBeInTheDocument();
  });

  it('calculates "quanto falta acumular" correctly', async () => {
    renderWithProviders(<MetaViverDeRenda />);
    fillAllFields({
      rentabilidade: '12',
      inflacao: '5',
      quantiaPoupada: '100000',
      rendaMensal: '5000',
    });

    // capitalNeeded = 900,000; falta = 900,000 - 100,000 = 800,000
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/800\.000,00/);
    });
  });

  // --- New tests for portfolio data integration ---

  it('shows portfolio summary cards when data is available', () => {
    setupMocksWithData();
    renderWithProviders(<MetaViverDeRenda />);

    expect(screen.getByText(/patrimônio atual/i)).toBeInTheDocument();
    expect(screen.getByText(/250\.000,00/)).toBeInTheDocument();
    expect(screen.getByText(/rentabilidade anual/i)).toBeInTheDocument();
    expect(screen.getByText(/15[.,]50%/)).toBeInTheDocument();
    expect(screen.getByText(/proventos médios/i)).toBeInTheDocument();
    expect(screen.getByText(/1\.200,00/)).toBeInTheDocument();
  });

  it('auto-populates inputs from portfolio data', () => {
    setupMocksWithData();
    renderWithProviders(<MetaViverDeRenda />);

    const rentInput = screen.getByLabelText(/Rentabilidade últimos/i) as HTMLInputElement;
    const poupInput = screen.getByLabelText(/poupada/i) as HTMLInputElement;
    const rendaInput = screen.getByLabelText(/deseja receber/i) as HTMLInputElement;

    expect(rentInput.value).toBe('15.50');
    expect(poupInput.value).toBe('250000.00');
    expect(rendaInput.value).toBe('1200.00');
  });

  it('does not overwrite manually edited fields', () => {
    setupMocksWithData();
    renderWithProviders(<MetaViverDeRenda />);

    // User manually changes rentabilidade
    const rentInput = screen.getByLabelText(/Rentabilidade últimos/i) as HTMLInputElement;
    fireEvent.change(rentInput, { target: { value: '20' } });
    expect(rentInput.value).toBe('20');

    // The hook value (15.50) should not overwrite it
    // (re-render triggered by state change keeps manual value)
    expect(rentInput.value).toBe('20');
  });

  it('shows "Usar dados da carteira" button when data is available', () => {
    setupMocksWithData();
    renderWithProviders(<MetaViverDeRenda />);

    expect(screen.getByText(/usar dados da carteira/i)).toBeInTheDocument();
  });

  it('resets fields to portfolio data when button is clicked', () => {
    setupMocksWithData();
    renderWithProviders(<MetaViverDeRenda />);

    // Manually change a field
    const rentInput = screen.getByLabelText(/Rentabilidade últimos/i) as HTMLInputElement;
    fireEvent.change(rentInput, { target: { value: '99' } });
    expect(rentInput.value).toBe('99');

    // Click "Usar dados da carteira"
    fireEvent.click(screen.getByText(/usar dados da carteira/i));

    expect(rentInput.value).toBe('15.50');
  });

  it('shows skeleton loading state while data is loading', () => {
    mockUseCarteira.mockReturnValue({ resumo: null, loading: true });
    mockUseRiscoRetorno.mockReturnValue({ data: null, loading: true });
    mockUseProventos.mockReturnValue({ media: 0, loading: true });

    const { container } = renderWithProviders(<MetaViverDeRenda />);

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows progress bars in results table', () => {
    renderWithProviders(<MetaViverDeRenda />);
    fillAllFields({ quantiaPoupada: '450000', rendaMensal: '5000' });

    // With 450k poupado and 900k needed: progresso = 50%
    expect(document.body.textContent).toMatch(/50[.,]0%/);
  });

  it('shows "Meta atingida" when falta <= 0', () => {
    renderWithProviders(<MetaViverDeRenda />);
    fillAllFields({
      rentabilidade: '12',
      inflacao: '5',
      quantiaPoupada: '2000000',
      rendaMensal: '5000',
    });

    // 2M poupado > 900k needed => all scenarios achieved
    expect(screen.getAllByText(/meta atingida/i).length).toBeGreaterThan(0);
  });

  it('does not show portfolio summary when no data', () => {
    setupMocksEmpty();
    renderWithProviders(<MetaViverDeRenda />);

    expect(screen.queryByText(/patrimônio atual/i)).not.toBeInTheDocument();
  });
});
