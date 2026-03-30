// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCarteira } from '@/hooks/useCarteira';
import { useAlocacaoConfig } from '@/hooks/useAlocacaoConfig';
import { createTestQueryWrapper } from '@/test/wrappers';
import CarteiraTabs from '../CarteiraTabs';

vi.mock('@/hooks/useCarteira', () => ({
  useCarteira: vi.fn(),
}));

vi.mock('@/hooks/useAlocacaoConfig', () => ({
  useAlocacaoConfig: vi.fn(),
}));

vi.mock('@/context/CarteiraResumoContext', () => ({
  CarteiraResumoProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="carteira-resumo-provider">{children}</div>
  ),
}));

vi.mock('../CarteiraResumo', () => ({
  default: () => <div data-testid="carteira-resumo">CarteiraResumo</div>,
}));

vi.mock('../CarteiraAnalise', () => ({
  default: () => <div data-testid="carteira-analise">CarteiraAnalise</div>,
}));

const mockResumo = {
  saldoBruto: 100000,
  valorAplicado: 80000,
  rentabilidade: 25,
  metaPatrimonio: 500000,
  caixaParaInvestir: 5000,
  historicoPatrimonio: [],
  distribuicao: {
    reservaEmergencia: { valor: 10000, percentual: 10 },
    reservaOportunidade: { valor: 5000, percentual: 5 },
    rendaFixaFundos: { valor: 20000, percentual: 20 },
    fimFia: { valor: 0, percentual: 0 },
    fiis: { valor: 15000, percentual: 15 },
    acoes: { valor: 20000, percentual: 20 },
    stocks: { valor: 10000, percentual: 10 },
    reits: { valor: 5000, percentual: 5 },
    etfs: { valor: 5000, percentual: 5 },
    moedasCriptos: { valor: 5000, percentual: 5 },
    previdenciaSeguros: { valor: 3000, percentual: 3 },
    opcoes: { valor: 1000, percentual: 1 },
    imoveisBens: { valor: 1000, percentual: 1 },
  },
  portfolioDetalhes: {
    totalAcoes: 20000,
    totalInvestimentos: 100000,
    stocksTotalInvested: 8000,
    stocksCurrentValue: 10000,
    otherInvestmentsTotalInvested: 72000,
    otherInvestmentsCurrentValue: 90000,
  },
};

const defaultCarteiraReturn = {
  resumo: mockResumo,
  loading: false,
  error: null,
  formatCurrency: vi.fn((v: number | null | undefined) =>
    v != null ? `R$ ${v.toFixed(2)}` : 'R$ 0,00',
  ),
  formatPercentage: vi.fn((v: number | null | undefined) =>
    v != null ? `${v.toFixed(2)}%` : '0,00%',
  ),
  refetch: vi.fn().mockResolvedValue(undefined),
  updateMeta: vi.fn().mockResolvedValue(true),
  updateCaixaParaInvestir: vi.fn().mockResolvedValue(true),
};

const defaultAlocacaoReturn = {
  configuracoes: [
    { categoria: 'acoes', minimo: 15, maximo: 25, target: 20 },
    { categoria: 'fiis', minimo: 10, maximo: 20, target: 15 },
    { categoria: 'rendaFixaFundos', minimo: 15, maximo: 25, target: 20 },
    { categoria: 'stocks', minimo: 5, maximo: 15, target: 10 },
  ],
  loading: false,
  error: null,
  updateConfiguracao: vi.fn(),
  saveChanges: vi.fn(),
  startEditing: vi.fn(),
  stopEditing: vi.fn(),
  isEditing: vi.fn(() => false),
  totalTargets: 65,
  refetch: vi.fn(),
};

function renderCarteiraTabs() {
  const Wrapper = createTestQueryWrapper();
  return render(
    <Wrapper>
      <CarteiraTabs />
    </Wrapper>,
  );
}

describe('CarteiraTabs', () => {
  beforeEach(() => {
    vi.mocked(useCarteira).mockReturnValue(defaultCarteiraReturn);
    vi.mocked(useAlocacaoConfig).mockReturnValue(defaultAlocacaoReturn);
  });

  describe('loading state', () => {
    it('shows LoadingSpinner with loading text when loading=true', () => {
      vi.mocked(useCarteira).mockReturnValue({
        ...defaultCarteiraReturn,
        resumo: null,
        loading: true,
      });

      renderCarteiraTabs();

      expect(screen.getByText('Carregando dados da carteira...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error message when error is set', () => {
      vi.mocked(useCarteira).mockReturnValue({
        ...defaultCarteiraReturn,
        resumo: null,
        loading: false,
        error: 'Falha na conexão com o servidor',
      });

      renderCarteiraTabs();

      expect(screen.getByText('Falha na conexão com o servidor')).toBeInTheDocument();
    });

    it('shows "Erro ao carregar dados" heading', () => {
      vi.mocked(useCarteira).mockReturnValue({
        ...defaultCarteiraReturn,
        resumo: null,
        loading: false,
        error: 'Algo deu errado',
      });

      renderCarteiraTabs();

      expect(screen.getByText('Erro ao carregar dados')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows "Nenhum dado encontrado" when resumo is null and loading=false', () => {
      vi.mocked(useCarteira).mockReturnValue({
        ...defaultCarteiraReturn,
        resumo: null,
        loading: false,
        error: null,
      });

      renderCarteiraTabs();

      expect(screen.getByText('Nenhum dado encontrado')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Adicione seus primeiros investimentos para começar a acompanhar sua carteira.',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('success state', () => {
    it('renders tab buttons "Resumo" and "Análise"', () => {
      renderCarteiraTabs();

      expect(screen.getByText('Resumo')).toBeInTheDocument();
      expect(screen.getByText('Análise')).toBeInTheDocument();
    });

    it('shows CarteiraResumo content by default', async () => {
      renderCarteiraTabs();

      await waitFor(() => {
        expect(screen.getByTestId('carteira-resumo')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('carteira-analise')).not.toBeInTheDocument();
    });

    it('clicking "Análise" tab shows CarteiraAnalise content', async () => {
      renderCarteiraTabs();

      fireEvent.click(screen.getByText('Análise'));

      await waitFor(() => {
        expect(screen.getByTestId('carteira-analise')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('carteira-resumo')).not.toBeInTheDocument();
    });

    it('clicking "Resumo" tab after "Análise" shows CarteiraResumo again', async () => {
      renderCarteiraTabs();

      fireEvent.click(screen.getByText('Análise'));
      await waitFor(() => {
        expect(screen.getByTestId('carteira-analise')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Resumo'));
      await waitFor(() => {
        expect(screen.getByTestId('carteira-resumo')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('carteira-analise')).not.toBeInTheDocument();
    });
  });

  describe('provider', () => {
    it('wraps content in CarteiraResumoProvider when resumo is available', () => {
      renderCarteiraTabs();

      // Verify the mocked provider wrapper is in the DOM
      expect(screen.getByTestId('carteira-resumo-provider')).toBeInTheDocument();
      // And the child content renders inside it
      expect(screen.getByTestId('carteira-resumo')).toBeInTheDocument();
    });

    it('does not render CarteiraResumoProvider when resumo is null', () => {
      vi.mocked(useCarteira).mockReturnValue({
        ...defaultCarteiraReturn,
        resumo: null,
        loading: false,
      });

      renderCarteiraTabs();

      expect(screen.queryByTestId('carteira-resumo-provider')).not.toBeInTheDocument();
      expect(screen.getByText('Nenhum dado encontrado')).toBeInTheDocument();
    });
  });
});
