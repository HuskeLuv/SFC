// @vitest-environment jsdom
/**
 * Rodada 3 da auditoria de resgate (achado frontend #17): o fluxo de compra
 * tinha checagem de desvio de preço (popup de confirmação) e o resgate não
 * tinha nada — erro de digitação de cotação ia direto pro custo/fluxo.
 * Cobre o popup ao sair do passo de Informações no resgate por quantidade.
 */
import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockCsrfFetch = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: mockCsrfFetch }) }));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

/** stub que preenche um resgate POR QUANTIDADE de ação com cotação deslocada */
const makeStub = vi.hoisted(
  () => (nome: string) =>
    function StepStub({ onFormDataChange }: { onFormDataChange?: (d: object) => void }) {
      useEffect(() => {
        onFormDataChange?.({
          tipoAtivo: 'acao',
          instituicaoId: 'inst-1',
          portfolioId: 'port-1',
          ativo: 'PETR4 - Petrobras (10 und | R$ 280,00)',
          dataResgate: '2026-08-03',
          metodoResgate: 'quantidade',
          quantidade: 10,
          cotacaoUnitaria: 2.8, // fechamento real: 28 → 90% abaixo
          availableQuantity: 10,
          availableTotal: 280,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return React.createElement('div', { 'data-testid': nome });
    },
);

vi.mock('../redeemWizard/Step1RedeemAssetType', () => ({ default: makeStub('step1') }));
vi.mock('../redeemWizard/Step2RedeemInstitution', () => ({ default: makeStub('step2') }));
vi.mock('../redeemWizard/Step3RedeemAsset', () => ({ default: makeStub('step3') }));
vi.mock('../redeemWizard/Step4RedeemInfo', () => ({ default: makeStub('step4') }));
vi.mock('../redeemWizard/Step5RedeemConfirmation', () => ({ default: makeStub('step5') }));

import RedeemAssetWizard from '../RedeemAssetWizard';
import { createTestQueryWrapper } from '@/test/wrappers';

const priceAtResponse = {
  symbol: 'PETR4',
  date: '2026-08-03',
  effectiveDate: '2026-08-03',
  price: 28,
  source: 'db',
};

describe('Rodada 3 (achado #17) — desvio de preço no resgate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => priceAtResponse,
      }),
    );
  });

  const goToInfoStep = async () => {
    render(<RedeemAssetWizard isOpen onClose={vi.fn()} onSuccess={vi.fn()} />, {
      wrapper: createTestQueryWrapper(),
    });
    // aguarda o fechamento histórico carregar (price-at)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Avançar' }));
    }
    expect(screen.getByTestId('step4')).toBeInTheDocument();
  };

  it('abre o popup ao avançar do passo de Informações com cotação divergente', async () => {
    await goToInfoStep();

    fireEvent.click(screen.getByRole('button', { name: 'Avançar' }));

    await waitFor(() => expect(screen.getByText(/Confirme o preço informado/)).toBeInTheDocument());
    // não avançou para a confirmação
    expect(screen.queryByTestId('step5')).not.toBeInTheDocument();
  });

  it('"Confirmar mesmo assim" avança para a confirmação', async () => {
    await goToInfoStep();

    fireEvent.click(screen.getByRole('button', { name: 'Avançar' }));
    await waitFor(() => screen.getByRole('button', { name: 'Confirmar mesmo assim' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar mesmo assim' }));

    await waitFor(() => expect(screen.getByTestId('step5')).toBeInTheDocument());
  });

  it('"Voltar e corrigir" fecha o popup e mantém o passo de Informações', async () => {
    await goToInfoStep();

    fireEvent.click(screen.getByRole('button', { name: 'Avançar' }));
    await waitFor(() => screen.getByRole('button', { name: 'Voltar e corrigir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar e corrigir' }));

    await waitFor(() =>
      expect(screen.queryByText(/Confirme o preço informado/)).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('step4')).toBeInTheDocument();
  });
});
