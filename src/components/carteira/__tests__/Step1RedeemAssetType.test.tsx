// @vitest-environment jsdom
/**
 * Testes de regressão do Step1RedeemAssetType — auditoria de resgate 2026-08-06.
 * Cobre o achado #12: trocar o tipo precisa limpar instituição e método
 * (a instituição do tipo anterior viajava até o POST, que a rejeitava).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Step1RedeemAssetType from '../redeemWizard/Step1RedeemAssetType';
import type { RedeemWizardFormData } from '@/types/redeemWizard';

vi.mock('@/icons', () => ({ ChevronDownIcon: () => <span /> }));
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const formData = {
  tipoAtivo: 'renda-fixa',
  instituicao: 'XP Investimentos',
  instituicaoId: 'inst-xp',
  ativo: 'CDB Banco X',
  portfolioId: 'port-1',
  assetId: 'asset-1',
  stockId: '',
  moeda: 'BRL',
  dataResgate: '2026-08-01',
  metodoResgate: 'valor',
  quantidade: 0,
  cotacaoUnitaria: 0,
  valorResgate: 500,
  observacoes: '',
  availableQuantity: 1,
  availableTotal: 1000,
} as RedeemWizardFormData;

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tipos: [
          { value: 'renda-fixa', label: 'Renda Fixa' },
          { value: 'fundo', label: 'Fundos' },
        ],
      }),
    }),
  );
});

describe('Step1RedeemAssetType', () => {
  it('trocar o tipo limpa instituição, ativo e método de resgate', async () => {
    const onFormDataChange = vi.fn();
    render(
      <Step1RedeemAssetType
        formData={formData}
        errors={{}}
        onFormDataChange={onFormDataChange}
        onErrorsChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('Fundos')).toBeInTheDocument());
    fireEvent.change(document.querySelector('select') as HTMLSelectElement, {
      target: { value: 'fundo' },
    });

    expect(onFormDataChange).toHaveBeenCalledWith(
      expect.objectContaining({
        tipoAtivo: 'fundo',
        instituicao: '',
        instituicaoId: '',
        portfolioId: '',
        metodoResgate: 'quantidade',
        valorResgate: 0,
      }),
    );
  });
});
