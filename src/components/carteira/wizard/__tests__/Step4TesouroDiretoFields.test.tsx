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

import Step4TesouroDiretoFields from '../Step4TesouroDiretoFields';
import { DECIMAL_INPUT_PROPS, INTEGER_INPUT_PROPS } from '../step4Utils';
import type { WizardFormData, WizardErrors } from '@/types/wizard';

const buildFormData = (overrides: Partial<WizardFormData> = {}): WizardFormData =>
  ({
    operacao: 'compra',
    tipoAtivo: 'tesouro-direto',
    instituicao: '',
    instituicaoId: 'inst-1',
    ativo: '',
    assetId: 'TESOURO-MANUAL',
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

const renderFields = (formDataOverrides: Partial<WizardFormData> = {}) => {
  const formData = buildFormData(formDataOverrides);
  const errors: WizardErrors = {};
  return render(
    <Step4TesouroDiretoFields
      formData={formData}
      errors={errors}
      handleInputChange={vi.fn()}
      handleDecimalInputChange={() => vi.fn()}
      getDecimalInputValue={() => ''}
      parseDecimalValue={() => null}
      decimalInputProps={DECIMAL_INPUT_PROPS}
      integerInputProps={INTEGER_INPUT_PROPS}
      onFormDataChange={vi.fn()}
    />,
  );
};

describe('Step4TesouroDiretoFields — dispatcher', () => {
  it('renderiza campos de Reserva quando tesouroDestino é reserva-emergencia', () => {
    renderFields({ tesouroDestino: 'reserva-emergencia' });

    // Campos exclusivos do branch de reserva
    expect(screen.getByLabelText(/Cot\. Resgate \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Liq\. Resgate \*/i)).toBeInTheDocument();
    // F1.8: "Rentabilidade contratada" substitui o campo Benchmark solto.
    expect(screen.getByText(/Rentabilidade contratada/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/% da rentabilidade/i)).toBeInTheDocument();

    // Campos exclusivos de renda fixa não devem aparecer
    expect(screen.queryByText(/Escolha o tipo de adição/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Descrição \*/i)).not.toBeInTheDocument();
  });

  it('renderiza campos de Renda Fixa quando tesouroDestino é renda-fixa-posfixada', () => {
    renderFields({ tesouroDestino: 'renda-fixa-posfixada' });

    // Campos exclusivos do branch de renda fixa
    expect(screen.getByText(/Escolha o tipo de adição/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Descrição \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Indexador \*/i)).toBeInTheDocument();

    // Campos exclusivos de reserva não devem aparecer
    expect(screen.queryByLabelText(/Cot\. Resgate \*/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rentabilidade contratada/i)).not.toBeInTheDocument();
  });

  it('renderiza fallback (apenas seletor de destino) quando tesouroDestino não foi selecionado', () => {
    renderFields({ tesouroDestino: undefined });

    // O seletor de destino é sempre renderizado
    expect(screen.getByLabelText(/Onde este título deve aparecer \*/i)).toBeInTheDocument();

    // Nenhum dos branches deve aparecer
    expect(screen.queryByLabelText(/Cot\. Resgate \*/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Rentabilidade contratada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Escolha o tipo de adição/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Descrição \*/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Indexador \*/i)).not.toBeInTheDocument();
  });
});
