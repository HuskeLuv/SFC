// @vitest-environment jsdom
/**
 * Testes de regressão do RedeemAssetWizard — auditoria de resgate 2026-08-06.
 * Cobre o achado #5: erro do backend precisa aparecer na UI (era só logado).
 */
import React, { useEffect } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { RedeemWizardFormData } from '@/types/redeemWizard';

const mockCsrfFetch = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useCsrf', () => ({ useCsrf: () => ({ csrfFetch: mockCsrfFetch }) }));

const mockLoggerError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({
  logger: { error: mockLoggerError, info: vi.fn(), warn: vi.fn() },
}));

interface StubProps {
  onFormDataChange?: (d: Partial<RedeemWizardFormData>) => void;
}

/** stub que preenche o form válido no mount, como os steps reais fariam */
const makeStub = vi.hoisted(
  () => (nome: string) =>
    function StepStub({ onFormDataChange }: { onFormDataChange?: (d: object) => void }) {
      useEffect(() => {
        onFormDataChange?.({
          tipoAtivo: 'renda-fixa',
          instituicaoId: 'inst-1',
          portfolioId: 'port-1',
          dataResgate: '2026-08-01',
          metodoResgate: 'valor',
          valorResgate: 500,
          availableQuantity: 1,
          availableTotal: 1000,
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

// silencia unused-var do tipo auxiliar
void (0 as unknown as StubProps);

// usePriceDeviationWarning (rodada 3) exige QueryClientProvider
const wrapper = createTestQueryWrapper();

describe('Regressão (achado #5) — erro do backend aparece no wizard', () => {
  it('400 "Instituição inválida" é exibido, wizard fica aberto e onSuccess não dispara', async () => {
    mockCsrfFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Instituição inválida para este investimento' }),
    });
    const onSuccess = vi.fn();
    render(<RedeemAssetWizard isOpen onClose={vi.fn()} onSuccess={onSuccess} />, { wrapper });

    // navega até a confirmação (steps stubados já validam tudo)
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Avançar' }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() =>
      expect(screen.getByText('Instituição inválida para este investimento')).toBeInTheDocument(),
    );
    expect(mockLoggerError).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('sucesso limpa o wizard e dispara onSuccess sem mensagem de erro', async () => {
    mockCsrfFetch.mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(<RedeemAssetWizard isOpen onClose={onClose} onSuccess={onSuccess} />, { wrapper });

    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Avançar' }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });
});
