// @vitest-environment jsdom
/**
 * Carteira EUA em US$ (fatia FA): o passo 4 do resgate pede a cotação do dólar para Stock EUA
 * (tipo 'acao' com moeda USD) e REIT, sugere a cotação atual e não aparece para os demais.
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Step4RedeemInfo, { resgateExigeCambio } from '../redeemWizard/Step4RedeemInfo';
import type { RedeemWizardFormData } from '@/types/redeemWizard';

vi.mock('@/components/form/date-picker', () => ({
  default: ({ label }: { label?: string }) => <div>{label}</div>,
}));
vi.mock('@/icons', () => ({ ChevronDownIcon: () => <span /> }));

const base: RedeemWizardFormData = {
  tipoAtivo: 'acao',
  instituicao: '',
  instituicaoId: 'inst-1',
  ativo: 'AAPL',
  portfolioId: 'port-1',
  assetId: 'asset-1',
  stockId: '',
  moeda: 'USD',
  dataResgate: '2026-10-20',
  metodoResgate: 'quantidade',
  quantidade: 0,
  cotacaoUnitaria: 0,
  valorResgate: 0,
  observacoes: '',
  availableQuantity: 10,
  availableTotal: 1000,
};

let ultimo: RedeemWizardFormData = base;
const Harness: React.FC<{ initial?: Partial<RedeemWizardFormData> }> = ({ initial }) => {
  const [formData, setFormData] = useState<RedeemWizardFormData>({ ...base, ...initial });
  ultimo = formData;
  return (
    <Step4RedeemInfo
      formData={formData}
      errors={{}}
      onFormDataChange={(d) => setFormData((prev) => ({ ...prev, ...d }))}
      onErrorsChange={() => {}}
    />
  );
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ indicators: { dolar: { price: 5.4321 } } }),
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resgateExigeCambio', () => {
  it('Stock EUA (acao + USD) e REIT sim; ação BR e ETF em dólar não', () => {
    expect(resgateExigeCambio({ tipoAtivo: 'acao', moeda: 'USD' })).toBe(true);
    expect(resgateExigeCambio({ tipoAtivo: 'reit', moeda: 'USD' })).toBe(true);
    expect(resgateExigeCambio({ tipoAtivo: 'acao', moeda: 'BRL' })).toBe(false);
    expect(resgateExigeCambio({ tipoAtivo: 'etf', moeda: 'USD' })).toBe(false);
  });
});

describe('Step4RedeemInfo — câmbio do resgate', () => {
  it('sugere a cotação atual e aceita a da nota de câmbio', async () => {
    render(<Harness />);
    const campo = (await screen.findByLabelText(/Cotação do dólar no dia do resgate/)) as
      | HTMLInputElement
      | undefined;
    await waitFor(() => expect(campo!.value).toBe('5,4321'));
    expect(ultimo.cotacaoMoeda).toBe(5.4321);
    fireEvent.change(campo!, { target: { value: '5,10' } });
    expect(ultimo.cotacaoMoeda).toBe(5.1);
    fireEvent.change(campo!, { target: { value: '' } });
    expect(ultimo.cotacaoMoeda).toBeUndefined();
    expect(screen.getByText('Informe a cotação do dólar (maior que zero).')).toBeInTheDocument();
  });

  it('ação BR: sem o campo de câmbio', () => {
    render(<Harness initial={{ moeda: 'BRL', ativo: 'PETR4' }} />);
    expect(screen.queryByLabelText(/Cotação do dólar no dia do resgate/)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
