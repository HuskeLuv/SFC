// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

// O date picker puxa flatpickr — irrelevante pro campo de valor.
vi.mock('../shared/BusinessDayDatePicker', () => ({
  default: () => <div data-testid="date-picker-stub" />,
}));

import Step4AporteInfo from '../Step4AporteInfo';
import type { WizardFormData, WizardErrors } from '@/types/wizard';

const buildFormData = (overrides: Partial<WizardFormData> = {}): WizardFormData =>
  ({
    operacao: 'aporte',
    tipoAtivo: 'renda-fixa',
    dataAporte: '',
    valorAporte: 0,
    isReinvestimento: false,
    ...overrides,
  }) as WizardFormData;

const renderStep = (formDataOverrides: Partial<WizardFormData> = {}) => {
  const onFormDataChange = vi.fn();
  const errors: WizardErrors = {};
  render(
    <Step4AporteInfo
      formData={buildFormData(formDataOverrides)}
      errors={errors}
      onFormDataChange={onFormDataChange}
      onErrorsChange={vi.fn()}
    />,
  );
  return { onFormDataChange };
};

// Ticket 28/08 (Pedro): não dava pra digitar centavos — input controlado por
// número + parseFloat descartava o separador decimal no re-render ("1013,29"
// virava 101329). O campo agora bufferiza a string e parseia com vírgula/ponto.
describe('Step4AporteInfo — Valor do Aporte aceita centavos', () => {
  it('digitar "1013,29" registra 1013.29 e mantém a vírgula no campo', () => {
    const { onFormDataChange } = renderStep();
    const input = screen.getByLabelText(/Valor do Aporte/i);

    fireEvent.change(input, { target: { value: '1013,29' } });

    expect(onFormDataChange).toHaveBeenLastCalledWith({ valorAporte: 1013.29 });
    expect((input as HTMLInputElement).value).toBe('1013,29');
  });

  it('aceita milhar + vírgula ("1.500,50" → 1500.5)', () => {
    const { onFormDataChange } = renderStep();
    const input = screen.getByLabelText(/Valor do Aporte/i);

    fireEvent.change(input, { target: { value: '1.500,50' } });

    expect(onFormDataChange).toHaveBeenLastCalledWith({ valorAporte: 1500.5 });
  });

  it('aceita decimal com ponto ("1000.5" → 1000.5)', () => {
    const { onFormDataChange } = renderStep();
    const input = screen.getByLabelText(/Valor do Aporte/i);

    fireEvent.change(input, { target: { value: '1000.5' } });

    expect(onFormDataChange).toHaveBeenLastCalledWith({ valorAporte: 1000.5 });
  });

  it('campo vazio zera o valor', () => {
    const { onFormDataChange } = renderStep({ valorAporte: 100 });
    const input = screen.getByLabelText(/Valor do Aporte/i);

    fireEvent.change(input, { target: { value: '' } });

    expect(onFormDataChange).toHaveBeenLastCalledWith({ valorAporte: 0 });
  });

  it('valor pré-existente é exibido com vírgula', () => {
    renderStep({ valorAporte: 407.75 });
    expect((screen.getByLabelText(/Valor do Aporte/i) as HTMLInputElement).value).toBe('407,75');
  });
});
