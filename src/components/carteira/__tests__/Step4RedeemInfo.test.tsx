// @vitest-environment jsdom
/**
 * Testes de regressão do Step4RedeemInfo — auditoria de resgate 2026-08-06.
 * Cobrem os achados #2 (método por valor × quantidade fracionária) e #4
 * (inputs decimais com buffer de string).
 */
import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Step4RedeemInfo from '../redeemWizard/Step4RedeemInfo';
import type { RedeemWizardFormData } from '@/types/redeemWizard';

vi.mock('@/components/form/date-picker', () => ({
  default: ({ label }: { label?: string }) => <div>{label}</div>,
}));

// SVGs de @/icons viram string de path em jsdom e quebram o render do Select
vi.mock('@/icons', () => ({ ChevronDownIcon: () => <span /> }));

const baseFormData: RedeemWizardFormData = {
  tipoAtivo: 'criptoativo',
  instituicao: '',
  instituicaoId: 'inst-1',
  ativo: 'BTC',
  portfolioId: 'port-1',
  assetId: 'asset-1',
  stockId: '',
  moeda: 'BRL',
  dataResgate: '2026-08-01',
  metodoResgate: 'quantidade',
  quantidade: 0,
  cotacaoUnitaria: 0,
  valorResgate: 0,
  observacoes: '',
  availableQuantity: 10,
  availableTotal: 1000,
};

/** harness igual ao wizard real: estado controlado com merge parcial */
const Harness: React.FC<{ initial?: Partial<RedeemWizardFormData> }> = ({ initial }) => {
  const [formData, setFormData] = useState<RedeemWizardFormData>({ ...baseFormData, ...initial });
  return (
    <Step4RedeemInfo
      formData={formData}
      errors={{}}
      onFormDataChange={(d) => setFormData((prev) => ({ ...prev, ...d }))}
      onErrorsChange={() => {}}
    />
  );
};

describe('Regressão (achado #4) — Step4 aceita decimais via buffer de string', () => {
  it('o separador decimal sobrevive ao re-render ("32," → "32,5")', () => {
    render(<Harness />);
    const cotacao = document.getElementById('cotacaoUnitaria') as HTMLInputElement;
    fireEvent.change(cotacao, { target: { value: '32,' } });
    expect(cotacao.value).toBe('32,');
    fireEvent.change(cotacao, { target: { value: '32,5' } });
    expect(cotacao.value).toBe('32,5');
  });

  it('quantidade fracionária "0,5" pode ser digitada tecla a tecla', () => {
    render(<Harness />);
    const qtd = document.getElementById('quantidade') as HTMLInputElement;
    fireEvent.change(qtd, { target: { value: '0' } });
    fireEvent.change(qtd, { target: { value: '0,' } });
    expect(qtd.value).toBe('0,'); // buffer preserva o separador
    fireEvent.change(qtd, { target: { value: '0,5' } });
    expect(qtd.value).toBe('0,5');
  });

  it('colar valor pt-BR "1.500,50" é preservado no input', () => {
    render(<Harness initial={{ metodoResgate: 'valor', availableQuantity: 1 }} />);
    const valor = document.getElementById('valorResgate') as HTMLInputElement;
    fireEvent.change(valor, { target: { value: '1.500,50' } });
    expect(valor.value).toBe('1.500,50');
  });

  it('parseDecimalValue interpreta pt-BR corretamente (1.500,50 → 1500.5)', async () => {
    const { parseDecimalValue } = await import('@/components/carteira/wizard/step4Utils');
    expect(parseDecimalValue('1.500,50')).toBe(1500.5);
    expect(parseDecimalValue('0,5')).toBe(0.5);
    expect(parseDecimalValue('32.5')).toBe(32.5);
  });
});

describe('Regressão (achado #2) — "Por valor" só aparece com quantidade exatamente 1', () => {
  it('com 0,5 BTC a opção "Por valor" NÃO aparece (fracionário resgata por quantidade)', () => {
    render(<Harness initial={{ availableQuantity: 0.5, availableTotal: 50000 }} />);
    expect(screen.queryByText('Por valor')).not.toBeInTheDocument();
  });

  it('com quantidade > 1 a opção também não aparece', () => {
    render(<Harness initial={{ availableQuantity: 2 }} />);
    expect(screen.queryByText('Por valor')).not.toBeInTheDocument();
  });

  it('com quantidade 1 (value-based) a opção aparece', () => {
    render(<Harness initial={{ availableQuantity: 1 }} />);
    expect(screen.getByText('Por valor')).toBeInTheDocument();
  });
});

// (o teste do wizard completo está em redeem-wizard-error-probe.test.tsx —
// vi.mock dos steps conflitaria com o import direto do Step4 aqui)
