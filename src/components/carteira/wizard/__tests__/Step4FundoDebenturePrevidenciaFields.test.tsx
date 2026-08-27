// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/icons', () => {
  const StubIcon = ({ className }: { className?: string }) => (
    <span data-testid="icon-stub" className={className} />
  );
  return new Proxy({}, { get: () => StubIcon });
});
vi.mock('../shared/BusinessDayDatePicker', () => ({
  default: ({ label }: { label: string }) => <div>{label}</div>,
}));

const mockUseFundQuotaAt = vi.hoisted(() => vi.fn());
vi.mock('../useFundQuotaAt', () => ({ useFundQuotaAt: mockUseFundQuotaAt }));

import Step4FundoDebenturePrevidenciaFields from '../Step4FundoDebenturePrevidenciaFields';
import { DECIMAL_INPUT_PROPS, INTEGER_INPUT_PROPS, parseDecimalValue } from '../step4Utils';
import type { WizardFormData } from '@/types/wizard';

const buildFormData = (overrides: Partial<WizardFormData> = {}): WizardFormData =>
  ({
    operacao: 'compra',
    tipoAtivo: 'fundo',
    instituicao: '',
    instituicaoId: 'inst-1',
    ativo: 'CVM-12345678000190 - FUNDO TESTE FIM',
    assetId: 'asset-fundo-1',
    assetType: 'fim',
    dataCompra: '2024-06-26',
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
    metodo: 'cotas',
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
    fundoDestino: 'fim',
    tipoFundo: 'fim',
    ...overrides,
  }) as WizardFormData;

const renderFields = (formData: WizardFormData) => {
  const onFormDataChange = vi.fn();
  const handleInputChange = vi.fn();
  render(
    <Step4FundoDebenturePrevidenciaFields
      formData={formData}
      errors={{}}
      handleInputChange={handleInputChange}
      handleDecimalInputChange={() => () => {}}
      getDecimalInputValue={() => ''}
      parseDecimalValue={parseDecimalValue}
      decimalInputProps={DECIMAL_INPUT_PROPS}
      integerInputProps={INTEGER_INPUT_PROPS}
      onFormDataChange={onFormDataChange}
    />,
  );
  return { onFormDataChange, handleInputChange };
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseFundQuotaAt.mockReturnValue({ quota: null, isLoading: false, notFound: false });
});

// Ticket Pedro 27/08/2026: cliente sabe o valor aplicado ("R$ 5 mil pela XP"),
// não a quantidade de cotas — o wizard busca a cota do dia e deriva a quantidade.
describe('Step4FundoDebenturePrevidenciaFields — fundo CVM por valor aplicado', () => {
  it('mostra Valor Aplicado, Cota do Dia e Quantidade (sem o Total calculado)', () => {
    renderFields(buildFormData());
    expect(screen.getByLabelText('Valor Aplicado (R$) *')).toBeInTheDocument();
    expect(screen.getByLabelText('Cota do Dia (R$) *')).toBeInTheDocument();
    expect(screen.getByLabelText('Quantidade de Cotas *')).toBeInTheDocument();
    expect(screen.queryByLabelText('Total Investido (R$)')).not.toBeInTheDocument();
  });

  it('pede a cota via useFundQuotaAt com o ativo e a data de compra', () => {
    renderFields(buildFormData());
    expect(mockUseFundQuotaAt).toHaveBeenCalledWith(
      'CVM-12345678000190 - FUNDO TESTE FIM',
      '2024-06-26',
    );
  });

  it('cota encontrada: preenche a cota e calcula quantidade = valor ÷ cota', () => {
    mockUseFundQuotaAt.mockReturnValue({
      quota: { price: 120, effectiveDate: '2024-06-26' },
      isLoading: false,
      notFound: false,
    });
    const { onFormDataChange } = renderFields(buildFormData({ valorInvestido: 5000 }));
    expect(onFormDataChange).toHaveBeenCalledWith({
      cotacaoUnitaria: 120,
      quantidade: 41.66666667,
    });
    expect(screen.getByLabelText('Cota do Dia (R$) *')).toHaveValue('120');
    expect(screen.getByLabelText('Quantidade de Cotas *')).toHaveValue('41,66666667');
    expect(screen.getByText(/Cota oficial CVM de 26\/06\/2024/)).toBeInTheDocument();
  });

  it('cota de dia anterior (fim de semana) avisa que usou a última disponível', () => {
    mockUseFundQuotaAt.mockReturnValue({
      quota: { price: 100, effectiveDate: '2024-06-21' },
      isLoading: false,
      notFound: false,
    });
    renderFields(buildFormData({ dataCompra: '2024-06-23' }));
    expect(
      screen.getByText(/Última cota CVM disponível antes da data \(21\/06\/2024\)/),
    ).toBeInTheDocument();
  });

  it('digitar o valor aplicado com cota já conhecida recalcula a quantidade', () => {
    const { onFormDataChange } = renderFields(buildFormData({ cotacaoUnitaria: 250 }));
    fireEvent.change(screen.getByLabelText('Valor Aplicado (R$) *'), {
      target: { value: '1.000,00' },
    });
    expect(onFormDataChange).toHaveBeenLastCalledWith({ valorInvestido: 1000, quantidade: 4 });
    expect(screen.getByLabelText('Quantidade de Cotas *')).toHaveValue('4');
  });

  it('ajustar a quantidade manualmente recalcula o valor aplicado', () => {
    const { onFormDataChange } = renderFields(
      buildFormData({ cotacaoUnitaria: 250, valorInvestido: 1000, quantidade: 4 }),
    );
    fireEvent.change(screen.getByLabelText('Quantidade de Cotas *'), { target: { value: '10' } });
    expect(onFormDataChange).toHaveBeenLastCalledWith({ quantidade: 10, valorInvestido: 2500 });
    expect(screen.getByLabelText('Valor Aplicado (R$) *')).toHaveValue('2500');
  });

  it('cota não encontrada: pede a cota manual e, ao digitá-la, calcula a quantidade', () => {
    mockUseFundQuotaAt.mockReturnValue({ quota: null, isLoading: false, notFound: true });
    const { onFormDataChange } = renderFields(buildFormData({ valorInvestido: 5000 }));
    expect(screen.getByText(/Não encontramos a cota da CVM/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cota do Dia (R$) *'), { target: { value: '200' } });
    expect(onFormDataChange).toHaveBeenLastCalledWith({ cotacaoUnitaria: 200, quantidade: 25 });
  });

  it('enquanto busca, o hint informa que está consultando a CVM', () => {
    mockUseFundQuotaAt.mockReturnValue({ quota: null, isLoading: true, notFound: false });
    renderFields(buildFormData());
    expect(screen.getByText(/Buscando a cota do dia na CVM/)).toBeInTheDocument();
  });

  it('fundo MANUAL mantém o fluxo antigo (toggle valor × cotas, Total calculado)', () => {
    renderFields(
      buildFormData({ assetId: 'FUNDO-MANUAL', ativo: 'Meu fundo', assetType: undefined }),
    );
    expect(mockUseFundQuotaAt).toHaveBeenCalledWith(null, null);
    expect(screen.getByLabelText('Preço da Cota (R$) *')).toBeInTheDocument();
    expect(screen.getByLabelText('Total Investido (R$)')).toBeInTheDocument();
  });
});
