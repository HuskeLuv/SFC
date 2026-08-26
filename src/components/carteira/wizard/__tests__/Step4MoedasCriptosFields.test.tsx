// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/icons', () => {
  const StubIcon = ({ className }: { className?: string }) => (
    <span data-testid="icon-stub" className={className} />
  );
  return new Proxy(
    {},
    {
      get: () => StubIcon,
    },
  );
});

import Step4MoedasCriptosFields from '../Step4MoedasCriptosFields';
import { DECIMAL_INPUT_PROPS, INTEGER_INPUT_PROPS } from '../step4Utils';
import type { WizardFormData, WizardErrors } from '@/types/wizard';

const buildFormData = (overrides: Partial<WizardFormData> = {}): WizardFormData =>
  ({
    operacao: 'compra',
    tipoAtivo: 'criptoativo',
    instituicao: '',
    instituicaoId: 'inst-1',
    ativo: 'BTC - Bitcoin',
    assetId: 'asset-btc',
    dataCompra: '',
    dataInicio: '',
    dataVencimento: '',
    quantidade: 0,
    cotacaoUnitaria: 0,
    cotacaoCompra: 0,
    cotacaoMoeda: 0,
    valorInvestido: 0,
    valorAplicado: 0,
    taxaCorretagem: 0,
    taxaJurosAnual: 0,
    percentualCDI: 0,
    indexador: '',
    emissor: '',
    emissorId: '',
    periodo: '',
    descricao: '',
    observacoes: '',
    metodo: 'valor',
    moeda: '',
    nomePersonalizado: '',
    precoUnitario: 0,
    cotizacaoResgate: '',
    liquidacaoResgate: '',
    vencimento: '',
    benchmark: '',
    estrategia: '',
    tipoFii: '',
    portfolioId: '',
    dataAporte: '',
    valorAporte: 0,
    availableQuantity: 0,
    availableTotal: 0,
    ...overrides,
  }) as WizardFormData;

const renderFields = (
  variant: 'criptoativo' | 'moeda',
  formDataOverrides: Partial<WizardFormData> = {},
) => {
  const formData = buildFormData(formDataOverrides);
  const errors: WizardErrors = {};
  const handleInputChange = vi.fn();
  render(
    <Step4MoedasCriptosFields
      formData={formData}
      errors={errors}
      handleInputChange={handleInputChange}
      handleDecimalInputChange={() => vi.fn()}
      getDecimalInputValue={() => ''}
      parseDecimalValue={() => null}
      decimalInputProps={DECIMAL_INPUT_PROPS}
      integerInputProps={INTEGER_INPUT_PROPS}
      onFormDataChange={vi.fn()}
      variant={variant}
    />,
  );
  return { handleInputChange };
};

describe('Step4MoedasCriptosFields — flag "dinheiro já estava investido" (F1.10)', () => {
  it('renderiza o ReinvestimentoToggle no variant criptoativo (ticket 26/08: BTC não tinha a opção)', () => {
    renderFields('criptoativo');

    expect(screen.getByLabelText(/Este dinheiro já estava investido\?/i)).toBeInTheDocument();
  });

  it('renderiza o ReinvestimentoToggle no variant moeda', () => {
    renderFields('moeda');

    expect(screen.getByLabelText(/Este dinheiro já estava investido\?/i)).toBeInTheDocument();
  });

  it('propaga o clique do toggle via handleInputChange(isReinvestimento)', () => {
    const { handleInputChange } = renderFields('criptoativo');

    screen.getByLabelText(/Este dinheiro já estava investido\?/i).click();

    expect(handleInputChange).toHaveBeenCalledWith('isReinvestimento', true);
  });
});
